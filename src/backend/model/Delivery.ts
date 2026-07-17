import {
	aggregateBytes,
	classifyArtifactOnDisk,
	DELIVERY_ENABLED_KEY,
	DELIVERY_STATE_KEY,
	type DeliveryErrorReason,
	deriveStatus,
	diskPreflight,
	type PersistedArtifactV2,
	type PersistedDeliveryV2,
	parsePersistedDelivery,
	remainingBytes,
	serializePersistedDelivery,
} from "@backend/model/deliveryState";
import { DISK_HEADROOM_BYTES, MODEL_MANIFEST } from "@backend/model/manifest";
import type {
	ArtifactState,
	DeliveryState,
	DeliveryStatus,
	ModelArtifact,
	ModelArtifactKey,
	ModelManifest,
} from "@backend/types";
import {
	DocumentDirectoryPath,
	exists,
	hash,
	mkdir,
	stat,
	unlink,
} from "@dr.pogodin/react-native-fs";
import {
	type BeginHandlerParams,
	completeHandler,
	createDownloadTask,
	type ErrorHandlerParams,
	getExistingDownloadTasks,
	type ProgressHandlerParams,
	setConfig,
} from "@kesha-antonov/react-native-background-downloader";
import { Platform } from "react-native";
import { getFreeDiskStorage } from "react-native-device-info";
import { createMMKV } from "react-native-mmkv";

/**
 * Model delivery v2 (gemma-model-delivery spec, design D11): opt-in, Wi-Fi-only
 * by default, resumable, fail-closed SHA-256-verified acquisition of the three
 * pinned GGUF artifacts (VLM + mmproj + embedder) into `DocumentDir/models/`.
 *
 * The public name and `DeliveryState` contract are preserved so `modelStore`,
 * onboarding, and settings compile against it with import-path rewiring only.
 * Durable state = MMKV JSON snapshot reconciled against the filesystem at
 * `initialize()` — the filesystem always wins.
 */

// Convenience re-exports so call sites can rewire with a single import path.
export {
	aggregateBytes,
	classifyArtifactOnDisk,
	deriveStatus,
	diskPreflight,
	parsePersistedDelivery,
	remainingBytes,
	serializePersistedDelivery,
} from "@backend/model/deliveryState";
export type {
	ArtifactState,
	DeliveryState,
	DeliveryStatus,
} from "@backend/types";

/**
 * Same MMKV store id/encryption key as the legacy tree (`src/services/storage/
 * mmkv.ts`, replicated inline — that tree is dying and MUST NOT be imported).
 * Delivery v2 owns NEW namespaced keys; the legacy opt-in flag is only read
 * once as a seed so a user's earlier "enable AI model" choice carries over.
 */
const storage = createMMKV({
	id: "visara-storage",
	encryptionKey: "visara-encryption-key-2024",
});

/** Legacy opt-in key (`STORAGE_KEYS.MODEL_ENABLED` in the old tree). */
const LEGACY_MODEL_ENABLED_KEY = "model_enabled";

const TASK_ID_PREFIX = "visara-model-v2-";
/** Old executorch-era task ids; any survivor is stopped at initialize(). */
const LEGACY_TASK_ID_PREFIX = "visara-gemma-";

/** Progress emits (and progress persists) are throttled to this interval. */
const PROGRESS_EMIT_INTERVAL_MS = 500;

type DownloadTaskRef = ReturnType<typeof createDownloadTask>;

/** Result of a user-triggered `startDownload()` (spec reason set). */
export type StartDownloadResult =
	| { started: true }
	| {
			started: false;
			reason: "alreadyActive" | "notEnoughSpace" | "alreadyReady";
			message: string;
			/** Populated for `notEnoughSpace` (required vs free surfaced). */
			requiredBytes?: number;
			freeBytes?: number;
	  };

interface InternalArtifact {
	manifest: ModelArtifact;
	bytesDownloaded: number;
	verified: boolean;
	failed: boolean;
	/** stat() facts captured at the last successful digest verification. */
	fileSize: number | undefined;
	fileMtimeMs: number | undefined;
}

/** Absolute directory holding the model artifacts (engines read from here). */
export function getModelDir(): string {
	// Computed fresh each call: the iOS container path can change per launch.
	return `${DocumentDirectoryPath}/models`;
}

/** Absolute target path for one pinned artifact. */
export function getArtifactPath(key: ModelArtifactKey): string {
	const artifact = MODEL_MANIFEST.artifacts.find((a) => a.key === key);
	if (!artifact) {
		throw new Error(`Unknown model artifact key: ${key}`);
	}
	return `${getModelDir()}/${artifact.filename}`;
}

function taskIdFor(key: ModelArtifactKey): string {
	return `${TASK_ID_PREFIX}${key}`;
}

function keyForTaskId(id: string): ModelArtifactKey | null {
	for (const artifact of MODEL_MANIFEST.artifacts) {
		if (taskIdFor(artifact.key) === id) return artifact.key;
	}
	return null;
}

function formatGb(bytes: number): string {
	return (bytes / 1024 ** 3).toFixed(1);
}

export class GemmaModelDeliveryService {
	private static loaded = false;
	private static artifacts = new Map<ModelArtifactKey, InternalArtifact>();
	private static readonly activeTasks = new Map<
		ModelArtifactKey,
		DownloadTaskRef
	>();
	private static readonly verifyingKeys = new Set<ModelArtifactKey>();
	private static paused = false;
	private static errorReason: DeliveryErrorReason | undefined;
	/**
	 * Persisted status honored verbatim between process start and the first
	 * filesystem reconciliation, so pre-`initialize()` subscribers see the
	 * last known status instead of a cold-boot "idle" flap.
	 */
	private static statusOverride: DeliveryStatus | null = null;
	private static readonly listeners = new Set<(state: DeliveryState) => void>();
	private static lastProgressEmitAt = 0;
	private static initPromise: Promise<void> | null = null;

	// --- State access -------------------------------------------------------

	static getState(): DeliveryState {
		return this.snapshot();
	}

	/** The pinned manifest (single version source for enrichment provenance). */
	static getManifest(): ModelManifest {
		return MODEL_MANIFEST;
	}

	/**
	 * Subscribe to state changes; the current state is emitted synchronously
	 * on attach. Returns an unsubscribe function.
	 */
	static subscribe(listener: (state: DeliveryState) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => {
			this.listeners.delete(listener);
		};
	}

	// --- Opt-in flag + readiness ---------------------------------------------

	/** The opt-in flag; defaults to false, seeded once from the legacy key. */
	static isEnabled(): boolean {
		try {
			const v2 = storage.getBoolean(DELIVERY_ENABLED_KEY);
			if (v2 !== undefined) return v2;
			return storage.getBoolean(LEGACY_MODEL_ENABLED_KEY) ?? false;
		} catch (error) {
			console.warn("GemmaModelDeliveryService.isEnabled read failed", error);
			return false;
		}
	}

	/** Persist the opt-in flag and emit. Never starts a transfer by itself. */
	static setEnabled(enabled: boolean): void {
		try {
			storage.set(DELIVERY_ENABLED_KEY, enabled);
		} catch (error) {
			console.warn("GemmaModelDeliveryService.setEnabled write failed", error);
		}
		this.emit();
	}

	/**
	 * True only when the user opted in AND every artifact is digest-verified
	 * on disk (spec "Pinned SHA-256 verification"). The pipeline admission
	 * gate calls this, never the raw flag.
	 */
	static isReady(): boolean {
		this.ensureLoaded();
		return this.isEnabled() && this.allVerified();
	}

	// --- Boot reconciliation (adoptPreplacedFiles ≡ initialize) ---------------

	/**
	 * Reconcile persisted state against on-disk reality and re-attach to any
	 * OS download that survived an app kill. Filesystem wins: files whose size
	 * matches the manifest are adopted — trusted as verified only when the
	 * persisted stamp (size+mtime at verification time) still matches,
	 * otherwise re-hashed (boot-rare; this is also the QA pre-place path:
	 * push files into models/ → initialize() → hash-verify → ready).
	 * Never auto-starts a transfer. Concurrent calls coalesce; sequential
	 * re-runs re-reconcile (dev adoption hook).
	 */
	static initialize(): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this.initPromise = (async () => {
			try {
				await this.reconcile();
			} finally {
				this.initPromise = null;
			}
		})();
		return this.initPromise;
	}

	private static async reconcile(): Promise<void> {
		this.ensureLoaded();
		this.statusOverride = null;
		try {
			await this.ensureModelDir();
			await this.reattachTasks();

			// Classification pass (cheap stats) before any slow hashing.
			const toHash: InternalArtifact[] = [];
			for (const internal of this.artifacts.values()) {
				const key = internal.manifest.key;
				if (this.activeTasks.has(key) || this.verifyingKeys.has(key)) {
					continue;
				}
				const path = this.pathFor(internal);
				const facts = await this.statFile(path);
				const classification = classifyArtifactOnDisk({
					manifestBytes: internal.manifest.bytes,
					file: facts,
					persisted: this.persistedRecordFor(internal),
				});
				switch (classification.kind) {
					case "absent":
						internal.verified = false;
						internal.bytesDownloaded = 0;
						internal.fileSize = undefined;
						internal.fileMtimeMs = undefined;
						break;
					case "partial":
						internal.verified = false;
						internal.bytesDownloaded = classification.bytesDownloaded;
						internal.fileSize = undefined;
						internal.fileMtimeMs = undefined;
						break;
					case "adopt-verified":
						internal.verified = true;
						internal.failed = false;
						internal.bytesDownloaded = internal.manifest.bytes;
						break;
					case "needs-hash":
						internal.verified = false;
						toHash.push(internal);
						break;
				}
			}

			// Streaming re-hash of full-size files without a trustworthy stamp.
			// 3.3 GB takes a while — boot-rare by design (stamps avoid it).
			for (const internal of toHash) {
				await this.hashAndAdopt(internal);
			}

			if (this.allVerified()) {
				this.errorReason = undefined;
			}
		} catch (error) {
			console.warn("GemmaModelDeliveryService.initialize failed", error);
		}
		this.emitAndPersist();
	}

	// --- Acquisition ----------------------------------------------------------

	/**
	 * Begin acquiring all missing artifacts. Explicit user action only.
	 * Wi-Fi-only by default (`allowCellular` opts into metered transfer).
	 */
	static async startDownload(options?: {
		allowCellular?: boolean;
	}): Promise<StartDownloadResult> {
		this.ensureLoaded();
		// A boot reconcile in flight may be about to adopt/verify files —
		// let it settle so we neither double-start nor re-download valid files.
		if (this.initPromise) {
			await this.initPromise;
		}
		this.statusOverride = null;

		if (this.allVerified()) {
			return {
				started: false,
				reason: "alreadyReady",
				message: "The model is already downloaded.",
			};
		}
		if (this.activeTasks.size > 0 || this.verifyingKeys.size > 0) {
			return {
				started: false,
				reason: "alreadyActive",
				message: "A model download is already in progress.",
			};
		}

		// Disk preflight: free space must cover remaining bytes + headroom.
		const free = await this.freeDiskFailOpen();
		if (free !== null) {
			const preflight = diskPreflight(
				free,
				remainingBytes(this.artifactStates()),
				DISK_HEADROOM_BYTES,
			);
			if (!preflight.ok) {
				this.errorReason = "notEnoughSpace";
				this.emitAndPersist();
				return {
					started: false,
					reason: "notEnoughSpace",
					message: `Not enough free space: ${formatGb(preflight.requiredBytes)} GB needed, ${formatGb(free)} GB available.`,
					requiredBytes: preflight.requiredBytes,
					freeBytes: free,
				};
			}
		}

		await this.ensureModelDir();

		const allowCellular = options?.allowCellular === true;
		if (Platform.OS === "ios") {
			// iOS gates cellular at the background-session level.
			try {
				setConfig({
					allowsCellularAccess: allowCellular,
					progressInterval: PROGRESS_EMIT_INTERVAL_MS,
				});
			} catch (error) {
				console.warn("GemmaModelDeliveryService: setConfig failed", error);
			}
		}

		this.paused = false;
		this.errorReason = undefined;

		try {
			for (const internal of this.artifacts.values()) {
				if (internal.verified) continue;
				internal.failed = false;
				internal.bytesDownloaded = 0;
				internal.fileSize = undefined;
				internal.fileMtimeMs = undefined;
				const key = internal.manifest.key;
				const task = createDownloadTask({
					id: taskIdFor(key),
					url: internal.manifest.url,
					destination: this.pathFor(internal),
					// Android gates cellular per task (OS-enforced Wi-Fi-only).
					isAllowedOverMetered: allowCellular,
					isAllowedOverRoaming: allowCellular,
					metadata: { key },
				});
				this.attachHandlers(task, key);
				task.start();
				this.activeTasks.set(key, task);
			}
		} catch (error) {
			console.warn("GemmaModelDeliveryService.startDownload failed", error);
			await this.stopAllTasks();
			this.errorReason = "unknown";
			this.emitAndPersist();
			// Task creation failing is not in the spec's reason set; report the
			// closest closed-set member (legacy did the same).
			return {
				started: false,
				reason: "alreadyActive",
				message: "Failed to start the model download.",
			};
		}

		this.emitAndPersist();
		return { started: true };
	}

	/** Pause the in-flight tasks. */
	static async pause(): Promise<void> {
		this.ensureLoaded();
		this.statusOverride = null;
		for (const task of this.activeTasks.values()) {
			try {
				await task.pause();
			} catch (error) {
				console.warn("GemmaModelDeliveryService.pause task failed", error);
			}
		}
		if (this.activeTasks.size > 0) {
			this.paused = true;
		}
		this.emitAndPersist();
	}

	/** Resume the paused tasks. */
	static async resume(): Promise<void> {
		this.ensureLoaded();
		this.statusOverride = null;
		for (const task of this.activeTasks.values()) {
			try {
				await task.resume();
			} catch (error) {
				console.warn("GemmaModelDeliveryService.resume task failed", error);
			}
		}
		this.paused = false;
		this.emitAndPersist();
	}

	/**
	 * Stop the in-flight tasks and reset unverified artifact progress.
	 * Already-verified artifacts are kept (a later start finishes the set).
	 */
	static async cancel(): Promise<void> {
		this.ensureLoaded();
		this.statusOverride = null;
		await this.stopAllTasks();
		this.paused = false;
		this.errorReason = undefined;
		for (const internal of this.artifacts.values()) {
			if (internal.verified) continue;
			internal.bytesDownloaded = 0;
			internal.failed = false;
		}
		this.emitAndPersist();
	}

	/**
	 * Delete all artifact files and reset state to idle (spec "Delete reclaims
	 * all space"). The opt-in flag is left as-is; `isReady()` turns false
	 * because no artifact remains verified, closing the pipeline gate.
	 */
	static async deleteModel(): Promise<void> {
		this.ensureLoaded();
		this.statusOverride = null;
		await this.stopAllTasks();
		this.paused = false;
		this.errorReason = undefined;
		for (const internal of this.artifacts.values()) {
			await this.safeUnlink(this.pathFor(internal));
			internal.verified = false;
			internal.failed = false;
			internal.bytesDownloaded = 0;
			internal.fileSize = undefined;
			internal.fileMtimeMs = undefined;
		}
		this.emitAndPersist();
	}

	// --- Download handlers ----------------------------------------------------

	private static attachHandlers(
		task: DownloadTaskRef,
		key: ModelArtifactKey,
	): void {
		task
			.begin((params: BeginHandlerParams) => {
				if (this.activeTasks.get(key) !== task) return;
				const internal = this.artifacts.get(key);
				if (!internal) return;
				if (
					params.expectedBytes > 0 &&
					params.expectedBytes !== internal.manifest.bytes
				) {
					// Manifest stays authoritative; verification fails closed anyway.
					console.warn(
						`GemmaModelDeliveryService: ${key} server size ${params.expectedBytes} != pinned ${internal.manifest.bytes}`,
					);
				}
				this.emitThrottled();
			})
			.progress((params: ProgressHandlerParams) => {
				if (this.activeTasks.get(key) !== task) return;
				const internal = this.artifacts.get(key);
				if (!internal) return;
				internal.bytesDownloaded = Math.min(
					params.bytesDownloaded,
					internal.manifest.bytes,
				);
				this.emitThrottled();
			})
			.done(() => {
				if (this.activeTasks.get(key) !== task) return;
				this.activeTasks.delete(key);
				const internal = this.artifacts.get(key);
				if (internal) {
					internal.bytesDownloaded = internal.manifest.bytes;
				}
				if (Platform.OS === "ios") {
					// Required so iOS releases the background URL session.
					try {
						void completeHandler(taskIdFor(key));
					} catch (error) {
						console.warn(
							"GemmaModelDeliveryService: completeHandler failed",
							error,
						);
					}
				}
				if (internal) {
					void this.hashAndAdopt(internal);
				} else {
					this.emitAndPersist();
				}
			})
			.error((params: ErrorHandlerParams) => {
				if (this.activeTasks.get(key) !== task) return;
				this.activeTasks.delete(key);
				const internal = this.artifacts.get(key);
				if (internal) {
					internal.failed = true;
				}
				this.errorReason = "network";
				console.warn(
					`GemmaModelDeliveryService: ${key} download failed (${params.errorCode}): ${params.error}`,
				);
				this.emitAndPersist();
			});
	}

	// --- Verification (fail-closed) --------------------------------------------

	/**
	 * Streaming SHA-256 against the manifest pin. Match → verified + stamp
	 * (size+mtime) persisted for the boot fast-path. Mismatch → file deleted,
	 * artifact failed (retryable), `checksumMismatch` surfaced — never ready.
	 */
	private static async hashAndAdopt(internal: InternalArtifact): Promise<void> {
		const key = internal.manifest.key;
		const path = this.pathFor(internal);
		this.verifyingKeys.add(key);
		this.emit();

		let digest: string | null = null;
		try {
			digest = await hash(path, "sha256");
		} catch (error) {
			console.warn(`GemmaModelDeliveryService: hashing ${key} failed`, error);
		}

		if (
			digest !== null &&
			digest.toLowerCase() === internal.manifest.sha256.toLowerCase()
		) {
			internal.verified = true;
			internal.failed = false;
			internal.bytesDownloaded = internal.manifest.bytes;
			await this.stampVerified(internal, path);
			if (this.allVerified()) {
				this.errorReason = undefined;
			}
		} else if (digest !== null) {
			await this.safeUnlink(path);
			internal.verified = false;
			internal.failed = true;
			internal.bytesDownloaded = 0;
			internal.fileSize = undefined;
			internal.fileMtimeMs = undefined;
			this.errorReason = "checksumMismatch";
		} else {
			// The hash call itself failed. If the file vanished underneath us
			// (deleteModel during a verify), reset silently; else retryable.
			internal.verified = false;
			if (await this.fileExists(path)) {
				internal.failed = true;
				this.errorReason = this.errorReason ?? "unknown";
			} else {
				internal.bytesDownloaded = 0;
				internal.fileSize = undefined;
				internal.fileMtimeMs = undefined;
			}
		}

		this.verifyingKeys.delete(key);
		this.emitAndPersist();
	}

	private static async stampVerified(
		internal: InternalArtifact,
		path: string,
	): Promise<void> {
		try {
			const facts = await stat(path);
			internal.fileSize = facts.size;
			internal.fileMtimeMs = new Date(facts.mtime).getTime();
		} catch (error) {
			// No stamp → next boot re-hashes (correct, just slower).
			internal.fileSize = undefined;
			internal.fileMtimeMs = undefined;
			console.warn(
				"GemmaModelDeliveryService: stat after verification failed",
				error,
			);
		}
	}

	// --- Re-attach --------------------------------------------------------------

	private static async reattachTasks(): Promise<void> {
		let existing: DownloadTaskRef[] = [];
		try {
			existing = await getExistingDownloadTasks();
		} catch (error) {
			console.warn(
				"GemmaModelDeliveryService: getExistingDownloadTasks failed",
				error,
			);
			return;
		}

		let attachedAny = false;
		let allPaused = true;
		for (const task of existing) {
			const key = keyForTaskId(task.id);
			if (key === null) {
				// Ghost task from the dead executorch delivery path: reclaim.
				if (task.id.startsWith(LEGACY_TASK_ID_PREFIX)) {
					void task.stop().catch(() => undefined);
				}
				continue;
			}
			if (this.activeTasks.has(key)) continue;
			const internal = this.artifacts.get(key);
			if (!internal) continue;

			if (task.state === "DONE") {
				// Finished while we were dead; disk reconciliation adopts the file.
				if (Platform.OS === "ios") {
					try {
						void completeHandler(task.id);
					} catch (error) {
						console.warn(
							"GemmaModelDeliveryService: completeHandler failed",
							error,
						);
					}
				}
				continue;
			}
			if (task.state === "FAILED" || task.state === "STOPPED") continue;

			this.attachHandlers(task, key);
			this.activeTasks.set(key, task);
			internal.verified = false;
			internal.failed = false;
			internal.bytesDownloaded = Math.min(
				task.bytesDownloaded,
				internal.manifest.bytes,
			);
			attachedAny = true;
			if (task.state !== "PAUSED") {
				allPaused = false;
			}
		}

		if (attachedAny) {
			this.paused = allPaused;
		}
	}

	// --- Internals ----------------------------------------------------------------

	private static ensureLoaded(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.artifacts = new Map(
			MODEL_MANIFEST.artifacts.map(
				(artifact): [ModelArtifactKey, InternalArtifact] => [
					artifact.key,
					{
						manifest: artifact,
						bytesDownloaded: 0,
						verified: false,
						failed: false,
						fileSize: undefined,
						fileMtimeMs: undefined,
					},
				],
			),
		);

		const persisted = this.readPersistedState();
		if (!persisted) return;
		for (const record of persisted.artifacts) {
			const internal = this.artifacts.get(record.key);
			if (!internal) continue;
			internal.verified = record.verified;
			internal.failed = record.failed;
			internal.bytesDownloaded = record.verified
				? internal.manifest.bytes
				: Math.min(record.bytesDownloaded, internal.manifest.bytes);
			internal.fileSize = record.fileSize;
			internal.fileMtimeMs = record.fileMtimeMs;
		}
		this.errorReason = persisted.errorReason;
		this.statusOverride = persisted.status;
		if (persisted.status === "paused") {
			this.paused = true;
		}
	}

	private static snapshot(): DeliveryState {
		this.ensureLoaded();
		const artifacts = this.artifactStates();
		const { bytesTotal, bytesDownloaded } = aggregateBytes(artifacts);
		const state: DeliveryState = {
			status: this.currentStatus(artifacts),
			enabled: this.isEnabled(),
			artifacts,
			bytesTotal,
			bytesDownloaded,
		};
		if (this.errorReason !== undefined) {
			state.errorReason = this.errorReason;
		}
		return state;
	}

	private static currentStatus(
		artifacts: readonly ArtifactState[],
	): DeliveryStatus {
		return (
			this.statusOverride ??
			deriveStatus({
				artifacts,
				activeTaskCount: this.activeTasks.size,
				paused: this.paused,
				verifying: this.verifyingKeys.size > 0,
			})
		);
	}

	private static artifactStates(): ArtifactState[] {
		this.ensureLoaded();
		const rows: ArtifactState[] = [];
		for (const internal of this.artifacts.values()) {
			rows.push({
				key: internal.manifest.key,
				filename: internal.manifest.filename,
				bytesTotal: internal.manifest.bytes,
				bytesDownloaded: internal.verified
					? internal.manifest.bytes
					: internal.bytesDownloaded,
				verified: internal.verified,
				failed: internal.failed,
			});
		}
		return rows;
	}

	private static persistedRecordFor(
		internal: InternalArtifact,
	): PersistedArtifactV2 {
		const record: PersistedArtifactV2 = {
			key: internal.manifest.key,
			verified: internal.verified,
			failed: internal.failed,
			bytesDownloaded: internal.bytesDownloaded,
		};
		if (internal.fileSize !== undefined) record.fileSize = internal.fileSize;
		if (internal.fileMtimeMs !== undefined) {
			record.fileMtimeMs = internal.fileMtimeMs;
		}
		return record;
	}

	private static allVerified(): boolean {
		this.ensureLoaded();
		if (this.artifacts.size === 0) return false;
		for (const internal of this.artifacts.values()) {
			if (!internal.verified) return false;
		}
		return true;
	}

	private static pathFor(internal: InternalArtifact): string {
		return `${getModelDir()}/${internal.manifest.filename}`;
	}

	/**
	 * Create `models/` idempotently. On iOS, @dr.pogodin/react-native-fs mkdir
	 * applies `NSURLIsExcludedFromBackupKey` (re-asserted on every boot so the
	 * multi-GB artifacts never enter iCloud/iTunes backups).
	 */
	private static async ensureModelDir(): Promise<void> {
		try {
			await mkdir(getModelDir(), { NSURLIsExcludedFromBackupKey: true });
		} catch (error) {
			console.warn("GemmaModelDeliveryService: ensureModelDir failed", error);
		}
	}

	private static async statFile(
		path: string,
	): Promise<{ size: number; mtimeMs: number } | null> {
		try {
			if (!(await exists(path))) return null;
			const facts = await stat(path);
			return { size: facts.size, mtimeMs: new Date(facts.mtime).getTime() };
		} catch (error) {
			console.warn("GemmaModelDeliveryService: stat failed", error);
			return null;
		}
	}

	private static async fileExists(path: string): Promise<boolean> {
		try {
			return await exists(path);
		} catch {
			return false;
		}
	}

	private static async safeUnlink(path: string): Promise<void> {
		try {
			if (await exists(path)) {
				await unlink(path);
			}
		} catch (error) {
			console.warn("GemmaModelDeliveryService: unlink failed", error);
		}
	}

	private static async stopAllTasks(): Promise<void> {
		// Clear first so the stale-handler identity guards drop late events.
		const tasks = Array.from(this.activeTasks.values());
		this.activeTasks.clear();
		for (const task of tasks) {
			try {
				await task.stop();
			} catch (error) {
				console.warn("GemmaModelDeliveryService: task stop failed", error);
			}
		}
	}

	private static async freeDiskFailOpen(): Promise<number | null> {
		try {
			return await getFreeDiskStorage();
		} catch (error) {
			// Fail open: an unreadable sensor never blocks acquisition; a real
			// ENOSPC still surfaces through the task error handler.
			console.warn(
				"GemmaModelDeliveryService: getFreeDiskStorage failed (preflight skipped)",
				error,
			);
			return null;
		}
	}

	// --- Emit + persist -------------------------------------------------------

	private static emit(): void {
		const state = this.snapshot();
		for (const listener of Array.from(this.listeners)) {
			try {
				listener(state);
			} catch (error) {
				console.warn("GemmaModelDeliveryService: listener threw", error);
			}
		}
	}

	/** Progress ticks: emit + persist at most every ~500 ms. */
	private static emitThrottled(): void {
		const now = Date.now();
		if (now - this.lastProgressEmitAt < PROGRESS_EMIT_INTERVAL_MS) return;
		this.lastProgressEmitAt = now;
		this.emit();
		this.persist();
	}

	/** State transitions: emit + persist immediately (resets the throttle). */
	private static emitAndPersist(): void {
		this.lastProgressEmitAt = Date.now();
		this.emit();
		this.persist();
	}

	private static persist(): void {
		this.ensureLoaded();
		const artifacts: PersistedArtifactV2[] = [];
		for (const internal of this.artifacts.values()) {
			artifacts.push(this.persistedRecordFor(internal));
		}
		const persisted: PersistedDeliveryV2 = {
			v: 2,
			status: this.currentStatus(this.artifactStates()),
			artifacts,
		};
		if (this.errorReason !== undefined) {
			persisted.errorReason = this.errorReason;
		}
		try {
			storage.set(DELIVERY_STATE_KEY, serializePersistedDelivery(persisted));
		} catch (error) {
			console.warn("GemmaModelDeliveryService: state write failed", error);
		}
	}

	private static readPersistedState(): PersistedDeliveryV2 | null {
		try {
			return parsePersistedDelivery(storage.getString(DELIVERY_STATE_KEY));
		} catch (error) {
			console.warn("GemmaModelDeliveryService: state read failed", error);
			return null;
		}
	}
}
