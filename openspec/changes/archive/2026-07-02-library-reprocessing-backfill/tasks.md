> Ordered top-to-bottom. This change is **JS-only** (all-static services + a Settings UI edit); every implementation group is **(agent-run)** and verifiable against the typecheck baseline, except the final on-device Tier-1 behavior which is **(HUMAN-run)** and additionally needs dependency #7 (the Gemma `tier1_gemma` drain) on a real device. Groups are tagged **(agent-run)** or **(HUMAN-run)**. BASELINE: `npx tsc --noEmit` currently reports **8** pre-existing `TS6133` unused-symbol errors in 4 unrelated UI files; every group below must keep that count at **8** (zero new typecheck errors). Items marked **POC** must be re-tuned once the #4 Gemma POC gate reports real latency/quality/output-shape.

## 1. Planner scaffold, constants, storage key — (agent-run)

- [x] 1.1 Add `REPROCESS_CHECKPOINT: 'reprocess_checkpoint'` to `STORAGE_KEYS` in `src/utils/constants/storage-keys.ts` (beside the existing `PROCESSING_CHECKPOINT` and `DEVICE_CAPABILITY_SNAPSHOT`).
- [x] 1.2 Create `src/services/orchestrator/LibraryReprocessingService.ts` (all-static, with the sibling `/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */` header). Define the named policy constants: `TIER0_BACKFILL_PRIORITY = -10`; `TIER1_PRIORITY_FAVORITE = 30`, `TIER1_PRIORITY_RECENT = 20`, `TIER1_PRIORITY_ENGAGED = 10`; `TIER1_RECENT_WINDOW_DAYS = 90` **(POC)**. Define a `ReprocessCheckpoint` type `{ status: "idle" | "sweeping" | "done"; phase: "tier0" | "tier1"; cursor: number; tier0Enqueued: number; tier1Enqueued: number; startedAt: number }` (no `any`).
- [x] 1.3 Add the public surface as typed static methods (bodies filled in later groups): `requestReprocess(): Promise<void>`, `resumeIfPending(): Promise<void>`, `mayRunTier1Now(): Promise<boolean>`, `getStatus(): ReprocessCheckpoint`. Keep the class import-light and framework-agnostic (no React import), matching `OrchestratorService`.

## 2. Model-version-aware stale scan + tier-tagged enqueue — (agent-run)

- [x] 2.1 Resolve the Tier-0 target from the descriptor exactly as `OrchestratorService.getTargetProvenance()` does (`ProcessingService.getEngine().descriptor`, `modelVersion ?? id`, `TIER0_SCHEMA_VERSION`) so the reprocess target matches the drain's version-aware skip key.
- [x] 2.2 Implement the Tier-0 stale predicate: a `media_files` row is stale when `processedAt == null` OR `aiModelVersion !== tier0Target.modelVersion`. Enqueue every stale row via `ProcessingQueueRepository.create({ mediaFileId, status: "pending", priority: TIER0_BACKFILL_PRIORITY, taskType: "tier0_mlkit", modelVersion: tier0Target.modelVersion })`.
- [x] 2.3 Do NOT null `processed_at` or delete labels up front — enqueue only; the drain's `MediaFileRepository.updateWithProcessingResult` overwrites in place on success (preserves the `is_processed === (processed_at !== null)` invariant). Add a code comment referencing that no destructive reset is performed.
- [x] 2.4 Add a duplicate-active-row guard reusing the discovery pattern (`OrchestratorService.ts:366-372`): before creating a row, skip files that already have a `pending`/`processing` `processing_queue` row for the same `task_type` (extend/filter `ProcessingQueueRepository.findByMediaFileId`). Confirm no second row is stacked on a re-run.

## 3. Tier-1 selective selection, prioritization, admission gate — (agent-run)

- [x] 3.1 Guard Tier-1 enqueue on a registered Tier-1 engine: only build the `tier1_gemma` selection when `EngineRegistry.getByTier("tier1")` is non-empty; otherwise enqueue Tier-0 only (no orphan `tier1_gemma` rows). Resolve the Tier-1 `model_version` from that descriptor.
- [x] 3.2 Build the **selective** Tier-1 set from signals that exist: favorites (`MediaFileRepository.getFavorites`), then recent (`creation_date` within `TIER1_RECENT_WINDOW_DAYS`), assigning `TIER1_PRIORITY_FAVORITE` / `TIER1_PRIORITY_RECENT`. Enqueue `tier1_gemma` rows with `model_version = tier1Target` and the band priority. Do NOT enqueue the non-selected tail. **(POC: breadth/window/bands.)**
- [x] 3.3 (Optional, **POC/deferred**) Wire the `TIER1_PRIORITY_ENGAGED` band to a lightweight MMKV recently-viewed ring if/when one exists; the selection MUST remain correct (favorites + recency) when no such store is present — no error on the missing signal.
- [x] 3.4 Implement `mayRunTier1Now()` = `await DeviceCapabilityService.canRunTier1()` AND `await isDeviceCharging()` (`src/utils/device/battery.ts`) AND `withinTier1Window()` (reuse the 00:00–06:00 night predicate from `BackgroundTaskService.ts:325-327`). Any error/unknown ⇒ `false` (canRunTier1 already fails closed). This predicate is the single seam #7's `tier1_gemma` drain calls per item; do NOT wire it into the Tier-0 `processNext`.

## 4. Resumable sweep + idempotency + resume hook — (agent-run)

- [x] 4.1 Implement `requestReprocess()`: if a sweep or drain is already active (`OrchestratorService.getSnapshot().isRunning` / `BackgroundTaskService.isTaskRunning()`) return early (idempotent). Otherwise page `media_files` deterministically (e.g. `creation_date DESC` in bounded pages), running the Tier-0 (group 2) then Tier-1 (group 3) enqueue, writing the `ReprocessCheckpoint` (cursor + counts) to `REPROCESS_CHECKPOINT` after each page.
- [x] 4.2 After enqueuing, kick the existing drain via the orchestrator's normal path (do not add a second drain loop) so Tier-0 backfill drains through `BackgroundTaskService` unchanged; Tier-1 rows drain via #7's stream.
- [x] 4.3 Implement `resumeIfPending()`: if the stored checkpoint `status === "sweeping"`, continue the sweep from `cursor`; call it from `OrchestratorService.initialize()` (`src/services/orchestrator/OrchestratorService.ts:113-125`) so an interrupted sweep resumes on next launch. Stopping mid-sweep must leave already-enqueued rows drainable and no `media_files` row half-reset.

## 5. Rollback-if-worse acceptance gate — (agent-run; predicate is POC)

- [x] 5.1 Add an exported acceptance predicate (e.g. `LibraryReprocessingService.isAcceptableResult(result, prior)`) that returns `false` when `result.success === false`, or when the result is empty (no caption AND no description AND no labels) for a file that already had enrichment. Fix the CONTRACT now; the exact "worse" thresholds beyond failed/empty are **POC** (re-tune after #4).
- [x] 5.2 Document (code comment + this task) that the Tier-1 persist path (owned by #7) MUST consult this predicate and, on `false`, skip the overwrite so the prior caption/description/labels are preserved and the row falls to the normal retry budget (`OrchestratorService.ts:235-253`).
- [x] 5.3 Document the label-source ordering hazard: the current Tier-0 `updateWithProcessingResult` deletes ALL labels regardless of source (`MediaFileRepository.ts:315-317`), so Tier-0 backfill is enqueued at a lower priority than Tier-1 for the same file (drains first); the source-scoped delete itself is #7's persistence fix and is NOT changed here.

## 6. Settings "Re-run analysis" action — (agent-run)

- [x] 6.1 In `src/components/organisms/SettingsDrawer.tsx`, add `onReRunAnalysis: () => void` to `SettingsDrawerProps` and render a button row in the **Processing** section (`:197-200`), styled like the confirm-then-act rows and wrapped in an `Alert` confirmation like `handleDeleteAllData` (`:120-135`).
- [x] 6.2 In `src/screens/Settings/SettingsScreen.tsx`, add a `handleReRunAnalysis` callback calling `LibraryReprocessingService.requestReprocess()` and pass it as `onReRunAnalysis` to `SettingsDrawer`.
- [x] 6.3 Confirm progress reuses the existing surface: no new progress screen/context — reprocessing shows through the #3 `OrchestratorBridge` → `ProcessingContext` path already mounted.

## 7. Verify — baseline-relative — (agent-run) + on-device (HUMAN-run)

- [x] 7.1 Confirm no `any` (`noExplicitAny: error`), tabs/double quotes, strict TS across every new/edited file; all imports use `@services`/`@models`/`@utils` aliases.
- [x] 7.2 `npx tsc --noEmit` reports exactly **8** errors (the pre-existing `TS6133` baseline) — ZERO new typecheck errors introduced by this change.
- [x] 7.3 Metro-bundle resolve check: `npx react-native bundle --entry-file index.js --platform android --dev true --bundle-output "$TMPDIR/visara-reprocess.bundle" --assets-dest "$TMPDIR/visara-reprocess-assets"` exits 0 (the new service + Settings edits resolve in the real Metro graph, catching alias/import breakage `tsc`/Biome miss).
- [x] 7.4 `npm run lint` (Biome) is clean on every new/edited file.
- [x] 7.5 `openspec validate library-reprocessing-backfill --strict` passes.
- [ ] 7.6 (HUMAN, needs #7 + a real device) On an M-class iPad Pro / Android flagship with the Gemma `tier1_gemma` drain present: tap "Re-run analysis"; confirm Tier-0 backfills broadly, Tier-1 runs only while charging + cool + in the night window (`mayRunTier1Now()` gating), an empty/failed Tier-1 pass preserves prior enrichment, and a mid-run kill resumes from the checkpoint. Record results; re-tune the **POC** constants (selection breadth, window, bands, acceptance predicate) from observed latency/quality.
