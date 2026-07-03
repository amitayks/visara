/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */

import { exists, hash, mkdir, unlink } from "@dr.pogodin/react-native-fs";
import {
	type BeginHandlerParams,
	completeHandler,
	createDownloadTask,
	type DoneHandlerParams,
	type ErrorHandlerParams,
	getExistingDownloadTasks,
	type ProgressHandlerParams,
	setConfig,
} from "@kesha-antonov/react-native-background-downloader";
import {
	type GemmaArtifactRole,
	type GemmaModelManifest,
	type GemmaModelVariant,
	getPteArtifact,
	isDigestPinned,
	resolveGemmaModelManifest,
} from "@services/model/gemmaModelManifest";
import { storage } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { BareResourceFetcher } from "react-native-executorch-bare-resource-fetcher";

/**
 * The delivery state machine (D5). `status` walks
 * `notPresent → queued → downloading → verifying → ready`, with `paused` /
 * `failed` off-ramps. `waitingReason` carries the Wi-Fi/charging "waiting"
 * explanation (the OS withholds the transfer off Wi-Fi; charging is a JS gate)
 * without inventing a new `status`.
 */
export type DeliveryStatus =
	| "notPresent"
	| "queued"
	| "downloading"
	| "paused"
	| "verifying"
	| "ready"
	| "failed";

export interface DeliveryFileState {
	path: string;
	verified: boolean;
}

export interface DeliveryState {
	status: DeliveryStatus;
	variant: GemmaModelVariant;
	modelVersion: string;
	bytesDownloaded: number;
	bytesTotal: number;
	/** Per-source file state, keyed by the remote source URL (D5). */
	files: Record<string, DeliveryFileState>;
	checksumVerified: boolean;
	/** Reason a transfer is "waiting" (Wi-Fi/charging), or `null` when active. */
	waitingReason: string | null;
	updatedAt: number;
	error: string | null;
}

/** Result of a user-triggered `startDownload()`. */
export type StartDownloadResult =
	| { started: true }
	| {
			started: false;
			reason: "alreadyActive" | "notEnoughSpace" | "waitingForCharging";
			message: string;
	  };

type DownloadTaskRef = ReturnType<typeof createDownloadTask>;

const TASK_ID_PREFIX = "visara-gemma-";

/**
 * Headroom above the model size required before a download is allowed to start
 * (D8). Live free-disk check + GiB slack, fail-closed on a confident negative —
 * the same convention as #5's `TIER1_MIN_FREE_DISK_BYTES` (a heavy model must
 * never fill the disk), but a modest additive slack rather than the 6 GiB
 * Tier-1 run floor.
 */
const DELIVERY_DISK_HEADROOM_BYTES = Math.round(1.5 * 1024 * 1024 * 1024);

/** Throttle MMKV progress writes; in-memory emits stay per-event (D5). */
const PROGRESS_PERSIST_INTERVAL_MS = 750;

function taskIdForRole(role: GemmaArtifactRole): string {
	return `${TASK_ID_PREFIX}${role}`;
}

/**
 * Managed, opt-in, Wi-Fi + charging gated, resumable, checksummed delivery of
 * the Gemma-4 E2B model (D1–D11). Drives `@kesha-antonov/react-native-background-downloader`
 * itself, writing each source to the EXACT path `react-native-executorch`
 * expects so a later `useLLM` skips its own fetch, persists a durable state
 * machine in MMKV, verifies integrity fail-closed, and reconciles/re-attaches
 * on boot.
 *
 * ISOLATION (D11): this service imports NO pipeline module — not
 * `ProcessingService`, not `OrchestratorService` (`processNext` /
 * `maybeStartDrain`), not `EngineRegistry`. It registers no engine and enqueues
 * no `tier1_gemma` work. It only EXPOSES delivery state, `isReady()`, the
 * `MODEL_ENABLED` flag, and the `requestReanalysis()` seam.
 */
export class GemmaModelDeliveryService {
	private static currentState: DeliveryState | null = null;
	private static readonly listeners = new Set<(state: DeliveryState) => void>();

	/** In-flight tasks by role (populated by `startDownload` / re-attach). */
	private static readonly activeTasks = new Map<
		GemmaArtifactRole,
		DownloadTaskRef
	>();
	/** Per-file byte progress by role; aggregated into `bytes*` on each tick. */
	private static readonly fileProgress = new Map<
		GemmaArtifactRole,
		{ downloaded: number; total: number }
	>();

	private static lastPersistAt = 0;

	// --- State access ------------------------------------------------------

	/** The current delivery state (memory cache → MMKV → default). */
	static getState(): DeliveryState {
		if (this.currentState) return this.currentState;
		const restored = this.readPersistedState();
		this.currentState = restored ?? this.defaultState();
		return this.currentState;
	}

	/** The resolved manifest for the active platform variant (D7). */
	static getManifest(): GemmaModelManifest {
		return resolveGemmaModelManifest();
	}

	/**
	 * Subscribe to state changes; the current state is emitted immediately.
	 * Returns an unsubscribe function (matches `OrchestratorService.subscribe`).
	 */
	static subscribe(listener: (state: DeliveryState) => void): () => void {
		this.listeners.add(listener);
		listener(this.getState());
		return () => {
			this.listeners.delete(listener);
		};
	}

	// --- Enable flag + readiness (D3/D5) -----------------------------------

	/** The opt-in `MODEL_ENABLED` preference (D3); defaults to `false`. */
	static isEnabled(): boolean {
		try {
			return storage.getBoolean(STORAGE_KEYS.MODEL_ENABLED) ?? false;
		} catch (error) {
			console.warn("GemmaModelDeliveryService.isEnabled read failed", error);
			return false;
		}
	}

	/** Set the opt-in flag. Never starts a download and never alters Tier-0. */
	static setEnabled(enabled: boolean): void {
		try {
			storage.set(STORAGE_KEYS.MODEL_ENABLED, enabled);
			this.emit(this.getState());
		} catch (error) {
			console.warn("GemmaModelDeliveryService.setEnabled write failed", error);
		}
	}

	/**
	 * True only when the user has opted in AND a verified model is present
	 * (D5/D11). A future Tier-1 consumer MUST call this, never the raw flag.
	 */
	static isReady(): boolean {
		const state = this.getState();
		return (
			this.isEnabled() && state.status === "ready" && state.checksumVerified
		);
	}

	// --- Boot reconciliation + re-attach (D5) ------------------------------

	/**
	 * Reconcile persisted state against on-disk reality and re-attach handlers
	 * to any still-running background task. NEVER auto-starts a transfer.
	 * Fully defensive: any failure leaves the app on Tier-0 untouched.
	 */
	static async initialize(): Promise<void> {
		try {
			const manifest = this.getManifest();

			// Re-assert the iOS backup-exclusion flag idempotently (D4).
			await this.ensureCacheDir(manifest.cacheDir);

			// Re-attach to any live OS download surviving an app kill (D5).
			await this.reattachLiveTasks(manifest);

			// If nothing is in flight, reconcile persisted state vs disk truth.
			if (this.activeTasks.size === 0) {
				await this.reconcileOnDisk(manifest);
			}
		} catch (error) {
			console.warn(
				"GemmaModelDeliveryService.initialize failed (Tier-0 unaffected)",
				error,
			);
		}
	}

	// --- Acquisition (D1/D2/D8) --------------------------------------------

	/**
	 * Begin the gated acquisition. Explicit user action only (D3). Pre-flights
	 * free disk (D8), gates on charging fail-open (D2), ensures the
	 * backup-excluded cache dir (D4), then creates one Wi-Fi-only background task
	 * per source writing to RNE's exact path (D1).
	 */
	static async startDownload(): Promise<StartDownloadResult> {
		const state = this.getState();
		if (
			state.status === "downloading" ||
			state.status === "queued" ||
			state.status === "verifying" ||
			this.activeTasks.size > 0
		) {
			return {
				started: false,
				reason: "alreadyActive",
				message: "A download is already in progress.",
			};
		}

		// Optional Android AICore fast-path (D10): satisfies readiness with no
		// download. Defaults off until a native bridge implements the probe.
		if (await this.probeAicoreAvailable()) {
			this.markAicoreReady();
			return { started: true };
		}

		const manifest = this.getManifest();

		// Pre-flight free disk (advisory; a real ENOSPC is caught by `error`).
		const free = await this.getFreeDiskFailOpen();
		if (
			free !== null &&
			free < manifest.expectedBytes + DELIVERY_DISK_HEADROOM_BYTES
		) {
			const message = "Not enough free space to download the model.";
			this.update({ error: message });
			return { started: false, reason: "notEnoughSpace", message };
		}

		// Charging gate (JS, fail-open): a confident "not charging" defers.
		const charging = await this.isChargingFailOpen();
		if (!charging) {
			this.update({
				status: "queued",
				variant: manifest.variant,
				modelVersion: manifest.modelVersion,
				waitingReason: "Waiting for charging",
				error: null,
			});
			return {
				started: false,
				reason: "waitingForCharging",
				message: "Waiting to charge before downloading over Wi-Fi.",
			};
		}

		await this.ensureCacheDir(manifest.cacheDir);

		// iOS: force the background session to Wi-Fi only (D2).
		if (Platform.OS === "ios") {
			try {
				setConfig({ allowsCellularAccess: false });
			} catch (error) {
				console.warn("GemmaModelDeliveryService: setConfig failed", error);
			}
		}

		this.activeTasks.clear();
		this.fileProgress.clear();

		const files: Record<string, DeliveryFileState> = {};
		try {
			for (const artifact of manifest.artifacts) {
				files[artifact.url] = { path: artifact.path, verified: false };
				this.fileProgress.set(artifact.role, { downloaded: 0, total: 0 });

				const task = createDownloadTask({
					id: taskIdForRole(artifact.role),
					url: artifact.url,
					destination: artifact.path,
					// OS-enforced Wi-Fi-only on Android (D2).
					isAllowedOverMetered: false,
					isAllowedOverRoaming: false,
					metadata: { role: artifact.role },
				});
				this.attachHandlers(task, artifact.role, manifest);
				task.start();
				this.activeTasks.set(artifact.role, task);
			}
		} catch (error) {
			console.error("GemmaModelDeliveryService.startDownload failed", error);
			this.update({
				status: "failed",
				error: this.errorText(error),
				waitingReason: null,
			});
			return {
				started: false,
				reason: "alreadyActive",
				message: "Failed to start the download.",
			};
		}

		this.update({
			status: "queued",
			variant: manifest.variant,
			modelVersion: manifest.modelVersion,
			bytesDownloaded: 0,
			bytesTotal: manifest.expectedBytes,
			files,
			checksumVerified: false,
			// The OS withholds bytes off Wi-Fi; cleared when progress flows.
			waitingReason: "Waiting for Wi-Fi",
			error: null,
		});
		return { started: true };
	}

	/** Pause the in-flight tasks (strongest on iOS; D-Risks). */
	static async pause(): Promise<void> {
		for (const task of this.activeTasks.values()) {
			try {
				await task.pause();
			} catch (error) {
				console.warn("GemmaModelDeliveryService.pause task failed", error);
			}
		}
		this.update({ status: "paused", waitingReason: null });
	}

	/** Resume the paused tasks. */
	static async resume(): Promise<void> {
		for (const task of this.activeTasks.values()) {
			try {
				await task.resume();
			} catch (error) {
				console.warn("GemmaModelDeliveryService.resume task failed", error);
			}
		}
		this.update({ status: "downloading", waitingReason: null });
	}

	/** Cancel the in-flight tasks and reset toward `notPresent`. */
	static async cancel(): Promise<void> {
		for (const task of this.activeTasks.values()) {
			try {
				await task.stop();
			} catch (error) {
				console.warn("GemmaModelDeliveryService.cancel task failed", error);
			}
		}
		this.activeTasks.clear();
		this.fileProgress.clear();
		this.update({
			status: "notPresent",
			bytesDownloaded: 0,
			bytesTotal: 0,
			waitingReason: null,
			error: null,
		});
	}

	/**
	 * Delete the downloaded files to reclaim space and return to `notPresent`
	 * (D8). Uses `RNFS.unlink` per artifact path (decoupled + robust).
	 */
	static async deleteModel(): Promise<void> {
		await this.cancelSilently();
		const manifest = this.getManifest();
		for (const artifact of manifest.artifacts) {
			try {
				if (await exists(artifact.path)) {
					await unlink(artifact.path);
				}
			} catch (error) {
				console.warn(
					"GemmaModelDeliveryService.deleteModel unlink failed",
					error,
				);
			}
		}
		this.activeTasks.clear();
		this.fileProgress.clear();
		this.update({
			status: "notPresent",
			bytesDownloaded: 0,
			bytesTotal: 0,
			checksumVerified: false,
			files: {},
			waitingReason: null,
			error: null,
		});
	}

	/**
	 * EXPOSED SEAM (D8/D11). A later Tier-1 change consumes this to re-enqueue
	 * work once a Gemma drain exists. In this change it deliberately does
	 * NOTHING to the pipeline: no `tier1_gemma` enqueue, no Tier-0 change.
	 */
	static requestReanalysis(): void {
		console.log(
			"[GemmaModelDeliveryService] requestReanalysis: no Tier-1 drain wired (seam only)",
		);
	}

	/**
	 * Detected Android AICore / Gemini-Nano availability (D10). Defaults to
	 * `false` until a native capability bridge implements it; when `true`, the
	 * service selects the `aicore` variant and skips the download.
	 */
	static async probeAicoreAvailable(): Promise<boolean> {
		return false;
	}

	// --- Download handlers -------------------------------------------------

	private static attachHandlers(
		task: DownloadTaskRef,
		role: GemmaArtifactRole,
		manifest: GemmaModelManifest,
	): void {
		task
			.begin((params: BeginHandlerParams) => {
				this.fileProgress.set(role, {
					downloaded: 0,
					total: params.expectedBytes,
				});
				this.onActiveTick(manifest);
			})
			.progress((params: ProgressHandlerParams) => {
				this.fileProgress.set(role, {
					downloaded: params.bytesDownloaded,
					total: params.bytesTotal,
				});
				this.onActiveTick(manifest, true);
			})
			.done((params: DoneHandlerParams) => {
				this.fileProgress.set(role, {
					downloaded: params.bytesTotal,
					total: params.bytesTotal,
				});
				// Required so iOS releases the background session (RNE's own path).
				if (Platform.OS === "ios") {
					try {
						void completeHandler(taskIdForRole(role));
					} catch (error) {
						console.warn(
							"GemmaModelDeliveryService: completeHandler failed",
							error,
						);
					}
				}
				this.activeTasks.delete(role);
				void this.onFileDone(manifest);
			})
			.error((params: ErrorHandlerParams) => {
				this.activeTasks.delete(role);
				this.update({
					status: "failed",
					waitingReason: null,
					error: `${role}: ${params.error}`,
				});
			});
	}

	/** Fold per-file progress into aggregate bytes and advance status. */
	private static onActiveTick(
		manifest: GemmaModelManifest,
		throttle = false,
	): void {
		const { downloaded, total } = this.aggregateProgress();
		const state = this.getState();
		const status: DeliveryStatus =
			state.status === "paused" ? "paused" : "downloading";
		this.update(
			{
				status,
				variant: manifest.variant,
				modelVersion: manifest.modelVersion,
				bytesDownloaded: downloaded,
				bytesTotal: total > 0 ? total : manifest.expectedBytes,
				waitingReason: null,
			},
			throttle,
		);
	}

	private static async onFileDone(manifest: GemmaModelManifest): Promise<void> {
		if (!(await this.allArtifactsExist(manifest))) {
			// Still waiting on other files; reflect progress so far.
			this.onActiveTick(manifest);
			return;
		}
		await this.verifyAndFinalize(manifest);
	}

	// --- Integrity verification, fail-closed (D6) --------------------------

	/**
	 * Verify the `.pte` with a native streaming SHA-256 and finalize. Fail
	 * closed: a mismatch deletes the file and refuses `ready`. When the expected
	 * digest is still the POC placeholder, the model is held short of `ready`
	 * (NON-destructively) rather than deleted — the real digest is pinned later.
	 */
	private static async verifyAndFinalize(
		manifest: GemmaModelManifest,
	): Promise<void> {
		this.update({ status: "verifying", waitingReason: null });

		if (!(await this.allArtifactsExist(manifest))) {
			this.update({
				status: "failed",
				error: "Required model files are missing after download.",
			});
			return;
		}

		const pte = getPteArtifact(manifest);
		if (!pte) {
			// No `.pte` to hash (e.g. AICore): treat presence as ready.
			this.markFilesVerified(manifest, true);
			this.update({ status: "ready", checksumVerified: true, error: null });
			return;
		}

		let actual: string;
		try {
			actual = await hash(pte.path, "sha256");
		} catch (error) {
			this.update({
				status: "failed",
				checksumVerified: false,
				error: `Integrity hash failed: ${this.errorText(error)}`,
			});
			return;
		}

		if (!isDigestPinned(manifest)) {
			// (POC-DEPENDENT) No pinned reference digest yet. Do NOT delete a
			// downloaded-but-unverifiable file; hold at `verifying`, never `ready`.
			// The computed digest is logged so the POC can pin it (tasks.md 7.4).
			console.log(
				`[GemmaModelDeliveryService] computed .pte sha256 (pin this): ${actual}`,
			);
			this.markFilesVerified(manifest, false);
			this.update({
				status: "verifying",
				checksumVerified: false,
				error: null,
			});
			return;
		}

		if (actual === manifest.expectedSha256) {
			this.markFilesVerified(manifest, true);
			this.update({ status: "ready", checksumVerified: true, error: null });
			return;
		}

		// Mismatch → delete the corrupt file and fail closed.
		try {
			await unlink(pte.path);
		} catch (error) {
			console.warn(
				"GemmaModelDeliveryService: unlink after mismatch failed",
				error,
			);
		}
		this.update({
			status: "failed",
			checksumVerified: false,
			error: "Integrity check failed: checksum mismatch. The file was removed.",
		});
	}

	// --- Reconciliation internals ------------------------------------------

	private static async reattachLiveTasks(
		manifest: GemmaModelManifest,
	): Promise<void> {
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

		this.activeTasks.clear();
		for (const artifact of manifest.artifacts) {
			const id = taskIdForRole(artifact.role);
			const task = existing.find((candidate) => candidate.id === id);
			if (!task) continue;
			this.attachHandlers(task, artifact.role, manifest);
			this.activeTasks.set(artifact.role, task);
			this.fileProgress.set(artifact.role, {
				downloaded: task.bytesDownloaded ?? 0,
				total: task.bytesTotal ?? 0,
			});
		}

		if (this.activeTasks.size > 0) {
			this.onActiveTick(manifest);
		}
	}

	private static async reconcileOnDisk(
		manifest: GemmaModelManifest,
	): Promise<void> {
		const persisted = this.getState();
		const allExist = await this.allArtifactsExist(manifest);

		// A `.pte` present on disk per the bare fetcher's own inventory (D5).
		let pteOnDisk = false;
		const pte = getPteArtifact(manifest);
		try {
			const downloaded = await BareResourceFetcher.listDownloadedModels();
			if (pte) {
				pteOnDisk = downloaded.some((path) => path.endsWith(pte.filename));
			}
		} catch (error) {
			console.warn(
				"GemmaModelDeliveryService: listDownloadedModels failed",
				error,
			);
		}

		if (persisted.status === "ready") {
			if (!allExist) {
				// Stale ready that lost its file → back to notPresent.
				this.update({
					status: "notPresent",
					checksumVerified: false,
					bytesDownloaded: 0,
					bytesTotal: 0,
					waitingReason: null,
					error: null,
				});
			}
			return;
		}

		// Adopt a complete-but-unrecorded set (orphan from a prior run) and
		// verify it lazily. Do not re-verify a prior `failed` (avoid a loop).
		if (allExist && (pteOnDisk || !pte) && persisted.status !== "failed") {
			await this.verifyAndFinalize(manifest);
			return;
		}

		// An interrupted transfer with no live task and incomplete files: reset
		// so the UI offers Download again (never auto-start).
		if (
			!allExist &&
			(persisted.status === "downloading" ||
				persisted.status === "queued" ||
				persisted.status === "paused")
		) {
			this.update({
				status: "notPresent",
				bytesDownloaded: 0,
				bytesTotal: 0,
				waitingReason: null,
				error: null,
			});
		}
	}

	// --- Helpers -----------------------------------------------------------

	private static markAicoreReady(): void {
		this.update({
			status: "ready",
			variant: "aicore",
			bytesDownloaded: 0,
			bytesTotal: 0,
			checksumVerified: true,
			files: {},
			waitingReason: null,
			error: null,
		});
	}

	private static markFilesVerified(
		manifest: GemmaModelManifest,
		verified: boolean,
	): void {
		const files: Record<string, DeliveryFileState> = {};
		for (const artifact of manifest.artifacts) {
			files[artifact.url] = {
				path: artifact.path,
				verified: artifact.isPte ? verified : true,
			};
		}
		this.update({ files });
	}

	private static aggregateProgress(): { downloaded: number; total: number } {
		let downloaded = 0;
		let total = 0;
		for (const entry of this.fileProgress.values()) {
			downloaded += entry.downloaded;
			total += entry.total;
		}
		return { downloaded, total };
	}

	private static async allArtifactsExist(
		manifest: GemmaModelManifest,
	): Promise<boolean> {
		if (manifest.artifacts.length === 0) return true;
		for (const artifact of manifest.artifacts) {
			try {
				if (!(await exists(artifact.path))) return false;
			} catch (error) {
				console.warn("GemmaModelDeliveryService: exists check failed", error);
				return false;
			}
		}
		return true;
	}

	/**
	 * Create the RNE cache dir with iOS backup exclusion BEFORE any transfer
	 * (D4), idempotently re-asserting the flag. Ignored off iOS.
	 */
	private static async ensureCacheDir(dir: string): Promise<void> {
		try {
			await mkdir(dir, { NSURLIsExcludedFromBackupKey: true });
		} catch (error) {
			console.warn(
				"GemmaModelDeliveryService: ensureCacheDir failed (continuing)",
				error,
			);
		}
	}

	private static async isChargingFailOpen(): Promise<boolean> {
		try {
			return await DeviceInfo.isBatteryCharging();
		} catch (error) {
			// Fail open: an unreadable sensor never permanently blocks acquisition.
			console.warn(
				"GemmaModelDeliveryService: isBatteryCharging failed (fail-open)",
				error,
			);
			return true;
		}
	}

	private static async getFreeDiskFailOpen(): Promise<number | null> {
		try {
			return await DeviceInfo.getFreeDiskStorage();
		} catch (error) {
			console.warn(
				"GemmaModelDeliveryService: getFreeDiskStorage failed (advisory skip)",
				error,
			);
			return null;
		}
	}

	private static async cancelSilently(): Promise<void> {
		for (const task of this.activeTasks.values()) {
			try {
				await task.stop();
			} catch {
				// Best-effort teardown before delete; ignore.
			}
		}
	}

	private static errorText(error: unknown): string {
		if (error instanceof Error) return error.message || String(error);
		return String(error);
	}

	// --- Persistence (throttled) -------------------------------------------

	private static update(patch: Partial<DeliveryState>, throttle = false): void {
		const base = this.getState();
		const next: DeliveryState = {
			...base,
			...patch,
			updatedAt: Date.now(),
		};
		this.currentState = next;
		this.emit(next);

		const now = Date.now();
		if (throttle && now - this.lastPersistAt < PROGRESS_PERSIST_INTERVAL_MS) {
			return;
		}
		this.lastPersistAt = now;
		this.writePersistedState(next);
	}

	private static emit(state: DeliveryState): void {
		for (const listener of Array.from(this.listeners)) {
			try {
				listener(state);
			} catch (error) {
				console.warn("GemmaModelDeliveryService: listener threw", error);
			}
		}
	}

	private static defaultState(): DeliveryState {
		const manifest = this.getManifest();
		return {
			status: "notPresent",
			variant: manifest.variant,
			modelVersion: manifest.modelVersion,
			bytesDownloaded: 0,
			bytesTotal: 0,
			files: {},
			checksumVerified: false,
			waitingReason: null,
			updatedAt: 0,
			error: null,
		};
	}

	private static readPersistedState(): DeliveryState | null {
		try {
			const json = storage.getString(STORAGE_KEYS.MODEL_DELIVERY_STATE);
			if (!json) return null;
			return JSON.parse(json) as DeliveryState;
		} catch (error) {
			console.warn("GemmaModelDeliveryService: state read failed", error);
			return null;
		}
	}

	private static writePersistedState(state: DeliveryState): void {
		try {
			storage.set(STORAGE_KEYS.MODEL_DELIVERY_STATE, JSON.stringify(state));
		} catch (error) {
			console.warn("GemmaModelDeliveryService: state write failed", error);
		}
	}
}
