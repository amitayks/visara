/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import type { MediaFile } from "@models/MediaFile";
import type { MediaChange } from "@native-modules/NativeMediaObserver";
import {
	type BackgroundTaskOptions,
	BackgroundTaskService,
} from "@services/background/BackgroundTaskService";
import { AppSettingsRepository } from "@services/database/AppSettingsRepository";
import { EmbeddingRepository } from "@services/database/EmbeddingRepository";
import {
	MediaFileRepository,
	type ProcessingProvenance,
	TIER0_SCHEMA_VERSION,
	TIER1_SCHEMA_VERSION,
} from "@services/database/MediaFileRepository";
import { ProcessingQueueRepository } from "@services/database/ProcessingQueueRepository";
import { DeviceCapabilityService } from "@services/device/DeviceCapabilityService";
import {
	type DiscoveredMedia,
	MediaDiscoveryService,
} from "@services/media/MediaDiscoveryService";
import { EmbeddingService } from "@services/ml/EmbeddingService";
import { EngineRegistry } from "@services/ml/engines/EngineRegistry";
import { ProcessingService } from "@services/ml/ProcessingService";
import { GemmaModelDeliveryService } from "@services/model/GemmaModelDeliveryService";
import {
	LibraryReprocessingService,
	type PriorEnrichment,
} from "@services/orchestrator/LibraryReprocessingService";
import { SearchService } from "@services/search/SearchService";
import { SemanticSearchService } from "@services/search/SemanticSearchService";

/** Tier-0 analysis stream (ML Kit). */
const TIER0_TASK_TYPE = "tier0_mlkit";

/**
 * Tier-1 multimodal (Gemma) stream. Drained by
 * {@link OrchestratorService.processTier1Next} — gated + selective — and
 * enqueued by `LibraryReprocessingService` (mirrors its `TIER1_TASK_TYPE`).
 */
const TIER1_TASK_TYPE = "tier1_gemma";

/**
 * The independent embedding stream (design D8) — the `task_type` the archived
 * `processing-queue-tiers` spec reserves as an example. Drained at no higher
 * priority than Tier-0 so a fresh library is browsable and lexically searchable
 * before it is fully embedded.
 */
const EMBEDDING_TASK_TYPE = "embedding";

/** Throttle for the live media observer, ms. */
const OBSERVER_THROTTLE_MS = 2000;

/**
 * Framework-agnostic events emitted by the pipeline. A closed discriminated
 * union — every field is typed (no `any`). The React bridge maps these onto
 * `ProcessingContext` dispatches.
 */
export type OrchestratorEvent =
	| { type: "started" }
	| { type: "scan-progress"; discovered: number; total: number }
	| { type: "item-processed"; mediaFileId: string; filename: string }
	| {
			type: "item-failed";
			mediaFileId: string;
			filename: string;
			error: string;
	  }
	| {
			type: "progress";
			processed: number;
			total: number;
			failed: number;
			currentFileName?: string;
	  }
	| { type: "paused" }
	| { type: "resumed" }
	| { type: "completed" };

export interface OrchestratorSnapshot {
	processed: number;
	total: number;
	failed: number;
	isRunning: boolean;
	isPaused: boolean;
}

/**
 * The single connective hub of the processing pipeline:
 * discovery -> upsert -> enqueue -> analyze -> persist -> incremental search
 * -> progress -> gallery. All-static (matches every sibling service) and
 * framework-agnostic (no React import) so it can run inside the background
 * task loop. Idempotent and resumable: dedupe by `uri`, a version-aware skip
 * guard, a durable SQLite queue, and stale-`processing` crash recovery.
 */
export class OrchestratorService {
	private static readonly MAX_RETRIES = 1;

	private static initialized = false;
	private static scanning = false;

	private static processed = 0;
	private static failed = 0;
	private static total = 0;

	private static listeners = new Set<(event: OrchestratorEvent) => void>();

	// --- Observer API (D9) -------------------------------------------------

	static subscribe(listener: (event: OrchestratorEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private static emit(event: OrchestratorEvent): void {
		for (const listener of Array.from(this.listeners)) {
			listener(event);
		}
	}

	static getSnapshot(): OrchestratorSnapshot {
		return {
			processed: this.processed,
			total: this.total,
			failed: this.failed,
			isRunning: this.scanning || BackgroundTaskService.isTaskRunning(),
			isPaused: BackgroundTaskService.isTaskPaused(),
		};
	}

	// --- Lifecycle ---------------------------------------------------------

	/**
	 * One-time boot: load the background checkpoint/settings, hydrate the
	 * search index, recover any row stranded in `processing` after a crash,
	 * and restore progress counters. Guarded against double-init.
	 */
	static async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		await BackgroundTaskService.initialize();
		await SearchService.loadIndex();
		await SemanticSearchService.loadIndex();
		await ProcessingQueueRepository.resetStaleProcessing();

		const checkpoint = BackgroundTaskService.getCheckpoint();
		this.processed = checkpoint.totalProcessed;
		this.failed = checkpoint.totalFailed;
		await this.recomputeTotal();

		// Resume an interrupted model-version-aware reprocess sweep (change #10)
		// from its MMKV cursor, so a kill mid-sweep continues enqueuing on next
		// launch. No-op when no sweep is pending.
		await LibraryReprocessingService.resumeIfPending();
	}

	/**
	 * Trigger entry (D3): run the foreground discovery scan (native with a
	 * CameraRoll/RNFS fallback), enqueue a Tier-0 row per unprocessed file,
	 * then hand the durable drain to `BackgroundTaskService`. Idempotent:
	 * early-returns while a scan or drain is already running.
	 */
	static async runInitialProcessing(): Promise<void> {
		if (this.scanning || BackgroundTaskService.isTaskRunning()) return;

		this.scanning = true;
		this.emit({ type: "started" });
		try {
			await this.runScan();
		} finally {
			this.scanning = false;
		}

		await this.recomputeTotal();

		const pending = await ProcessingQueueRepository.countByStatus("pending");
		if (pending === 0) {
			this.emit({ type: "completed" });
			return;
		}
		await this.maybeStartDrain();
	}

	/**
	 * Fold live/observer batches in incrementally: upsert + enqueue new or
	 * modified media, remove deleted media, then kick the drain if idle.
	 */
	static async enqueueDiscovered(changes: MediaChange[]): Promise<void> {
		await this.ingestChanges(changes);
		await this.recomputeTotal();
		await this.maybeStartDrain();
	}

	static async pause(): Promise<void> {
		await BackgroundTaskService.pause();
		this.emit({ type: "paused" });
	}

	static async resume(): Promise<void> {
		await BackgroundTaskService.resume();
		this.emit({ type: "resumed" });
	}

	static async stop(): Promise<void> {
		await BackgroundTaskService.stop();
	}

	// --- The single-item drain (D4) ----------------------------------------

	/**
	 * Process exactly one pending `tier0_mlkit` item so the background loop
	 * keeps gating (battery/night) between items. Returns `false` when the
	 * tier is drained (the caller then stops the background service).
	 */
	static async processNext(): Promise<boolean> {
		const queue =
			await ProcessingQueueRepository.getNextPendingByTaskType(TIER0_TASK_TYPE);
		if (!queue) {
			this.emit({ type: "completed" });
			return false;
		}

		await ProcessingQueueRepository.markAsProcessing(queue);

		const media = await MediaFileRepository.findById(queue.mediaFileId);
		if (!media) {
			// Orphan row (media deleted); complete it and move on.
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		const provenance = this.getTargetProvenance();

		// Version-aware idempotency skip (D5): don't redo work already done by
		// this engine/model. A newer model (change #10) will not match here.
		if (
			media.processedAt != null &&
			media.aiModelVersion === provenance.modelVersion &&
			(queue.modelVersion == null ||
				queue.modelVersion === provenance.modelVersion)
		) {
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		// Engine seam (change #2): resolves, never rejects, with success flag.
		const result = await ProcessingService.processMedia(media.uri);

		if (result.success) {
			await MediaFileRepository.updateWithProcessingResult(
				media,
				result,
				provenance,
			);
			await SearchService.addToIndex(media.id);
			await this.enqueueEmbedding(media.id);
			await ProcessingQueueRepository.markAsCompleted(queue);
			await BackgroundTaskService.setLastProcessedId(queue.id);
			await BackgroundTaskService.incrementProcessed();
			this.processed += 1;
			this.emit({
				type: "item-processed",
				mediaFileId: media.id,
				filename: media.filename,
			});
		} else {
			// Budget measured before markAsFailed increments retry_count.
			const hadBudget = queue.retryCount < OrchestratorService.MAX_RETRIES;
			await ProcessingQueueRepository.markAsFailed(
				queue,
				result.error ?? "unknown",
			);
			if (hadBudget) {
				await ProcessingQueueRepository.retry(queue);
			} else {
				await BackgroundTaskService.incrementFailed();
				this.failed += 1;
				this.emit({
					type: "item-failed",
					mediaFileId: media.id,
					filename: media.filename,
					error: result.error ?? "unknown",
				});
			}
		}

		this.emit({
			type: "progress",
			processed: this.processed,
			total: this.total,
			failed: this.failed,
			currentFileName: media.filename,
		});
		await BackgroundTaskService.updateProgress(
			this.processed,
			Math.max(this.total, 1),
		);
		return true;
	}

	// --- The independent embedding drain (D8) ------------------------------

	/**
	 * Drain exactly one pending `embedding` item, selected via its own
	 * `task_type` so an embedding backlog never blocks Tier-0 (D8). Returns
	 * `false` (without loading any model) when the drain is not admitted or the
	 * stream is drained — the caller then stops the background service.
	 *
	 * Admission composes #5 (device-capability + thermal) with the `MODEL_ENABLED`
	 * opt-in (default off), so nothing embeds until the user opts in and the
	 * device qualifies. Idempotency is by replace-in-place upsert (D9). A null
	 * vector (model transiently unavailable) is retried with the same budget as
	 * Tier-0, then failed; a later enrichment persist re-enqueues a fresh row.
	 */
	static async processEmbeddingNext(): Promise<boolean> {
		if (!(await this.canRunEmbeddingDrain())) return false;

		const queue =
			await ProcessingQueueRepository.getNextPendingByTaskType(
				EMBEDDING_TASK_TYPE,
			);
		if (!queue) return false;

		await ProcessingQueueRepository.markAsProcessing(queue);

		const media = await MediaFileRepository.findById(queue.mediaFileId);
		if (!media) {
			// Orphan row (media deleted); complete it and move on.
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		const text = await SearchService.buildSearchableText(media.id);
		if (!text) {
			// No enrichment text yet — nothing to embed; complete without a vector.
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		const vector = await EmbeddingService.embed(text);
		if (vector) {
			const modelVersion = EmbeddingService.getModelVersion();
			await EmbeddingRepository.upsert(media.id, vector, modelVersion);
			await SemanticSearchService.upsertVector(media.id, vector);
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		// No vector produced: retry with budget, then fail (Tier-0 machinery).
		const hadBudget = queue.retryCount < OrchestratorService.MAX_RETRIES;
		await ProcessingQueueRepository.markAsFailed(
			queue,
			"embedding produced no vector",
		);
		if (hadBudget) {
			await ProcessingQueueRepository.retry(queue);
		}
		return true;
	}

	// --- The gated Tier-1 (Gemma) drain (#10) ------------------------------

	/**
	 * Drain exactly one pending `tier1_gemma` item — the Tier-1 multimodal
	 * (Gemma) enrichment pass. Mirrors `processNext`/`processEmbeddingNext` but
	 * runs the REGISTERED Tier-1 engine (`EngineRegistry.getById("gemma")`, NOT
	 * `ProcessingService`, which is the Tier-0 engine) and layers the selective +
	 * gated admission on top.
	 *
	 * Admission FIRST, loading NO model unless admitted: the composite
	 * `LibraryReprocessingService.mayRunTier1Now()` gate (MODEL_ENABLED opt-in +
	 * #5 capability/thermal, fail-closed, + charging + night window) AND a
	 * registered `gemma` engine. Returns `false` — the caller falls through to the
	 * embedding drain, then stops — when not admitted, no engine, or the stream is
	 * drained.
	 *
	 * Rollback-if-worse (design D7): a failed OR empty-vs-prior pass never
	 * overwrites last-good enrichment — it skips the persist and falls to the same
	 * retry-budget-then-fail machinery as `processNext`. Persistence is
	 * source-scoped (`MediaFileRepository.updateWithProcessingResult`) so the
	 * Tier-1 write replaces only `gemma` labels and never clobbers Tier-0 `mlkit`
	 * labels.
	 */
	static async processTier1Next(): Promise<boolean> {
		// Admission before any model load (both checks are cheap + fail-closed).
		if (!(await LibraryReprocessingService.mayRunTier1Now())) return false;
		const engine = EngineRegistry.getById("gemma");
		if (!engine) return false;

		const queue =
			await ProcessingQueueRepository.getNextPendingByTaskType(TIER1_TASK_TYPE);
		if (!queue) return false;

		await ProcessingQueueRepository.markAsProcessing(queue);

		const media = await MediaFileRepository.findById(queue.mediaFileId);
		if (!media) {
			// Orphan row (media deleted); complete it and move on.
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		// Resolve the Tier-1 provenance exactly as the reprocess sweep enqueues it
		// (`descriptor.modelVersion ?? descriptor.id`) so the version-aware skip key
		// matches the enqueued `model_version`.
		const modelVersion = engine.descriptor.modelVersion ?? engine.descriptor.id;

		// Version-aware idempotency skip (D5): don't re-run Gemma on a file already
		// stamped at this model version.
		if (media.processedAt != null && media.aiModelVersion === modelVersion) {
			await ProcessingQueueRepository.markAsCompleted(queue);
			return true;
		}

		// Capture prior enrichment presence BEFORE the pass, for the
		// rollback-if-worse acceptance gate.
		const priorLabels = await MediaFileRepository.getLabelsForMedia(media.id);
		const prior: PriorEnrichment = {
			hasCaption: !!media.caption,
			hasDescription: !!media.description,
			hasLabels: priorLabels.length > 0,
		};

		// Run the TIER-1 (Gemma) engine directly (NOT ProcessingService, which is
		// Tier-0). Resolves, never rejects, with a success flag.
		const result = await engine.analyze(media.uri);

		if (
			result.success &&
			LibraryReprocessingService.isAcceptableResult(result, prior)
		) {
			const provenance: ProcessingProvenance = {
				modelVersion,
				schemaVersion: TIER1_SCHEMA_VERSION,
			};
			await MediaFileRepository.updateWithProcessingResult(
				media,
				result,
				provenance,
			);
			await SearchService.addToIndex(media.id);
			await this.enqueueEmbedding(media.id);
			await ProcessingQueueRepository.markAsCompleted(queue);
			await BackgroundTaskService.setLastProcessedId(queue.id);
			await BackgroundTaskService.incrementProcessed();
			this.processed += 1;
			this.emit({
				type: "item-processed",
				mediaFileId: media.id,
				filename: media.filename,
			});
		} else {
			// Rollback-if-worse or a failed pass: skip the overwrite (prior
			// enrichment preserved) and fall to the same retry-budget-then-fail path
			// as processNext. Budget measured before markAsFailed increments it.
			const error =
				result.error ?? "tier1 result rejected (empty enrichment vs prior)";
			const hadBudget = queue.retryCount < OrchestratorService.MAX_RETRIES;
			await ProcessingQueueRepository.markAsFailed(queue, error);
			if (hadBudget) {
				await ProcessingQueueRepository.retry(queue);
			} else {
				await BackgroundTaskService.incrementFailed();
				this.failed += 1;
				this.emit({
					type: "item-failed",
					mediaFileId: media.id,
					filename: media.filename,
					error,
				});
			}
		}

		this.emit({
			type: "progress",
			processed: this.processed,
			total: this.total,
			failed: this.failed,
			currentFileName: media.filename,
		});
		await BackgroundTaskService.updateProgress(
			this.processed,
			Math.max(this.total, 1),
		);
		return true;
	}

	// --- Internals ---------------------------------------------------------

	/**
	 * Enqueue an `embedding` row for a file whose searchable text just became
	 * ready (D8), guarded against stacking a duplicate active embedding row (the
	 * same active-row check as `ingestDiscovered`). The enqueue is always durable
	 * and cheap; the model only runs when the drain is admitted.
	 */
	private static async enqueueEmbedding(mediaFileId: string): Promise<void> {
		const existing =
			await ProcessingQueueRepository.findByMediaFileId(mediaFileId);
		const hasActiveEmbedding = existing.some(
			(q) =>
				q.taskType === EMBEDDING_TASK_TYPE &&
				(q.status === "pending" || q.status === "processing"),
		);
		if (hasActiveEmbedding) return;

		await ProcessingQueueRepository.create({
			mediaFileId,
			status: "pending",
			priority: 0,
			taskType: EMBEDDING_TASK_TYPE,
			modelVersion: EmbeddingService.getModelVersion(),
		});
	}

	/**
	 * Admission for the embedding drain (D6): the user opt-in (`MODEL_ENABLED`,
	 * default false — nothing embeds until opted in) AND the #5 device-capability
	 * + thermal gate (`canRunEmbeddings`, fail-closed). The shared
	 * `BackgroundTaskService` drain also inherits #5's thermal pause between items.
	 */
	private static async canRunEmbeddingDrain(): Promise<boolean> {
		if (!GemmaModelDeliveryService.isEnabled()) return false;
		return await DeviceCapabilityService.canRunEmbeddings();
	}

	/**
	 * Resolve the provenance for the current Tier-0 engine from the change-#2
	 * descriptor (single source of truth), defaulting to the descriptor id
	 * ("mlkit") when it carries no `modelVersion`.
	 */
	private static getTargetProvenance(): ProcessingProvenance {
		const descriptor = ProcessingService.getEngine().descriptor;
		return {
			modelVersion: descriptor.modelVersion ?? descriptor.id,
			schemaVersion: TIER0_SCHEMA_VERSION,
		};
	}

	private static async runScan(): Promise<void> {
		if (MediaDiscoveryService.isNativeAvailable()) {
			await this.runNativeScan();
		} else {
			const allMedia = await MediaDiscoveryService.discoverAllMedia();
			for (const media of allMedia) {
				await this.ingestDiscovered(media);
			}
			this.emit({
				type: "scan-progress",
				discovered: allMedia.length,
				total: allMedia.length,
			});
		}
		// Advance the delta-sync watermark now that we have seen everything.
		await AppSettingsRepository.getInstance().setLastSyncTimestamp(Date.now());
	}

	private static runNativeScan(): Promise<void> {
		return new Promise<void>((resolve) => {
			let discovered = 0;
			// Serialize per-batch ingestion so onComplete resolves only after the
			// last batch is persisted.
			let chain: Promise<void> = Promise.resolve();
			const cleanup = MediaDiscoveryService.startNativeScan(
				(changes) => {
					chain = chain.then(async () => {
						await this.ingestChanges(changes);
						discovered += changes.length;
						this.emit({
							type: "scan-progress",
							discovered,
							total: discovered,
						});
					});
				},
				(totalCount) => {
					cleanup();
					chain = chain.then(() => {
						this.emit({
							type: "scan-progress",
							discovered,
							total: totalCount,
						});
						resolve();
					});
				},
			);
		});
	}

	private static async ingestChanges(changes: MediaChange[]): Promise<void> {
		for (const change of changes) {
			if (change.action === "deleted") {
				await this.removeByUri(change.uri);
			} else {
				await this.ingestDiscovered(
					MediaDiscoveryService.convertMediaChange(change),
				);
			}
		}
	}

	/** Dedupe by `uri`, then enqueue a Tier-0 row only when work is needed. */
	private static async ingestDiscovered(media: DiscoveredMedia): Promise<void> {
		const { mediaFile } = await MediaFileRepository.upsertFromDiscovered({
			uri: media.uri,
			filename: media.filename,
			mimeType: media.mimeType,
			width: media.width,
			height: media.height,
			fileSize: media.fileSize,
			creationDate: media.creationDate,
			modificationDate: media.modificationDate,
			latitude: media.latitude,
			longitude: media.longitude,
		});

		if (mediaFile.isProcessed) return;

		// Don't stack duplicate active rows for the same file.
		const existing = await ProcessingQueueRepository.findByMediaFileId(
			mediaFile.id,
		);
		const hasActive = existing.some(
			(q) => q.status === "pending" || q.status === "processing",
		);
		if (hasActive) return;

		// New media enqueues the Tier-0 (ML Kit) pass ONLY. Tier-1 (Gemma) is
		// SELECTIVE (favorites + recency, per #10) — never every image — so it is
		// deliberately NOT auto-enqueued here: a fresh file reaches Tier-1 through
		// `LibraryReprocessingService`'s reprocess sweep, whose favorites/recency
		// selection already covers new media inside the recency window.
		await ProcessingQueueRepository.create({
			mediaFileId: mediaFile.id,
			status: "pending",
			priority: 0,
			taskType: TIER0_TASK_TYPE,
			modelVersion: this.getTargetProvenance().modelVersion,
		});
	}

	private static async removeByUri(uri: string): Promise<void> {
		const media = await MediaFileRepository.findByUri(uri);
		if (!media) return;
		await OrchestratorService.removeMedia(media);
	}

	/**
	 * Complete removal — search index, semantic vector, queue rows, DB row.
	 * Public path for the UI facade (services-ui-facade spec): UI deletions
	 * must never leave index/queue orphans.
	 */
	static async removeMedia(media: MediaFile): Promise<void> {
		await SearchService.removeFromIndex(media.id);
		await SemanticSearchService.removeVector(media.id);
		await ProcessingQueueRepository.deleteByMediaFileId(media.id);
		await MediaFileRepository.delete(media);
	}

	private static async recomputeTotal(): Promise<void> {
		const pending = await ProcessingQueueRepository.countByStatus("pending");
		const processing =
			await ProcessingQueueRepository.countByStatus("processing");
		this.total = this.processed + this.failed + pending + processing;
	}

	/** Start the durable background drain if nothing is running and work exists. */
	private static async maybeStartDrain(): Promise<void> {
		if (this.scanning || BackgroundTaskService.isTaskRunning()) return;

		const pending = await ProcessingQueueRepository.countByStatus("pending");
		if (pending === 0) return;

		// Drain order per tick: Tier-0 fully first (higher priority); then the
		// gated + selective Tier-1 (Gemma) stream, one item per tick (idles when
		// not admitted); then the independent `embedding` stream. So neither a
		// Tier-1 nor an embedding backlog ever blocks Tier-0 analysis (D8). The
		// service loop never self-terminates on an empty queue, so the tick stops
		// it once ALL streams are drained. Tier-0 completion is signalled once per
		// drain cycle (the user-facing pass finishes before the silent background
		// Tier-1 + embedding passes).
		let tier0HadWork = false;
		const tick = async () => {
			const nextTier0 =
				await ProcessingQueueRepository.getNextPendingByTaskType(
					TIER0_TASK_TYPE,
				);
			if (nextTier0) {
				tier0HadWork = true;
				await OrchestratorService.processNext();
				return;
			}

			if (tier0HadWork) {
				tier0HadWork = false;
				OrchestratorService.emit({ type: "completed" });
			}

			// Tier-1 (Gemma): gated + selective, one item per tick. Returns false
			// when not admitted (gated off) or the stream is drained, so an
			// unadmitted Tier-1 backlog never blocks the embedding pass or the stop.
			if (await OrchestratorService.processTier1Next()) {
				return;
			}

			if (await OrchestratorService.processEmbeddingNext()) {
				return;
			}

			await BackgroundTaskService.stop();
		};
		await BackgroundTaskService.start(tick, this.buildTaskOptions());
	}

	private static buildTaskOptions(): BackgroundTaskOptions {
		return {
			taskName: "VisaraProcessing",
			taskTitle: "Visara",
			taskDesc: "Processing your library",
			progressBar: {
				max: Math.max(this.total, 1),
				value: this.processed,
				indeterminate: this.total === 0,
			},
		};
	}
}

export { OBSERVER_THROTTLE_MS };
