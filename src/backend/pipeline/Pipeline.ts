import type {
	EnrichmentRepoContract,
	InvalidationBus,
	MediaRepoContract,
	SyncStateContract,
	VectorRepoContract,
} from "@backend/contracts";
import { EMBEDDER_VERSION, MODEL_VERSION } from "@backend/model/manifest";
import type {
	DeliveryState,
	EmbedEngine,
	MediaRow,
	PauseReason,
	PipelineEvent,
	PipelineSettings,
	PipelineSnapshot,
	VisionEngine,
} from "@backend/types";
import type {
	Spec as ThermalObserverSpec,
	ThermalStatePayload,
} from "@native-modules/NativeThermalObserver";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
	AppState,
	type AppStateStatus,
	NativeEventEmitter,
	Platform,
	TurboModuleRegistry,
} from "react-native";
import BackgroundService from "react-native-background-actions";
import DeviceInfo from "react-native-device-info";
import { canRunVlm, evaluateGates, type GateInputs } from "./gates";

/**
 * The single enrichment drain (processing-pipeline spec, design D9/D10):
 * row-status state machine over `media` (no queue table, no MMKV
 * checkpoints), admission gates between items, inline embedding, vector
 * backfill at drain end, preserved OrchestratorEvent union for the UI.
 *
 * Platform execution: Android runs the loop inside the
 * react-native-background-actions dataSync FGS (its own progress
 * notification); iOS runs a plain async loop with expo-keep-awake held while
 * actively draining and settles the in-flight item on backgrounding.
 */

// --- Tunables ------------------------------------------------------------------

/** Poll cadence while paused, waiting for gates to admit again. */
const GATE_POLL_MS = 5000;
/** Small breather between items (parity with the legacy drain delay). */
const ITEM_DELAY_MS = 100;
/** retry_count budget: item fails permanently at >= 2 (spec). */
const MAX_RETRIES = 2;
/** Vector backfill page size per missingOrStale() round. */
const BACKFILL_BATCH = 200;
/** expo-keep-awake tag for the iOS active-drain hold. */
const KEEP_AWAKE_TAG = "pipeline";
/** ThermalObserver event name (kept module contract). */
const THERMAL_EVENT = "thermal_state_change";
/** VLM context is force-released at critical (3), not merely serious (D10). */
const THERMAL_CRITICAL_LEVEL = 3;

// --- Injected seams --------------------------------------------------------------

/** The delivery surface the admission gate needs (gemma-model-delivery). */
export interface DeliveryGate {
	isReady(): boolean;
	subscribe(listener: (state: DeliveryState) => void): () => void;
}

export type LibrarySyncGateEvent = Extract<
	PipelineEvent,
	{ type: "scan-progress" } | { type: "discovery-complete" }
>;

/** The LibrarySync surface the pipeline consumes (library-discovery-first). */
export interface LibrarySyncGate {
	isDiscoveryComplete(): boolean;
	subscribe(listener: (event: LibrarySyncGateEvent) => void): () => void;
}

/**
 * ImagePrep seam (matches media/ImagePrep.ts exactly — inject the module's
 * two functions). `toInferenceJpeg` resolves null on preparation failure;
 * the pipeline marks the item failed without invoking the model (D3).
 */
export interface ImagePrepContract {
	toInferenceJpeg(sourceUri: string): Promise<string | null>;
	/** Delete a temp file produced by toInferenceJpeg (never throws). */
	cleanupInferenceTemp(path: string): Promise<void>;
}

/** Cached-thermal seam; the default wraps the ThermalObserver TurboModule. */
export interface ThermalSource {
	/** Normalized 0..3; MUST resolve (fail-open 0 on any error). */
	read(): Promise<number>;
	subscribe(listener: (level: number) => void): () => void;
}

export interface PowerSample {
	/** 0..1 fraction (fail-open 1). */
	batteryLevel: number;
	charging: boolean;
}

/**
 * Platform execution host for the drain loop. Android: dataSync FGS via
 * react-native-background-actions with per-item notification progress. iOS:
 * keep-awake held while actively draining, released on pause/stop.
 */
export interface PlatformRunner {
	/** Execute the loop in the platform host. */
	run(loop: () => Promise<void>): Promise<void>;
	/** Stop the host (idempotent; safe when never started). */
	stop(): Promise<void>;
	updateProgress(processed: number, total: number): Promise<void>;
	notifyPaused(reason: PauseReason): Promise<void>;
	notifyResumed(): Promise<void>;
	/** False once the OS/host tore the service down (treated as a pause). */
	shouldContinue(): boolean;
}

export interface PipelineDeps {
	mediaRepo: MediaRepoContract;
	enrichmentRepo: EnrichmentRepoContract;
	vectorRepo: VectorRepoContract;
	syncStateService?: SyncStateContract;
	/** VisionEngine factory — created lazily at first drained item (D10). */
	vision: () => VisionEngine;
	/** EmbedEngine factory — resident once created; shared with search (D4). */
	embed: () => EmbedEngine;
	delivery: DeliveryGate;
	librarySync: LibrarySyncGate;
	imagePrep: ImagePrepContract;
	/** Optional: media invalidations re-kick an idle pipeline (live photos). */
	bus?: InvalidationBus;
	/** Override the ThermalObserver-backed default (tests). */
	thermal?: ThermalSource;
	/** Override the device-info battery read (tests). */
	readPower?: () => Promise<PowerSample>;
	/** Override the device-info total-memory read (tests). */
	readTotalMemBytes?: () => Promise<number>;
	/** Override the platform runner (tests). */
	runner?: PlatformRunner;
	/** Provenance stamp; defaults to the pinned manifest MODEL_VERSION. */
	modelVersion?: string;
	/** Vector provenance; defaults to the pinned manifest EMBEDDER_VERSION. */
	embedderVersion?: string;
	/** Gate config seeded at configure; updateSettings() replaces it. */
	initialSettings?: PipelineSettings;
	/** Clock override for the night window (tests). */
	now?: () => Date;
}

// --- Default gate-input providers --------------------------------------------------

function clampThermalLevel(level: unknown): number {
	if (typeof level !== "number" || Number.isNaN(level)) return 0;
	return Math.min(3, Math.max(0, Math.trunc(level)));
}

/**
 * Cached-thermal source over the kept ThermalObserver TurboModule. Resolved
 * lazily via TurboModuleRegistry.get (never getEnforcing, never at module
 * scope) and fail-open everywhere: absent module or throwing read → nominal.
 */
function createDefaultThermalSource(): ThermalSource {
	let module: ThermalObserverSpec | null = null;
	try {
		module = TurboModuleRegistry.get<ThermalObserverSpec>("ThermalObserver");
	} catch {
		module = null;
	}
	return {
		async read(): Promise<number> {
			if (!module) return 0;
			try {
				const payload = await module.getThermalState();
				return clampThermalLevel(payload.level);
			} catch (error) {
				console.warn("[Pipeline] thermal read failed (fail-open 0)", error);
				return 0;
			}
		},
		subscribe(listener: (level: number) => void): () => void {
			if (!module) return () => {};
			try {
				const emitter = new NativeEventEmitter(
					module as unknown as ConstructorParameters<
						typeof NativeEventEmitter
					>[0],
				);
				const sub = emitter.addListener(
					THERMAL_EVENT,
					(payload: ThermalStatePayload) => {
						listener(clampThermalLevel(payload?.level));
					},
				);
				return () => sub.remove();
			} catch (error) {
				console.warn("[Pipeline] thermal subscribe failed (fail-open)", error);
				return () => {};
			}
		},
	};
}

/** Battery snapshot; fail-open full+charging (never wedges the drain). */
async function readPowerDefault(): Promise<PowerSample> {
	try {
		const [level, charging] = await Promise.all([
			DeviceInfo.getBatteryLevel(),
			DeviceInfo.isBatteryCharging(),
		]);
		// Simulators/emulators can report -1; treat unknown as full.
		return { batteryLevel: level < 0 ? 1 : level, charging };
	} catch (error) {
		console.warn("[Pipeline] battery read failed (fail-open)", error);
		return { batteryLevel: 1, charging: true };
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// --- Platform runners ----------------------------------------------------------------

function buildAndroidTaskOptions(snapshot: PipelineSnapshot) {
	return {
		taskName: "VisaraProcessing",
		taskTitle: "Visara",
		taskDesc: "Processing your library",
		taskIcon: { name: "visara_launcher", type: "mipmap" },
		// Must match the dataSync FGS type declared in AndroidManifest.xml.
		foregroundServiceType: ["dataSync" as const],
		color: "#FF6347",
		progressBar: {
			max: Math.max(snapshot.total, 1),
			value: snapshot.processed,
			indeterminate: snapshot.total === 0,
		},
	};
}

class AndroidBackgroundRunner implements PlatformRunner {
	/** Latched once the service reports running (start() resolve race guard). */
	private sawRunning = false;

	constructor(private readonly snapshot: () => PipelineSnapshot) {}

	async run(loop: () => Promise<void>): Promise<void> {
		// The lib auto-stops the service when the task function resolves.
		await BackgroundService.start(async () => {
			try {
				await loop();
			} catch (error) {
				console.warn("[Pipeline] Android drain task crashed", error);
			}
		}, buildAndroidTaskOptions(this.snapshot()));
	}

	async stop(): Promise<void> {
		try {
			if (BackgroundService.isRunning()) {
				await BackgroundService.stop();
			}
		} catch (error) {
			console.warn("[Pipeline] Android service stop failed", error);
		}
	}

	async updateProgress(processed: number, total: number): Promise<void> {
		if (!BackgroundService.isRunning()) return;
		const percentage = total > 0 ? Math.floor((processed / total) * 100) : 0;
		try {
			await BackgroundService.updateNotification({
				taskDesc: `Processing ${processed} of ${total} (${percentage}%)`,
				progressBar: {
					max: Math.max(total, 1),
					value: processed,
					indeterminate: false,
				},
			});
		} catch (error) {
			console.warn("[Pipeline] notification update failed", error);
		}
	}

	async notifyPaused(reason: PauseReason): Promise<void> {
		if (!BackgroundService.isRunning()) return;
		try {
			await BackgroundService.updateNotification({
				taskDesc: `Processing paused (${reason})`,
			});
		} catch (error) {
			console.warn("[Pipeline] notification update failed", error);
		}
	}

	async notifyResumed(): Promise<void> {
		if (!BackgroundService.isRunning()) return;
		try {
			await BackgroundService.updateNotification({
				taskDesc: "Processing your library",
			});
		} catch (error) {
			console.warn("[Pipeline] notification update failed", error);
		}
	}

	shouldContinue(): boolean {
		// start() resolves slightly after the headless task begins; never kill
		// the loop before the service has been observed running once.
		if (!this.sawRunning) {
			this.sawRunning = BackgroundService.isRunning();
			return true;
		}
		return BackgroundService.isRunning();
	}
}

class IosKeepAwakeRunner implements PlatformRunner {
	private stopped = false;

	async run(loop: () => Promise<void>): Promise<void> {
		await this.activate();
		try {
			await loop();
		} finally {
			await this.deactivate();
		}
	}

	async stop(): Promise<void> {
		this.stopped = true;
		await this.deactivate();
	}

	async updateProgress(_processed: number, _total: number): Promise<void> {
		// No notification surface on iOS; progress flows through events only.
	}

	async notifyPaused(_reason: PauseReason): Promise<void> {
		// Keep-awake is only held while ACTIVELY draining (spec).
		await this.deactivate();
	}

	async notifyResumed(): Promise<void> {
		if (!this.stopped) await this.activate();
	}

	shouldContinue(): boolean {
		return true;
	}

	private async activate(): Promise<void> {
		try {
			await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
		} catch (error) {
			console.warn("[Pipeline] keep-awake activate failed", error);
		}
	}

	private async deactivate(): Promise<void> {
		try {
			await deactivateKeepAwake(KEEP_AWAKE_TAG);
		} catch (error) {
			console.warn("[Pipeline] keep-awake deactivate failed", error);
		}
	}
}

// --- Pipeline ---------------------------------------------------------------------------

/**
 * All-static drain (sibling-service pattern, ported emitter/snapshot seam
 * from the legacy OrchestratorService). `configure()` injects everything;
 * `subscribe`/`getSnapshot` keep the exact UI contract.
 */
export class Pipeline {
	private static deps: PipelineDeps | null = null;
	private static listeners = new Set<(event: PipelineEvent) => void>();
	private static configureCleanup: (() => void)[] = [];

	// Drain state ------------------------------------------------------------
	private static running = false;
	private static stopRequested = false;
	private static manualPause = false;
	private static manualStopped = false;
	private static paused = false;
	private static pauseReason: PauseReason | null = null;

	// Counters (row-status derived at start, maintained per item) -------------
	private static processed = 0;
	private static failed = 0;
	private static total = 0;

	// Gate inputs (cached) -----------------------------------------------------
	private static settings: PipelineSettings = {
		batterySaverEnabled: false,
		nightProcessingEnabled: false,
	};
	private static thermalLevel = 0;
	private static totalMemBytes: number | null = null;
	private static appStateActive = true;
	private static thermalSource: ThermalSource | null = null;

	// Engines / host ---------------------------------------------------------------
	private static visionInstance: VisionEngine | null = null;
	private static embedInstance: EmbedEngine | null = null;
	private static runner: PlatformRunner | null = null;
	private static wakeSignal: (() => void) | null = null;

	// --- Observer API (preserved contract) ---------------------------------------

	static subscribe(listener: (event: PipelineEvent) => void): () => void {
		Pipeline.listeners.add(listener);
		return () => {
			Pipeline.listeners.delete(listener);
		};
	}

	static getSnapshot(): PipelineSnapshot {
		return {
			processed: Pipeline.processed,
			total: Pipeline.total,
			failed: Pipeline.failed,
			isRunning: Pipeline.running,
			isPaused: Pipeline.paused,
		};
	}

	/** The current pause reason (null when not paused). Extra accessor — the
	 * event union stays exactly the preserved OrchestratorEvent shape. */
	static getPauseReason(): PauseReason | null {
		return Pipeline.pauseReason;
	}

	private static emit(event: PipelineEvent): void {
		for (const listener of Array.from(Pipeline.listeners)) {
			try {
				listener(event);
			} catch (error) {
				console.warn("[Pipeline] listener failed", error);
			}
		}
	}

	// --- Configuration -----------------------------------------------------------

	/**
	 * Inject dependencies + attach long-lived subscriptions: LibrarySync
	 * event forwarding (scan-progress / discovery-complete flow through THIS
	 * emitter — the bootstrap holds exactly one Pipeline.subscribe), delivery
	 * wake, cached thermal, AppState, and the optional media-bus re-kick.
	 */
	static configure(deps: PipelineDeps): void {
		for (const cleanup of Pipeline.configureCleanup) cleanup();
		Pipeline.configureCleanup = [];
		Pipeline.deps = deps;
		if (deps.initialSettings) {
			Pipeline.settings = { ...deps.initialSettings };
		}

		Pipeline.configureCleanup.push(
			deps.librarySync.subscribe((event) => {
				Pipeline.emit(event);
				if (event.type === "discovery-complete") {
					Pipeline.wake();
					// start() now bails until there is admissible work, so nudge it
					// once discovery is done (it no-ops if not yet ready).
					void Pipeline.maybeAutoResume();
				}
			}),
		);

		Pipeline.configureCleanup.push(
			deps.delivery.subscribe(() => {
				Pipeline.wake();
				// Model just became ready (or was deleted) — (re)start if there is
				// pending work; this is what lets the drain begin AFTER a download
				// completes without an FGS having been spun up on cold boot.
				void Pipeline.maybeAutoResume();
			}),
		);

		const thermal = deps.thermal ?? createDefaultThermalSource();
		Pipeline.thermalSource = thermal;
		Pipeline.configureCleanup.push(
			thermal.subscribe((level) => Pipeline.onThermalLevel(level)),
		);

		Pipeline.appStateActive =
			AppState.currentState == null || AppState.currentState === "active";
		const appStateSub = AppState.addEventListener(
			"change",
			(next: AppStateStatus) => {
				Pipeline.appStateActive = next === "active";
				Pipeline.wake();
				if (next === "active") void Pipeline.maybeAutoResume();
			},
		);
		Pipeline.configureCleanup.push(() => appStateSub.remove());

		if (deps.bus) {
			Pipeline.configureCleanup.push(
				deps.bus.watch(["media"], () => {
					void Pipeline.maybeAutoResume();
				}),
			);
		}
	}

	// --- Lifecycle ------------------------------------------------------------------

	/**
	 * Idempotent start: crash-recover stale `processing` rows, derive totals
	 * from row counts, then run the drain loop inside the platform host.
	 * Never rejects — failures log, unwind, and leave the pipeline stopped.
	 */
	static async start(): Promise<void> {
		const deps = Pipeline.deps;
		if (!deps) {
			console.warn("[Pipeline] start() before configure() — ignored");
			return;
		}
		if (Pipeline.running) return;

		// Do not spin up the drain host until there is admissible work. On
		// Android the host is a react-native-background-actions FOREGROUND
		// SERVICE; starting an FGS only to sit paused (no model yet, discovery
		// not done, or nothing pending) is rejected/churned by strict OEM builds
		// (ColorOS / Android 12+ — ForegroundServiceStartNotAllowed + a "No task
		// registered" sticky-restart loop) and can take the JS engine down with
		// it. The delivery / app-state / media subscriptions re-invoke start via
		// maybeAutoResume() the moment conditions change (e.g. model ready).
		if (!deps.delivery.isReady() || !deps.librarySync.isDiscoveryComplete()) {
			return;
		}
		try {
			if ((await deps.mediaRepo.pendingCount()) === 0) return;
		} catch (error) {
			console.warn("[Pipeline] start(): pending check failed", error);
			return;
		}

		Pipeline.running = true;
		Pipeline.stopRequested = false;
		Pipeline.manualStopped = false;
		Pipeline.paused = false;
		Pipeline.pauseReason = null;
		Pipeline.emit({ type: "started" });

		try {
			await deps.mediaRepo.resetStaleProcessing();
			await Pipeline.refreshTotals();
			if (Pipeline.totalMemBytes === null) {
				Pipeline.totalMemBytes = await Pipeline.readTotalMem();
			}
			if (Pipeline.thermalSource) {
				Pipeline.thermalLevel = clampThermalLevel(
					await Pipeline.thermalSource.read(),
				);
			}

			const runner =
				deps.runner ??
				(Platform.OS === "android"
					? new AndroidBackgroundRunner(() => Pipeline.getSnapshot())
					: new IosKeepAwakeRunner());
			Pipeline.runner = runner;

			// Android: run() resolves once the FGS is up (loop continues inside
			// the headless task). iOS: run() resolves when the loop finishes.
			runner
				.run(() => Pipeline.drainLoop())
				.catch(async (error) => {
					console.warn("[Pipeline] platform runner failed", error);
					await Pipeline.teardownRun();
				});
		} catch (error) {
			console.warn("[Pipeline] start failed", error);
			await Pipeline.teardownRun();
		}
	}

	/** Halt after the in-flight item; emits `paused` immediately for UI snap. */
	static pause(): void {
		if (Pipeline.manualPause) return;
		Pipeline.manualPause = true;
		if (Pipeline.running && !Pipeline.paused) {
			Pipeline.paused = true;
			Pipeline.pauseReason = "manual";
			Pipeline.emit({ type: "paused" });
			void Pipeline.runner?.notifyPaused("manual");
		}
		Pipeline.wake();
	}

	/** Re-enter the drain; `resumed` is emitted when gates actually admit. */
	static resume(): void {
		Pipeline.manualPause = false;
		Pipeline.manualStopped = false;
		if (!Pipeline.running) {
			if (Pipeline.deps) void Pipeline.start();
			return;
		}
		Pipeline.wake();
	}

	/** Halt, release the VLM context, stop the platform host. Idempotent. */
	static async stop(): Promise<void> {
		Pipeline.manualStopped = true;
		Pipeline.stopRequested = true;
		Pipeline.manualPause = false;
		Pipeline.wake();
		if (!Pipeline.running) {
			// Loop not active — make sure engine/host are truly released.
			await Pipeline.releaseVision();
			const runner = Pipeline.runner;
			Pipeline.runner = null;
			if (runner) await runner.stop();
		}
	}

	/**
	 * One status sweep: rows with stale model_version or `failed` flip back to
	 * `pending` (retry_count reset by the repo), then the drain runs/continues.
	 * Safe mid-drain — the running loop simply sees more pending rows.
	 */
	static async reprocess(): Promise<void> {
		const deps = Pipeline.deps;
		if (!deps) return;
		try {
			await deps.mediaRepo.sweepForReprocess(Pipeline.modelVersion());
		} catch (error) {
			console.warn("[Pipeline] reprocess sweep failed", error);
			return;
		}
		if (Pipeline.running) {
			await Pipeline.refreshTotals();
			Pipeline.emit({
				type: "progress",
				processed: Pipeline.processed,
				total: Pipeline.total,
				failed: Pipeline.failed,
			});
			Pipeline.wake();
		} else {
			await Pipeline.start();
		}
	}

	/** Gate config from settingsStore; applies at the next between-item check. */
	static updateSettings(settings: PipelineSettings): void {
		Pipeline.settings = { ...settings };
		Pipeline.wake();
	}

	// --- Drain loop -----------------------------------------------------------------

	private static async drainLoop(): Promise<void> {
		const deps = Pipeline.requireDeps();
		try {
			while (true) {
				if (Pipeline.shouldExitLoop()) break;

				const inputs = await Pipeline.collectGateInputs();

				// Capability is skip-all, never a pause (D10) — but only after
				// discovery so the full row set is known.
				if (inputs.discoveryComplete && !canRunVlm(inputs.totalMemBytes)) {
					await Pipeline.skipAllPending();
					Pipeline.emit({ type: "completed" });
					break;
				}

				const verdict = evaluateGates(inputs);
				if (!verdict.admit) {
					await Pipeline.enterPausedState(verdict.reason ?? "manual");
					await Pipeline.waitForWake(GATE_POLL_MS);
					continue;
				}
				await Pipeline.exitPausedState();

				const row = await deps.mediaRepo.nextPending();
				if (!row) {
					await Pipeline.vectorBackfill();
					const pendingNow = await deps.mediaRepo.pendingCount();
					if (pendingNow > 0) continue; // live additions during backfill
					Pipeline.emit({ type: "completed" });
					break;
				}

				await Pipeline.processOne(row);
				await Pipeline.waitForWake(ITEM_DELAY_MS);
			}
		} catch (error) {
			console.warn("[Pipeline] drain loop error", error);
		} finally {
			await Pipeline.teardownRun();
		}
	}

	/** One item: mark → prep → analyze → persist(+FTS+provenance, one tx in
	 * the repo) → inline embed (tolerated) → events; failures budget-retry. */
	private static async processOne(row: MediaRow): Promise<void> {
		const deps = Pipeline.requireDeps();
		let preparedPath: string | null = null;
		try {
			await deps.mediaRepo.markProcessing(row.id);
			preparedPath = await deps.imagePrep.toInferenceJpeg(row.uri);
			if (!preparedPath) {
				await Pipeline.recordFailure(row, "image preparation failed");
			} else {
				const vision = Pipeline.getVision();
				const analysis = await vision.analyze(preparedPath);
				if (analysis.ok && analysis.result) {
					await deps.enrichmentRepo.saveResult(
						row.id,
						analysis.result,
						Pipeline.modelVersion(),
						analysis.durationMs,
					);
					await Pipeline.embedInline(row.id);
					Pipeline.processed += 1;
					Pipeline.emit({
						type: "item-processed",
						mediaFileId: row.id,
						filename: row.filename,
					});
				} else {
					await Pipeline.recordFailure(
						row,
						analysis.error ?? "analysis failed",
					);
				}
			}
		} catch (error) {
			await Pipeline.recordFailure(row, errorMessage(error));
		} finally {
			if (preparedPath) {
				try {
					await deps.imagePrep.cleanupInferenceTemp(preparedPath);
				} catch (error) {
					console.warn("[Pipeline] temp cleanup failed", error);
				}
			}
		}

		await Pipeline.refreshRemainingTotal();
		Pipeline.emit({
			type: "progress",
			processed: Pipeline.processed,
			total: Pipeline.total,
			failed: Pipeline.failed,
			currentFileName: row.filename,
		});
		await Pipeline.runner?.updateProgress(Pipeline.processed, Pipeline.total);
	}

	/** markFailed handles retry bookkeeping; count only permanent failures. */
	private static async recordFailure(
		row: MediaRow,
		error: string,
	): Promise<void> {
		const deps = Pipeline.requireDeps();
		try {
			await deps.mediaRepo.markFailed(row.id, error, MAX_RETRIES);
			const after = await deps.mediaRepo.byId(row.id);
			if (!after || after.enrichStatus === "failed") {
				Pipeline.failed += 1;
			}
		} catch (persistError) {
			console.warn("[Pipeline] markFailed persist failed", persistError);
			Pipeline.failed += 1;
		}
		Pipeline.emit({
			type: "item-failed",
			mediaFileId: row.id,
			filename: row.filename,
			error,
		});
	}

	/** Inline per-item embedding — search improves photo by photo (D4).
	 * Every failure is tolerated; the backfill pass sweeps stragglers. */
	private static async embedInline(mediaId: string): Promise<void> {
		const deps = Pipeline.requireDeps();
		try {
			const text = await deps.enrichmentRepo.embeddingTextFor(mediaId);
			if (!text) return;
			const vector = await Pipeline.getEmbed().embedDoc(text);
			if (!vector) return;
			await deps.vectorRepo.upsert(mediaId, vector, Pipeline.embedderVersion());
		} catch (error) {
			console.warn("[Pipeline] inline embed failed (tolerated)", error);
		}
	}

	/** Enriched rows missing (or stale-version) vectors, embedded in pages. */
	private static async vectorBackfill(): Promise<void> {
		const deps = Pipeline.requireDeps();
		while (!Pipeline.stopRequested) {
			let ids: string[];
			try {
				ids = await deps.vectorRepo.missingOrStale(
					Pipeline.embedderVersion(),
					BACKFILL_BATCH,
				);
			} catch (error) {
				console.warn("[Pipeline] vector backfill query failed", error);
				return;
			}
			if (ids.length === 0) return;
			let progressed = 0;
			for (const id of ids) {
				if (Pipeline.stopRequested) return;
				try {
					const text = await deps.enrichmentRepo.embeddingTextFor(id);
					if (!text) continue;
					const vector = await Pipeline.getEmbed().embedDoc(text);
					if (!vector) continue;
					await deps.vectorRepo.upsert(id, vector, Pipeline.embedderVersion());
					progressed += 1;
				} catch (error) {
					console.warn("[Pipeline] backfill embed failed (tolerated)", error);
				}
			}
			// A page with zero successes would repeat forever — bail out.
			if (progressed === 0) return;
		}
	}

	/** Low-RAM path (D10): everything pending becomes `skipped`, then the
	 * pipeline reports idle-complete. Discovery/lexical search stay fully on. */
	private static async skipAllPending(): Promise<void> {
		const deps = Pipeline.requireDeps();
		while (!Pipeline.stopRequested) {
			const row = await deps.mediaRepo.nextPending();
			if (!row) return;
			await deps.mediaRepo.markSkipped([row.id]);
		}
	}

	// --- Pause machinery ---------------------------------------------------------------

	private static async enterPausedState(reason: PauseReason): Promise<void> {
		Pipeline.pauseReason = reason;
		if (Pipeline.paused) return; // paused emitted once per episode
		Pipeline.paused = true;
		Pipeline.emit({ type: "paused" });
		await Pipeline.runner?.notifyPaused(reason);
		if (reason === "backgrounded") {
			// iOS background transition: in-flight already settled (we are
			// between items), now release the VLM within the grace window.
			await Pipeline.releaseVision();
		}
	}

	private static async exitPausedState(): Promise<void> {
		if (!Pipeline.paused) return;
		Pipeline.paused = false;
		Pipeline.pauseReason = null;
		Pipeline.emit({ type: "resumed" });
		await Pipeline.runner?.notifyResumed();
	}

	private static shouldExitLoop(): boolean {
		if (Pipeline.stopRequested) return true;
		const runner = Pipeline.runner;
		if (runner && !runner.shouldContinue()) return true; // OS tore host down
		return false;
	}

	/** Interruptible sleep: stop/resume/settings/thermal/appstate wake it. */
	private static waitForWake(ms: number): Promise<void> {
		return new Promise<void>((resolve) => {
			let settled = false;
			const finish = (): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (Pipeline.wakeSignal === finish) Pipeline.wakeSignal = null;
				resolve();
			};
			const timer = setTimeout(finish, ms);
			Pipeline.wakeSignal = finish;
		});
	}

	private static wake(): void {
		Pipeline.wakeSignal?.();
	}

	// --- Engines ------------------------------------------------------------------------

	private static getVision(): VisionEngine {
		if (!Pipeline.visionInstance) {
			Pipeline.visionInstance = Pipeline.requireDeps().vision();
		}
		return Pipeline.visionInstance;
	}

	private static getEmbed(): EmbedEngine {
		if (!Pipeline.embedInstance) {
			Pipeline.embedInstance = Pipeline.requireDeps().embed();
		}
		return Pipeline.embedInstance;
	}

	/** Release the VLM context (stop / backgrounded / thermal critical). The
	 * embedder is deliberately NOT disposed — it is resident and shared with
	 * query-time search (D4/D10). */
	private static async releaseVision(): Promise<void> {
		const vision = Pipeline.visionInstance;
		Pipeline.visionInstance = null;
		if (!vision) return;
		try {
			await vision.dispose();
		} catch (error) {
			console.warn("[Pipeline] vision release failed", error);
		}
	}

	// --- Gate inputs ---------------------------------------------------------------------

	private static onThermalLevel(level: number): void {
		Pipeline.thermalLevel = clampThermalLevel(level);
		if (Pipeline.thermalLevel >= THERMAL_CRITICAL_LEVEL) {
			// Critical: do not wait for the between-item check (D10).
			void Pipeline.releaseVision();
		}
		Pipeline.wake();
	}

	private static async collectGateInputs(): Promise<GateInputs> {
		const deps = Pipeline.requireDeps();
		const power = deps.readPower
			? await deps.readPower()
			: await readPowerDefault();
		// Refresh the thermal level from a live read on every gate evaluation
		// (between items AND during the 5 s pause poll). The event-driven cache
		// alone can latch a stale level — e.g. a hot reading taken right after
		// the model download — and leave the drain paused long after the device
		// cooled, because no further thermal-change event arrives to clear it.
		// The event path (onThermalLevel) still drives the critical fast-release.
		if (Pipeline.thermalSource) {
			try {
				Pipeline.thermalLevel = clampThermalLevel(
					await Pipeline.thermalSource.read(),
				);
			} catch (error) {
				console.warn("[Pipeline] thermal read failed (using cached)", error);
			}
		}
		return {
			discoveryComplete: deps.librarySync.isDiscoveryComplete(),
			deliveryReady: deps.delivery.isReady(),
			totalMemBytes: Pipeline.totalMemBytes ?? Number.MAX_SAFE_INTEGER,
			thermalLevel: Pipeline.thermalLevel,
			batteryLevel: power.batteryLevel,
			charging: power.charging,
			settings: { ...Pipeline.settings },
			manualPause: Pipeline.manualPause,
			hourOfDay: (deps.now ? deps.now() : new Date()).getHours(),
			// Android's FGS drains while backgrounded by design; only iOS
			// foreground state feeds the gate.
			appActive: Platform.OS === "ios" ? Pipeline.appStateActive : true,
		};
	}

	private static async readTotalMem(): Promise<number> {
		const reader = Pipeline.deps?.readTotalMemBytes;
		try {
			return reader ? await reader() : await DeviceInfo.getTotalMemory();
		} catch (error) {
			// Fail toward capable: skip-all is effectively irreversible, an OOM
			// risk is recoverable. getTotalMemory in practice never throws.
			console.warn("[Pipeline] total memory read failed (fail-open)", error);
			return Number.MAX_SAFE_INTEGER;
		}
	}

	// --- Totals ------------------------------------------------------------------------------

	private static async refreshTotals(): Promise<void> {
		const deps = Pipeline.requireDeps();
		const [pending, done, failed] = await Promise.all([
			deps.mediaRepo.pendingCount(),
			deps.mediaRepo.doneCount(),
			deps.mediaRepo.failedCount(),
		]);
		Pipeline.processed = done;
		Pipeline.failed = failed;
		Pipeline.total = done + failed + pending;
	}

	/** Keep `total` honest as live additions land mid-drain. */
	private static async refreshRemainingTotal(): Promise<void> {
		try {
			const pending = await Pipeline.requireDeps().mediaRepo.pendingCount();
			Pipeline.total = Pipeline.processed + Pipeline.failed + pending;
		} catch (error) {
			console.warn("[Pipeline] total refresh failed", error);
		}
	}

	// --- Teardown / restart ----------------------------------------------------------------

	private static async teardownRun(): Promise<void> {
		Pipeline.running = false;
		Pipeline.paused = false;
		Pipeline.pauseReason = null;
		await Pipeline.releaseVision();
		const runner = Pipeline.runner;
		Pipeline.runner = null;
		if (runner) await runner.stop();
	}

	/** Re-kick an idle (not manually stopped) pipeline when new work appears
	 * — live photos after `completed`, or app returning to foreground. */
	private static async maybeAutoResume(): Promise<void> {
		const deps = Pipeline.deps;
		if (!deps) return;
		if (Pipeline.running || Pipeline.manualStopped || Pipeline.manualPause) {
			return;
		}
		if (!deps.librarySync.isDiscoveryComplete() || !deps.delivery.isReady()) {
			return;
		}
		try {
			const pending = await deps.mediaRepo.pendingCount();
			if (pending > 0) await Pipeline.start();
		} catch (error) {
			console.warn("[Pipeline] auto-resume check failed", error);
		}
	}

	// --- Internals -----------------------------------------------------------------------------

	private static modelVersion(): string {
		return Pipeline.deps?.modelVersion ?? MODEL_VERSION;
	}

	private static embedderVersion(): string {
		return Pipeline.deps?.embedderVersion ?? EMBEDDER_VERSION;
	}

	private static requireDeps(): PipelineDeps {
		const deps = Pipeline.deps;
		if (!deps) {
			throw new Error("[Pipeline] configure(deps) must be called first");
		}
		return deps;
	}
}
