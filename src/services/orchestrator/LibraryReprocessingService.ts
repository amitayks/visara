/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */

import type { MediaFile } from "@models/MediaFile";
import {
	MediaFileRepository,
	type ProcessingProvenance,
	TIER0_SCHEMA_VERSION,
} from "@services/database/MediaFileRepository";
import { ProcessingQueueRepository } from "@services/database/ProcessingQueueRepository";
import { DeviceCapabilityService } from "@services/device/DeviceCapabilityService";
import { EngineRegistry } from "@services/ml/engines/EngineRegistry";
import type { ProcessingResult } from "@services/ml/ProcessingService";
import { ProcessingService } from "@services/ml/ProcessingService";
import { GemmaModelDeliveryService } from "@services/model/GemmaModelDeliveryService";
import { OrchestratorService } from "@services/orchestrator/OrchestratorService";
import { storage } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { isDeviceCharging } from "@utils/device/battery";

/** Tier-0 analysis stream (ML Kit) — matches `OrchestratorService`'s constant. */
const TIER0_TASK_TYPE = "tier0_mlkit";

/** Tier-1 multimodal (Gemma) stream — the #7 drain consumes this `task_type`. */
const TIER1_TASK_TYPE = "tier1_gemma";

/**
 * Tier-0 backfill priority band. NEGATIVE so backfilled re-tags sort AFTER live
 * discovery (which enqueues at `priority: 0`, `OrchestratorService.ts:488`) in
 * the `priority DESC, created_at ASC` selection — fresh media processes before
 * old re-tags.
 */
const TIER0_BACKFILL_PRIORITY = -10;

/** Tier-1 within-stream priority bands (drained priority-descending, design D4). */
const TIER1_PRIORITY_FAVORITE = 30;
const TIER1_PRIORITY_RECENT = 20;
const TIER1_PRIORITY_ENGAGED = 10;

/**
 * Recency window for the Tier-1 "recent" band, in days.
 *
 * POC-DEPENDENT (#4 on-device Gemma POC): re-tune the selection breadth once the
 * Gemma gate reports real per-image latency/quality.
 */
const TIER1_RECENT_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows scanned/enqueued per checkpointed page (D6 resumability granularity). */
const SWEEP_PAGE_SIZE = 200;

/**
 * The resumable enqueue-sweep checkpoint, persisted in MMKV under
 * {@link STORAGE_KEYS.REPROCESS_CHECKPOINT} (design D6). `cursor` is the offset
 * into the current `phase`'s deterministic ordering; a kill mid-sweep resumes
 * from it rather than restarting.
 */
export type ReprocessCheckpoint = {
	status: "idle" | "sweeping" | "done";
	phase: "tier0" | "tier1";
	cursor: number;
	tier0Enqueued: number;
	tier1Enqueued: number;
	startedAt: number;
};

/** Prior on-disk enrichment presence, consulted by {@link isAcceptableResult}. */
export interface PriorEnrichment {
	hasCaption: boolean;
	hasDescription: boolean;
	hasLabels: boolean;
}

interface Tier1SelectionItem {
	media: MediaFile;
	priority: number;
}

/**
 * Model-version-aware reprocessing PLANNER (design D1). All-static and
 * framework-agnostic (no React import), co-located with the `OrchestratorService`
 * it feeds. It owns exactly three jobs: (a) decide which already-processed
 * `media_files` are stale per tier, (b) ENQUEUE them into the durable
 * `ProcessingQueueRepository` with the right `task_type`/`model_version`/`priority`,
 * (c) checkpoint the sweep. It NEVER drains and NEVER runs a model — draining
 * stays the single responsibility of `OrchestratorService` + `BackgroundTaskService`
 * (#3) and the #7 Tier-1 stream; the planner only kicks the existing drain.
 *
 * Reset is enqueue-then-overwrite-in-place (design D2): the sweep never nulls
 * `processed_at` or deletes enrichment up front, so it is interrupt-safe and the
 * library is never transiently marked unprocessed.
 *
 * LABEL-SOURCE ORDERING (tasks.md 5.3): `MediaFileRepository.updateWithProcessingResult`
 * now replaces labels SCOPED BY `source` (the Tier-1 persist touches only `gemma`
 * rows, the Tier-0 persist only `mlkit` rows), so neither tier clobbers the
 * other's labels. The Tier-0 backfill is still enqueued at a lower cross-stream
 * priority so that, for a file selected for both, Tier-0 drains first and Tier-1
 * enriches afterward — now a mild preference rather than a required compensation.
 */
export class LibraryReprocessingService {
	// --- Public surface (D1) -----------------------------------------------

	/**
	 * Trigger the reprocess sweep (D6). Idempotent: no-op while a sweep or drain
	 * is already active, so re-tapping "Re-run analysis" never starts a second
	 * concurrent sweep or stacks duplicate work.
	 */
	static async requestReprocess(): Promise<void> {
		// `getSnapshot().isRunning` already composes `BackgroundTaskService.isTaskRunning()`.
		if (OrchestratorService.getSnapshot().isRunning) return;
		if (this.getStatus().status === "sweeping") return;

		const checkpoint: ReprocessCheckpoint = {
			status: "sweeping",
			phase: "tier0",
			cursor: 0,
			tier0Enqueued: 0,
			tier1Enqueued: 0,
			startedAt: Date.now(),
		};
		this.writeCheckpoint(checkpoint);
		await this.runSweep(checkpoint);
	}

	/**
	 * Continue an interrupted sweep from its stored cursor (D6). Called from
	 * `OrchestratorService.initialize` so a kill mid-sweep resumes on next launch.
	 */
	static async resumeIfPending(): Promise<void> {
		const checkpoint = this.getStatus();
		if (checkpoint.status !== "sweeping") return;
		await this.runSweep(checkpoint);
	}

	/**
	 * The single composite admission predicate the Tier-1 (`tier1_gemma`) drain
	 * (`OrchestratorService.processTier1Next`) MUST evaluate before running each
	 * item (design D5). NEVER a blanket pass: `true` only when the user has opted
	 * in (`MODEL_ENABLED`, default false — the same gate the embedding drain
	 * composes) AND the device is capable+cool (#5, fails closed) AND charging AND
	 * inside the night window. Layered ON TOP of the shared
	 * `BackgroundTaskService.shouldPauseProcessing` drain gate, not replacing it.
	 * Any error/unknown ⇒ `false`, so the Tier-1 stream simply idles and Tier-0 is
	 * unaffected. NOT wired into the Tier-0 `processNext`.
	 */
	static async mayRunTier1Now(): Promise<boolean> {
		try {
			// MODEL_ENABLED opt-in (default false): nothing runs Tier-1 until the
			// user opts in. Cheap + synchronous + fail-closed, so it short-circuits
			// before any device probe and keeps the tier OFF by default.
			if (!GemmaModelDeliveryService.isEnabled()) return false;
			if (!(await DeviceCapabilityService.canRunTier1())) return false;
			if (!(await isDeviceCharging())) return false;
			return this.withinTier1Window();
		} catch (error) {
			console.warn("LibraryReprocessingService.mayRunTier1Now failed", error);
			return false;
		}
	}

	/** The current sweep checkpoint (or an idle default when none is stored). */
	static getStatus(): ReprocessCheckpoint {
		return this.readCheckpoint() ?? this.idleCheckpoint();
	}

	/**
	 * Rollback-if-worse acceptance gate (design D7, tasks.md 5.1/5.2). Returns
	 * `false` when a re-driven pass FAILED, or produced EMPTY output (no caption,
	 * no description, no labels) for a file that already had enrichment.
	 *
	 * CONTRACT (fixed now): the Tier-1 persist path (owned by #7) MUST consult this
	 * predicate and, on `false`, SKIP the overwrite so the file keeps its last-good
	 * caption/description/labels and the queue row falls to the normal retry budget
	 * (`OrchestratorService.ts:250-268`). The exact "worse" thresholds beyond
	 * failed/empty are POC-DEPENDENT (#4 Gemma gate output shape/quality) and MUST
	 * be re-tuned; this predicate is the tunable seam.
	 */
	static isAcceptableResult(
		result: ProcessingResult,
		prior: PriorEnrichment,
	): boolean {
		if (!result.success) return false;

		const producedCaption = (result.gemma?.caption ?? "").trim().length > 0;
		const producedDescription =
			(result.gemma?.description ?? "").trim().length > 0;
		const producedLabels =
			(result.gemma?.tags?.length ?? 0) > 0 ||
			result.imageLabeling.labels.length > 0;
		const producedNothing =
			!producedCaption && !producedDescription && !producedLabels;

		const priorHadEnrichment =
			prior.hasCaption || prior.hasDescription || prior.hasLabels;

		// Never overwrite good enrichment with an empty pass.
		if (producedNothing && priorHadEnrichment) return false;
		return true;
	}

	// --- Sweep (D2/D6) -----------------------------------------------------

	private static async runSweep(
		checkpoint: ReprocessCheckpoint,
	): Promise<void> {
		let cp = checkpoint;

		if (cp.phase === "tier0") {
			cp = await this.sweepTier0(cp);
		}
		if (cp.phase === "tier1") {
			cp = await this.sweepTier1(cp);
		}

		cp = { ...cp, status: "done" };
		this.writeCheckpoint(cp);

		// Kick the existing drain via the orchestrator's normal path (D1/task 4.2):
		// an empty `enqueueDiscovered` batch runs its `recomputeTotal` +
		// `maybeStartDrain`, so the Tier-0 backfill drains through
		// `BackgroundTaskService` unchanged and progress surfaces through the #3
		// `OrchestratorBridge`. No second drain loop is added. Tier-1 rows drain via
		// the #7 `tier1_gemma` stream once it lands.
		await OrchestratorService.enqueueDiscovered([]);
	}

	/**
	 * Tier-0 broad backfill: page the whole library deterministically
	 * (`creation_date DESC`) and enqueue every Tier-0-stale file, checkpointing
	 * after each page. Enqueue-only — no `processed_at` is nulled and no label is
	 * deleted here; the drain's `updateWithProcessingResult` overwrites the row in
	 * place on success, preserving the `is_processed === (processed_at !== null)`
	 * invariant (design D2).
	 */
	private static async sweepTier0(
		checkpoint: ReprocessCheckpoint,
	): Promise<ReprocessCheckpoint> {
		const tier0Target = this.getTier0Target();
		const all = await MediaFileRepository.getAll();

		let cp = checkpoint;
		while (cp.cursor < all.length) {
			const page = all.slice(cp.cursor, cp.cursor + SWEEP_PAGE_SIZE);
			let enqueued = cp.tier0Enqueued;

			for (const media of page) {
				if (!this.isTier0Stale(media, tier0Target.modelVersion)) continue;
				if (await this.hasActiveRow(media.id, TIER0_TASK_TYPE)) continue;

				await ProcessingQueueRepository.create({
					mediaFileId: media.id,
					status: "pending",
					priority: TIER0_BACKFILL_PRIORITY,
					taskType: TIER0_TASK_TYPE,
					modelVersion: tier0Target.modelVersion,
				});
				enqueued += 1;
			}

			cp = {
				...cp,
				cursor: cp.cursor + page.length,
				tier0Enqueued: enqueued,
			};
			this.writeCheckpoint(cp);
		}

		// Advance to the Tier-1 phase with a fresh cursor.
		cp = { ...cp, phase: "tier1", cursor: 0 };
		this.writeCheckpoint(cp);
		return cp;
	}

	/**
	 * Tier-1 selective backfill: enqueue only the prioritized selection (favorites
	 * → recent → optional recently-opened), never the whole library (design D3/D4).
	 * Guarded on a REGISTERED Tier-1 engine so no orphan `tier1_gemma` rows are
	 * created before the #7 drain exists; when none is registered the Tier-0
	 * backfill still proceeds and Tier-1 is skipped.
	 */
	private static async sweepTier1(
		checkpoint: ReprocessCheckpoint,
	): Promise<ReprocessCheckpoint> {
		const tier1Engines = EngineRegistry.getByTier("tier1");
		if (tier1Engines.length === 0) {
			// No Tier-1 engine ⇒ no `tier1_gemma` rows (nothing could drain them).
			return checkpoint;
		}

		const descriptor = tier1Engines[0].descriptor;
		const tier1Target = descriptor.modelVersion ?? descriptor.id;
		const selection = await this.buildTier1Selection(checkpoint.startedAt);

		let cp = checkpoint;
		while (cp.cursor < selection.length) {
			const page = selection.slice(cp.cursor, cp.cursor + SWEEP_PAGE_SIZE);
			let enqueued = cp.tier1Enqueued;

			for (const item of page) {
				// Skip files already at the current Tier-1 version (drain would no-op).
				if (
					item.media.processedAt != null &&
					item.media.aiModelVersion === tier1Target
				) {
					continue;
				}
				if (await this.hasActiveRow(item.media.id, TIER1_TASK_TYPE)) continue;

				await ProcessingQueueRepository.create({
					mediaFileId: item.media.id,
					status: "pending",
					priority: item.priority,
					taskType: TIER1_TASK_TYPE,
					modelVersion: tier1Target,
				});
				enqueued += 1;
			}

			cp = {
				...cp,
				cursor: cp.cursor + page.length,
				tier1Enqueued: enqueued,
			};
			this.writeCheckpoint(cp);
		}

		return cp;
	}

	/**
	 * Build the prioritized, de-duplicated Tier-1 selection (design D4) from
	 * signals that exist in the schema today: favorites (highest band), then media
	 * whose `creation_date` falls inside the recency window, then an OPTIONAL
	 * recently-opened engagement band. The window is anchored on the sweep start so
	 * the selection is deterministic across a resume. The engagement band is
	 * sourced from a recently-viewed store when one exists; the core selection
	 * remains correct on favorites + recency alone when it does not (task 3.3).
	 */
	private static async buildTier1Selection(
		anchorMs: number,
	): Promise<Tier1SelectionItem[]> {
		const selection: Tier1SelectionItem[] = [];
		const seen = new Set<string>();

		// 1. Favorites — highest band.
		const favorites = await MediaFileRepository.getFavorites();
		for (const media of favorites) {
			if (seen.has(media.id)) continue;
			seen.add(media.id);
			selection.push({ media, priority: TIER1_PRIORITY_FAVORITE });
		}

		// 2. Recent — `creation_date` within the window. `getVisible` is
		//    `creation_date DESC`, so we can stop at the first out-of-window row.
		const windowStart = anchorMs - TIER1_RECENT_WINDOW_DAYS * DAY_MS;
		const visible = await MediaFileRepository.getVisible();
		for (const media of visible) {
			if (media.creationDate < windowStart) break;
			if (seen.has(media.id)) continue;
			seen.add(media.id);
			selection.push({ media, priority: TIER1_PRIORITY_RECENT });
		}

		// 3. Recently-opened engagement band (OPTIONAL, POC/deferred — task 3.3).
		//    Sourced from a lightweight recently-viewed store when present; there is
		//    no such store yet, so this yields an empty set and surfaces no error.
		for (const id of this.getRecentlyViewedIds()) {
			if (seen.has(id)) continue;
			const media = await MediaFileRepository.findById(id);
			if (!media || media.isHidden) continue;
			seen.add(id);
			selection.push({ media, priority: TIER1_PRIORITY_ENGAGED });
		}

		return selection;
	}

	/**
	 * Recently-opened media ids for the {@link TIER1_PRIORITY_ENGAGED} band. There
	 * is no `last_opened_at` column and no recently-viewed store today (design D4),
	 * so this returns an empty list — a deferred, non-schema seam. When a
	 * bounded MMKV recently-viewed ring is added, source it here; the selection
	 * stays correct (favorites + recency) meanwhile with no error on the absence.
	 */
	private static getRecentlyViewedIds(): string[] {
		return [];
	}

	// --- Predicates / provenance -------------------------------------------

	/** A file is Tier-0-stale when never processed OR at a different model version. */
	private static isTier0Stale(
		media: MediaFile,
		targetModelVersion: string,
	): boolean {
		return (
			media.processedAt == null || media.aiModelVersion !== targetModelVersion
		);
	}

	/**
	 * Resolve the Tier-0 target exactly as `OrchestratorService.getTargetProvenance`
	 * does (`ProcessingService.getEngine().descriptor`, `modelVersion ?? id`,
	 * `TIER0_SCHEMA_VERSION`) so the reprocess target matches the drain's
	 * version-aware skip key.
	 */
	private static getTier0Target(): ProcessingProvenance {
		const descriptor = ProcessingService.getEngine().descriptor;
		return {
			modelVersion: descriptor.modelVersion ?? descriptor.id,
			schemaVersion: TIER0_SCHEMA_VERSION,
		};
	}

	/** The 00:00–06:00 night window (reused from `BackgroundTaskService.ts:331-333`). */
	private static withinTier1Window(): boolean {
		const currentHour = new Date().getHours();
		return currentHour >= 0 && currentHour < 6;
	}

	/**
	 * Idempotency guard reusing the discovery pattern
	 * (`OrchestratorService.ts:477-483`): a file already carrying a
	 * `pending`/`processing` row for the same `task_type` is skipped, so re-running
	 * the sweep never stacks a duplicate active row.
	 */
	private static async hasActiveRow(
		mediaFileId: string,
		taskType: string,
	): Promise<boolean> {
		const existing =
			await ProcessingQueueRepository.findByMediaFileId(mediaFileId);
		return existing.some(
			(q) =>
				q.taskType === taskType &&
				(q.status === "pending" || q.status === "processing"),
		);
	}

	// --- Checkpoint persistence (MMKV, D6) ---------------------------------

	private static readCheckpoint(): ReprocessCheckpoint | null {
		try {
			const json = storage.getString(STORAGE_KEYS.REPROCESS_CHECKPOINT);
			if (!json) return null;
			return JSON.parse(json) as ReprocessCheckpoint;
		} catch (error) {
			console.warn("LibraryReprocessingService: checkpoint read failed", error);
			return null;
		}
	}

	private static writeCheckpoint(checkpoint: ReprocessCheckpoint): void {
		try {
			storage.set(
				STORAGE_KEYS.REPROCESS_CHECKPOINT,
				JSON.stringify(checkpoint),
			);
		} catch (error) {
			console.warn(
				"LibraryReprocessingService: checkpoint write failed",
				error,
			);
		}
	}

	private static idleCheckpoint(): ReprocessCheckpoint {
		return {
			status: "idle",
			phase: "tier0",
			cursor: 0,
			tier0Enqueued: 0,
			tier1Enqueued: 0,
			startedAt: 0,
		};
	}
}
