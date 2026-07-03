## Context

Visara's processing pipeline is scaffolded but disconnected. Each stage exists as an all-static service, yet nothing calls them in sequence:

- **Discovery** — `MediaDiscoveryService` (`src/services/media/MediaDiscoveryService.ts`) yields `DiscoveredMedia` from the native `MediaObserver` TurboModule (`startNativeScan`/`startObserver`/`getChangesSinceNative`, `MediaDiscoveryService.ts:64-173`) with a `CameraRoll`/`RNFS` fallback (`discoverAllMedia`, `:248-272`). Its only importer is `OnboardingScreen.tsx:11`, where every call is commented out (`:368`) — the source of a baseline `TS6133`.
- **Repo-backed queue** — `ProcessingQueueRepository` (`src/services/database/ProcessingQueueRepository.ts`) is a full pending/processing/completed/failed state machine ordered by `priority desc, created_at asc` (`getNextPending`, `:79-90`) with `markAsProcessing`/`markAsCompleted`/`markAsFailed`/`retry` (`:107-136`). Change #1 added `task_type`/`model_version` to the schema and model (`ProcessingQueue.ts:21-22`), but `create` (`:21-35`) sets **neither**, and there is **no** tier-filtered query. Zero external call sites.
- **Persistence writers** — `MediaFileRepository.createWithProcessingResult`/`updateWithProcessingResult` (`MediaFileRepository.ts:173,226`) are the only writers of `labels`/`ocr_texts`; `update` deletes-then-recreates labels/OCR (`:236-274`). Both set `record.isProcessed = processingResult.success` (`:192,233`) but **never** stamp `processed_at`/`ai_model_version` — so change #1's invariant `is_processed === (processed_at !== null)` is violated for every new write. Zero external call sites.
- **Analysis producer** — change #2 made `ProcessingService.processMedia` a one-line delegate to a configured `AnalysisEngine` (`ProcessingService.ts:29-31`), defaulting to the Tier-0 `MlKitEngine`, selectable via `EngineRegistry`. `ProcessingService` also carries an **in-memory** queue (`queue`/`addToQueue`/`processQueue`, `:16-112`) with **zero** call sites — a second, volatile queue notion that duplicates `ProcessingQueueRepository`.
- **Background driver** — `BackgroundTaskService` (`src/services/background/BackgroundTaskService.ts`) wraps `react-native-background-actions`: `start(taskFunction, options)` runs `taskFunction` in a loop with `shouldPauseProcessing` gating on battery-saver + night window (`:309-334`) and an MMKV checkpoint (`saveCheckpoint`/`loadCheckpoint`, `:339-365`; `setLastProcessedId`, `:390`). Zero external callers.
- **Search** — `SearchService` has both a full `index()` rebuild (`SearchService.ts:41-75`) and an **incremental** `addToIndex(mediaFileId)` (`:77-109`) that discards-then-adds one doc and re-serializes to MMKV. `index()` is invoked from `MainScreen`/`SearchModeOverlay` only when no persisted index exists.
- **UI state** — `GalleryContext` (`SET_MEDIA_FILES` reducer at `GalleryContext.tsx:61`, never dispatched), `ProcessingContext` (progress/queue/failed reducers, `ProcessingContext.tsx:36-153`), `SettingsContext` (`batterySaver`/`nightProcessing`/`onboardingCompleted`, `SettingsContext.tsx:21-49`). `RootNavigator` swaps Onboarding → Main on `onboardingCompleted` (`RootNavigator.tsx:21-40`). Providers are mounted in `App.tsx:16-37`.

**Constraints.** Biome (tabs, double quotes; `noExplicitAny: error`; `noStaticOnlyClass: off`; `useImportType: off`; `organizeImports: on`), strict TS (`noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`/`noFallthroughCasesInSwitch`, `isolatedModules`), legacy decorators, all-static service classes. Aliases `@services/*`, `@components/*`, `@contexts/*`, `@models/*`, `@native-modules/*` exist in `tsconfig.json` + `babel.config.js`. Baseline: exactly **8 pre-existing `TS6133`** errors in unrelated UI files (one is the commented-out `MediaDiscoveryService` import) plus many pre-existing Biome issues in untouched files. This change adds **zero new** typecheck errors and keeps every **touched** file Biome-clean.

This is Wave-A foundation #3: change #1 (archived `2026-07-01-db-migrations-and-gemma-schema`) made the DB Gemma-ready; change #2 (archived `2026-07-02-ml-engine-interface-seam`) made the producer a swappable engine; this change builds the orchestrator that finally runs the pipeline. It **fulfills** existing requirements (`processing-queue-tiers` enqueue/select-by-`task_type`; `media-enrichment-schema` stamp-`processed_at`/invariant; `analysis-engine-selection` swappable engine) rather than altering them.

## Goals / Non-Goals

**Goals:**
- Build one connective `OrchestratorService` that runs discovery → upsert → enqueue → analyze → persist → incremental search → progress → gallery, using only existing pieces.
- Drive the **persistent** `ProcessingQueueRepository` via `BackgroundTaskService` (reuse pause/resume, battery/night gating, MMKV checkpoint); make the run resumable across app kills and idempotent (no double-processing).
- Reconcile the two queue notions explicitly: deprecate/bypass `ProcessingService`'s in-memory queue; the repo queue is the single source of truth; `ProcessingService` is used only as the stateless engine seam.
- Define the trigger model (post-onboarding foreground scan + background continuation) and fold live `MediaObserver` changes in incrementally.
- Close the two persistence gaps required for correctness: enqueue with `task_type`/`model_version`; stamp `processed_at`/`ai_model_version` on completion.
- Populate `GalleryContext` via `SET_MEDIA_FILES` and report progress via `ProcessingContext`, through a thin React bridge, without coupling the static orchestrator to React.
- Leave clean, tier-aware seams for Tier-1 (Gemma) selection, capability/thermal gating (change #5), and model-version-aware reprocessing (change #10) — no rewrite required later.
- No Gemma, no native code, no new npm dependency; zero new typecheck errors; touched files Biome-clean.

**Non-Goals:**
- No Tier-1/Gemma engine, inference, caption/description/tags producers, or embedding generation (later waves) — the orchestrator only selects `tier0_mlkit` today.
- No capability/thermal gating implementation (change #5) or model-version-aware bulk reprocessing (change #10) — only the seams for them.
- No native module changes, no new dependency, no new path alias, no schema change (change #1 columns are reused).
- No redesign of the processing/progress or gallery screens; no thumbnail generation; no semantic-search wiring.
- No removal of `ProcessingService`'s in-memory queue code (deprecate-in-place only, to keep the change wiring-focused).

## Decisions

### D1: A new all-static `OrchestratorService` is the single connective hub

Create `src/services/orchestrator/OrchestratorService.ts` (new folder under `@services/*`) as an all-static class (repo convention). It imports the leaf services (`MediaDiscoveryService`, `MediaFileRepository`, `ProcessingQueueRepository`, `ProcessingService`, `SearchService`, `BackgroundTaskService`) and exposes:

- `initialize(): Promise<void>` — one-time boot: `BackgroundTaskService.initialize()` (loads checkpoint + settings), `SearchService.loadIndex()`, and stale-`processing` recovery (D5).
- `runInitialProcessing(): Promise<void>` — the trigger entry (D3): foreground discovery scan → upsert + enqueue → hand the drain to `BackgroundTaskService.start`.
- `enqueueDiscovered(changes: MediaChange[]): Promise<void>` — fold live/observer batches in incrementally (upsert + enqueue; remove on delete); kick the drain if idle.
- `processNext(): Promise<boolean>` — process exactly one pending `tier0_mlkit` item; `false` when the tier is drained (D4).
- `pause()` / `resume()` / `stop()` — delegate to `BackgroundTaskService`.
- `subscribe(listener: (event: OrchestratorEvent) => void): () => void` + private `emit` — a framework-agnostic observer API (D9). `OrchestratorEvent` is a closed discriminated union (`scan-progress` | `started` | `item-processed` | `item-failed` | `progress` | `paused` | `resumed` | `completed`), all fields typed (no `any`).
- `getSnapshot(): OrchestratorSnapshot` — current `{ processed, total, failed, isRunning, isPaused }` for hydration.

**Why one hub, all-static:** matches every sibling service, needs no instances, and gives a single, testable place where the pipeline order lives. **Alternatives:** (a) put orchestration inside the React bridge — rejected; it would couple the pipeline to React lifecycle, break on unmount, and can't run in the background task loop. (b) spread it across each repository — rejected; no single owner of ordering/idempotency/resumability.

### D2: Drive the REPO-BACKED queue via `BackgroundTaskService`; deprecate/bypass the in-memory queue

`ProcessingQueueRepository` is the **single source of truth**: it persists to SQLite, survives app kills, and already models priority/retry/state. The orchestrator's background tick calls `processNext()`; `BackgroundTaskService.start` supplies the loop, the battery/night gating, and the MMKV checkpoint. `ProcessingService` is used **only** as the stateless engine seam (`processMedia`/`getEngine`/`setEngine`).

`ProcessingService`'s in-memory queue (`queue`/`isProcessing`/`maxRetries`/`addToQueue`/`processQueue`/`clearQueue`/`getQueueLength`/`isQueueProcessing`/`setMaxRetries`, `ProcessingService.ts:16-112`) is **deprecated in place** (JSDoc `@deprecated` pointing at the orchestrator) and never called. Retry/priority now live in the orchestrator + `ProcessingQueueRepository` (`retryCount`/`markAsFailed`/`retry`, `:119-136`).

**Why deprecate, not delete:** the in-memory queue is volatile (a kill loses all pending work and cannot resume — the exact property the persistent queue provides) and duplicates the repo, so it must be bypassed; but deleting it touches `ProcessingService`'s exported `QueueItem` and grows the diff beyond wiring. `@deprecated` quarantines it with zero behavior change; a follow-up cleanup change can remove it. **Alternatives:** (a) bridge the two (mirror repo rows into memory) — rejected, doubles state and reintroduces the volatility; (b) delete now — deferred to keep this change wiring-only.

### D3: Trigger model — post-onboarding foreground scan + background continuation; live observer folds new media in

Processing kicks off when the app enters the **Main** tree (post-onboarding). `RootNavigator` already gates Onboarding → Main on `onboardingCompleted` (`RootNavigator.tsx:21-40`); the `OrchestratorBridge` (D9) mounts inside the provider stack and, when `onboardingCompleted` is true and permissions are granted, calls `OrchestratorService.initialize()` then `runInitialProcessing()`:

1. **Foreground scan** (fast, visible): `MediaDiscoveryService.startNativeScan(onBatch, onComplete)` with the `CameraRoll`/`RNFS` fallback when the native module is unavailable (`isNativeModuleAvailable`, `MediaDiscoveryService.ts:41-59`). Each batch → `convertMediaChange` → upsert `media_files` (dedupe by `uri`) → enqueue a `tier0_mlkit` row for each not-yet-processed file. Emit `scan-progress`.
2. **Background continuation** (durable): `BackgroundTaskService.start(tick, options)` where `tick = () => processNext()`; the bulk drain runs under battery/night gating and continues when the app is backgrounded.
3. **Live media:** `MediaDiscoveryService.startObserver(throttleMs, onBatch)` (the native `ContentObserver`) → `OrchestratorService.enqueueDiscovered(changes)` folds new/modified media in incrementally and kicks the drain if idle. A foreground delta scan via `AppSettingsRepository.getLastSyncTimestamp()`/`discoverNewMedia` (`MediaDiscoveryService.ts:352-357`) catches anything missed while the observer was down; `setLastSyncTimestamp` advances the watermark after a successful scan.

First run: user finishes onboarding → Main mounts → full scan + processing. Subsequent runs: Main mounts directly → `initialize` recovers state → the drain resumes any pending rows (no rescan needed, though the delta scan still runs).

**Why post-onboarding auto-start:** the user has just granted media access; auto-populating the library is the expected experience and requires no extra tap. **Alternatives:** (a) user-initiated "Start processing" button — recorded as a product question (auto-start is the default); (b) run during onboarding — rejected; permissions may not be granted yet and it competes with onboarding UI.

### D4: `processNext()` — the tier-aware, single-item drain

Each tick processes exactly one item so `BackgroundTaskService`'s loop keeps gating between items:

1. `queue = await ProcessingQueueRepository.getNextPendingByTaskType("tier0_mlkit")` (new tier-filtered query, D7) — preserves `priority desc, created_at asc`.
2. `null` → `emit({ type: "completed" })`; return `false` (the tick then calls `BackgroundTaskService.stop()`).
3. `await ProcessingQueueRepository.markAsProcessing(queue)`.
4. `media = await MediaFileRepository.findById(queue.mediaFileId)`; missing → `markAsCompleted` (orphan row) and return `true`.
5. **Idempotency guard (D5):** target version = `ProcessingService.getEngine().descriptor.modelVersion ?? descriptor.id` (Tier-0 `MlKitEngine` has no `modelVersion`, so `"mlkit"`). If `media.processedAt != null` **and** `media.aiModelVersion === target` **and** `queue.modelVersion` matches → skip analysis, `markAsCompleted`, return `true`.
6. `result = await ProcessingService.processMedia(media.uri)` — the engine seam (resolves, never rejects, per change #2).
7. `result.success`: `await MediaFileRepository.updateWithProcessingResult(media, result)` (now stamps `processed_at`/`ai_model_version`/`ai_schema_version`, D7) → `await SearchService.addToIndex(media.id)` (D8) → `markAsCompleted(queue)` → `BackgroundTaskService.setLastProcessedId(queue.id)` + `incrementProcessed()` → `emit({ type: "item-processed", mediaFileId, filename })`.
8. `!result.success`: `markAsFailed(queue, result.error ?? "unknown")` (increments `retryCount`); if `queue.retryCount < maxRetries` → `retry(queue)` (back to `pending`, lower effective priority); else `BackgroundTaskService.incrementFailed()` + `emit({ type: "item-failed", mediaFileId, filename, error })`.
9. `emit({ type: "progress", processed, total })` + `BackgroundTaskService.updateProgress(processed, total)`; return `true`.

The tick wrapper handed to `BackgroundTaskService.start` is `async () => { if (!(await OrchestratorService.processNext())) await BackgroundTaskService.stop(); }` — because that service's loop runs `currentTask()` repeatedly and never self-terminates on an empty queue (`BackgroundTaskService.ts:123-159`). `maxRetries` defaults to 1 (matching the prior `ProcessingService.maxRetries`).

**Why one item per tick:** keeps `shouldPauseProcessing` (battery/night) evaluated between every item and keeps each `database.write` transaction small. **Alternatives:** batch-per-tick — rejected; coarser gating and larger transactions with no throughput need at Tier-0.

### D5: Idempotency & resumability — persistent queue + `processed_at` guard + crash recovery

Four mechanisms make the pass safe to stop/resume and free of double-processing:

- **Dedupe on discovery:** upsert by `uri` (`MediaFileRepository.findByUri`, `:61-68`) — a rescan of an existing file updates in place; it never creates a duplicate `media_files` row and only enqueues when the file is unprocessed.
- **Version-aware skip:** `processNext` step 5 skips analysis when `processed_at` is set and the stamped `ai_model_version` equals the engine target — so a resumed or re-enqueued run does not redo completed work.
- **Durable state:** the queue lives in SQLite; `pending`/`processing`/`completed`/`failed` and `retry_count` survive process death. `BackgroundTaskService`'s MMKV checkpoint (`lastProcessedId`/`totalProcessed`/`totalFailed`/`isPaused`) restores counters and pause state on relaunch.
- **Crash recovery:** `initialize` resets any row left in `processing` (a run killed mid-item) back to `pending` via `ProcessingQueueRepository.retry`, so no item is stranded.

The stamped `processed_at` also restores change #1's invariant, so `MediaFileRepository.getUnprocessed()` (`Q.where("is_processed", false)`, `:77-82`) and the resumability queries agree.

**Why version-aware (not just a boolean):** a boolean `is_processed` cannot express "processed by an older model" — the version key lets change #10 re-enqueue a newer pass that this same guard will *not* skip. **Alternatives:** boolean-only skip — rejected; blocks future reprocessing.

### D6: Tier-aware and forward-compatible seams

- **Enqueue** carries `task_type = "tier0_mlkit"` and `model_version` from the engine descriptor. Tier-1 later enqueues `task_type = "tier1_gemma"` with its model id.
- **Selection** is per-tier (`getNextPendingByTaskType`), so a Tier-1 backlog never blocks Tier-0 and vice versa (fulfills `processing-queue-tiers`).
- **Engine mapping:** the orchestrator resolves the engine for a `task_type` via the change-#2 `EngineRegistry` (`getByTier`/`getById`) and `ProcessingService.setEngine`; today only `tier0`/`MlKitEngine` is registered, so Tier-1 registration is a pure add.
- **Idempotency key** = (`processed_at`, `ai_model_version`, `ai_schema_version`, `task_type`, `model_version`) — the join point for change #10's model-version-aware reprocessing.
- **Gating seam:** capability/thermal checks (change #5) slot into `BackgroundTaskService.shouldPauseProcessing` (already the pause authority) and an optional pre-select engine-capability check, with no orchestrator restructure.

**Why now:** encoding tier/version at enqueue and select time costs nothing today and prevents a rewrite when Tier-1 lands. **Alternative:** hard-code Tier-0 and ignore `task_type` — rejected; it re-buries the exact seam changes #5/#10 need and would re-violate `processing-queue-tiers`.

### D7: Close the two persistence wiring gaps (repo edits)

These are the minimal repository edits required for D4–D6 to be correct:

- **`ProcessingQueueRepository`:** extend `CreateProcessingQueueData` with `taskType: string` (default `"tier0_mlkit"`) and `modelVersion?: string`, and set them in `create` (`:21-35`). Add `getNextPendingByTaskType(taskType)` (mirrors `getNextPending` with an extra `Q.where("task_type", taskType)`) and `resetStaleProcessing()` (crash recovery, D5).
- **`MediaFileRepository`:** in `createWithProcessingResult`/`updateWithProcessingResult`, when `result.success`, also set `record.processedAt = new Date()` (WatermelonDB `@date`), `record.aiModelVersion = engineId`, `record.aiSchemaVersion = TIER0_SCHEMA_VERSION`, alongside the existing `isProcessed` (`:192,233`). Add `upsertFromDiscovered(data)` (find-by-uri → update-or-create) so the orchestrator has one idempotent entry point. Labels keep `source = "mlkit"`/`type = "tag"` (unchanged from change #1).

The engine id/version passed to the writer comes from `ProcessingService.getEngine().descriptor`, keeping provenance sourced from the change-#2 descriptor rather than a second hard-coded string.

**Why in the repositories (not the orchestrator):** these are data-shape concerns the repos already own; setting `processed_at` beside `is_processed` in the same `record.update` is the only place the invariant can be atomically enforced. **Alternative:** stamp from the orchestrator in a second write — rejected; two writes risk a torn state where `is_processed` and `processed_at` disagree.

### D8: Incremental search — `addToIndex` per file, not `index()` rebuild

On each successful persist, the orchestrator calls `SearchService.addToIndex(mediaFileId)` (`:77-109`), which discards-then-adds a single MiniSearch document and re-serializes. The full `index()` rebuild is **not** used in the hot path.

**Why:** rebuilding the entire index after every file is O(N) per file (O(N²) over a library) and re-reads every row; `addToIndex` is O(1) amortized and already exists. **Trade-off:** `addToIndex` re-serializes the whole index to MMKV each call (`serializeIndex`, `:166-170`) — acceptable at Tier-0 volumes; a later change can batch serialization. **Alternative:** full `index()` once at the end — rejected; it defeats the "results appear as they process" UX and loses incremental progress on a kill.

### D9: React bridge — a thin boundary, not orchestration in React

`OrchestratorService` is framework-agnostic. A single null-rendering component `src/components/system/OrchestratorBridge.tsx`, mounted once inside the provider stack in `App.tsx`, adapts it to React via `useEffect`:

- On mount (guarded by `useSettings().state.preferences.onboardingCompleted`): `OrchestratorService.initialize()` then `runInitialProcessing()`.
- `OrchestratorService.subscribe(...)` → map events to `ProcessingContext` dispatches (D10).
- Subscribe to `MediaFileRepository.observeVisible()` (`:151-156`) → dispatch `GalleryContext` `SET_MEDIA_FILES` with each emitted `MediaFile[]`. This is the reactive, idempotent way the gallery is finally populated: it reflects DB truth and folds in both newly discovered and newly processed media without manual reconciliation.
- Start `MediaDiscoveryService.startObserver(throttleMs, changes => OrchestratorService.enqueueDiscovered(changes))`; store and call the returned cleanup on unmount.
- Watch `SettingsContext` `batterySaver`/`nightProcessing` → `BackgroundTaskService.updateSettings(...)` so the gating authority stays in sync.

**Why a component that renders null:** it is the smallest unit that can hold `useEffect` subscriptions and read the three contexts; mounting it once in `App.tsx` is the single UI wiring point. **Alternatives:** (a) a bare hook called from `MainScreen`/`MainNavigator` — works, but scatters wiring into an existing screen; (b) have the orchestrator import the contexts — rejected; couples a static service to React and breaks background execution.

### D10: Progress and failure reporting via `ProcessingContext`

The bridge maps orchestrator events to the existing `ProcessingContext` actions (`ProcessingContext.tsx:36-47`): `started` → `START_PROCESSING`; `progress`/`scan-progress` → `UPDATE_PROGRESS` (`{ current, total, currentFileName }`); `item-failed` → `ADD_FAILED_FILE` (`{ mediaFileId, fileName, errorMessage, timestamp }`); `paused`/`resumed` → `SET_PAUSED`; `completed` → `STOP_PROCESSING`. `SET_CHECKPOINT` is fed from `BackgroundTaskService.getCheckpoint().timestamp`.

**Why map events (not dispatch from the service):** keeps dispatch on the React side while the service stays pure and unit-testable. **Alternative:** pass `dispatch` into the service — rejected; leaks React into the service and complicates background runs.

### D11: No new dependency, alias, or native code; acyclic import graph

All runtime deps are already installed (D-Impact). The orchestrator lives under `@services/*`, the bridge under `@components/*` — both aliases exist. Import edges: `OrchestratorService → { MediaDiscoveryService, MediaFileRepository, ProcessingQueueRepository, ProcessingService, SearchService, BackgroundTaskService }`; `OrchestratorBridge → { OrchestratorService, MediaDiscoveryService, BackgroundTaskService, MediaFileRepository, contexts }`. None of those import the orchestrator or the bridge → a DAG. `noExplicitAny` is honored with typed event/snapshot unions and generic `observe()` handlers.

## Risks / Trade-offs

- **`BackgroundTaskService.start` loop never self-terminates on an empty queue** (`:123`) → without a stop the loop spins. **Mitigation:** the tick calls `BackgroundTaskService.stop()` when `processNext()` returns `false` (D4).
- **Double-start / re-entrancy** (bridge remounts, or a live batch arrives mid-run) → two drains. **Mitigation:** `BackgroundTaskService.start` early-returns when `isRunning` (`:104-107`); `runInitialProcessing`/`enqueueDiscovered` are idempotent (dedupe by `uri`, guard on already-running) and only kick the drain when idle.
- **`unsafe`-free but torn state** if `is_processed` and `processed_at` were written separately → **Mitigation:** both are set in the same `record.update` inside one `database.write` (D7).
- **Stranded `processing` rows** after a crash → **Mitigation:** `resetStaleProcessing()` on `initialize` returns them to `pending` (D5).
- **`addToIndex` re-serializes the whole MiniSearch index per file** → write amplification on large libraries. **Mitigation:** accepted at Tier-0 scale; batched serialization is a documented later optimization (D8).
- **Battery drain on first-run bulk processing** with battery-saver defaulting off → **Mitigation:** gating honored the moment the user enables it; whether first-run should force charging-only is a product question (below).
- **Native `MediaObserver` unavailable** (older device / iOS variance) → **Mitigation:** `MediaDiscoveryService` already falls back to `CameraRoll`/`RNFS` (`:68-70`, `:248-272`); the orchestrator uses `discoverAllMedia` when `startNativeScan` reports no native module.
- **Deprecated-in-place in-memory queue** still compiles as dead surface → **Mitigation:** `@deprecated` + zero call sites; removal deferred to a cleanup change (D2).
- **`observeVisible()` full-list `SET_MEDIA_FILES` on every change** → re-renders the gallery on each processed file. **Mitigation:** acceptable (the reducer already replaces the array wholesale); throttling/`ADD_MEDIA_FILE` deltas are a later UI optimization.

## Migration Plan

Deploy order (also the tasks order):
1. **Repo gaps first** (unblock correctness): `ProcessingQueueRepository` (`taskType`/`modelVersion` on `create`, `getNextPendingByTaskType`, `resetStaleProcessing`); `MediaFileRepository` (stamp `processed_at`/`ai_model_version`/`ai_schema_version`, `upsertFromDiscovered`).
2. **Deprecate** `ProcessingService`'s in-memory queue (JSDoc only; engine seam untouched).
3. **Build** `OrchestratorService` (pipeline, event API, trigger, drain, idempotency/recovery, tier selection).
4. **Bridge** `OrchestratorBridge` and mount it in `App.tsx`; wire `ProcessingContext`/`GalleryContext`/`SettingsContext` and the live observer.
5. **Verify:** `npm run typecheck` (zero new errors vs the 8-error baseline) and `npm run lint` (touched files clean).

**Rollback:** unmounting `<OrchestratorBridge />` (revert the one `App.tsx` line) disables the pipeline entirely — the orchestrator has no other entry point. The repo/`ProcessingService` edits are additive (new optional fields, new methods, JSDoc) and safe to leave; no schema or data migration is involved, so rollback is code-only and forward-fixable.

## Open Questions

- **Auto-process vs user-initiated on first launch** — default is auto-start after onboarding; a "Start processing" affordance could gate the bulk pass instead. (Product question.)
- **First-run battery policy** — process immediately (current defaults, battery-saver off) vs force charging-only for the initial bulk pass to protect a new user's battery. (Product question.)
- **Live observer lifetime** — always-on throttled `ContentObserver` vs foreground-only delta sync via `lastSyncTimestamp`. Default: both (observer while foregrounded + delta scan on resume). (Product question.)
- **Retry ceiling** — `maxRetries = 1` (prior default) before a file is surfaced as permanently failed; revisit if transient ML Kit failures warrant more. (Product question.)
- **Reprocessing trigger for change #10** — user-initiated re-enqueue vs automatic on model/schema-version bump; the idempotency key is ready either way. (Deferred.)
- **Whether to delete (not just deprecate) the in-memory queue** — deferred to a focused cleanup change to keep this one wiring-only.
