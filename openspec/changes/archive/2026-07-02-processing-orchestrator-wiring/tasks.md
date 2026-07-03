## 1. Baseline capture

- [x] 1.1 Run `npm run typecheck` on a clean tree and record the baseline: exactly 8 `TS6133` errors in unrelated UI files (`OnboardingScreen.tsx:11`, `MainTemplate.tsx:56`, `AlbumList.tsx:16,74`, `AnimatedBottomNav.tsx:101,136`). The bar for this change is ZERO NEW typecheck errors relative to this set.
- [x] 1.2 Note that `npm run lint` (`biome check .`) has many pre-existing issues in untouched files; the bar is per-touched-file cleanliness (tabs, double quotes, organized imports, no `noExplicitAny`), not a repo-wide zero.

## 2. Close the ProcessingQueueRepository wiring gaps (`src/services/database/ProcessingQueueRepository.ts`)

- [x] 2.1 Extend `CreateProcessingQueueData` with `taskType: string` and `modelVersion?: string`; in `create` (`:21-35`) set `queue.taskType = data.taskType` and `queue.modelVersion = data.modelVersion` alongside the existing fields.
- [x] 2.2 Default the tier at the enqueue call site (orchestrator passes `taskType: "tier0_mlkit"`); ensure `create` never leaves `task_type` empty (guard/`??` to `"tier0_mlkit"` if you choose a default in the repo).
- [x] 2.3 Add `static async getNextPendingByTaskType(taskType: string): Promise<ProcessingQueue | null>` mirroring `getNextPending` (`:79-90`) with an added `Q.where("task_type", taskType)`, preserving `Q.sortBy("priority", Q.desc)` then `Q.sortBy("created_at", Q.asc)`.
- [x] 2.4 Add `static async resetStaleProcessing(): Promise<void>` that fetches `getProcessing()` (`:71-73`) and returns each row to `pending` via `retry(row)` (or an update to `{ status: "pending" }`), for crash recovery.
- [x] 2.5 Keep all existing methods and the pending/processing/completed/failed semantics unchanged; add no `any`; keep tabs/double quotes.

## 3. Close the MediaFileRepository persistence gaps (`src/services/database/MediaFileRepository.ts`)

- [x] 3.1 In `createWithProcessingResult` (`:173-224`) and `updateWithProcessingResult` (`:226-278`), when `processingResult.success`, in the SAME `record.update`/`record.create` that sets `isProcessed`, also set `record.processedAt = new Date()`, `record.aiModelVersion = <engineId>`, and `record.aiSchemaVersion = <TIER0_SCHEMA_VERSION>`. Preserve the invariant `is_processed === (processed_at !== null)` (do not stamp `processed_at` when `success` is false).
- [x] 3.2 Thread the engine id/version into the writers: accept them as parameters (e.g. an optional `provenance: { modelVersion: string; schemaVersion: number }`) sourced by the orchestrator from `ProcessingService.getEngine().descriptor`, defaulting to the Tier-0 `"mlkit"` id when the descriptor has no `modelVersion`. Do not hard-code a second provenance string.
- [x] 3.3 Keep the existing label writes hard-coding `label.source = "mlkit"` / `label.type = "tag"` (`:205-206,259-260`) unchanged (change #1 behavior).
- [x] 3.4 Add `static async upsertFromDiscovered(data: CreateMediaFileData): Promise<{ mediaFile: MediaFile; created: boolean }>` that looks up by `uri` via `findByUri` (`:61-68`) and updates in place or calls `create`, giving the orchestrator one idempotent entry point (dedupe by `uri`).
- [x] 3.5 Confirm `ProcessingResult`'s import path (`@services/ml/ProcessingService`, `:5`) is unchanged; add no `any`; keep tabs/double quotes.

## 4. Deprecate and bypass the in-memory queue (`src/services/ml/ProcessingService.ts`)

- [x] 4.1 Add JSDoc `@deprecated` (pointing at `OrchestratorService` + `ProcessingQueueRepository`) to the in-memory queue members: `queue`, `isProcessing`, `maxRetries`, `addToQueue`, `processQueue`, `clearQueue`, `getQueueLength`, `isQueueProcessing`, `setMaxRetries` (`:16-112`). Do not delete them (keeps the diff wiring-only).
- [x] 4.2 Leave the engine seam (`processMedia`/`getEngine`/`setEngine`, `:29-39`) and the `ProcessingResult`/`QueueItem` exports UNCHANGED. Confirm the orchestrator will call only `processMedia`/`getEngine`/`setEngine`, never `addToQueue`/`processQueue`.

## 5. Build the OrchestratorService (`src/services/orchestrator/OrchestratorService.ts`, new)

- [x] 5.1 Create the folder `src/services/orchestrator/` (under the existing `@services/*` alias; no `tsconfig.json`/`babel.config.js` change) and the file. Declare `export class OrchestratorService` (all-static).
- [x] 5.2 Define typed, closed unions with no `any`: `OrchestratorEvent` (discriminated union: `started` | `scan-progress` | `item-processed` | `item-failed` | `progress` | `paused` | `resumed` | `completed`, each carrying only typed fields) and `OrchestratorSnapshot` (`{ processed: number; total: number; failed: number; isRunning: boolean; isPaused: boolean }`).
- [x] 5.3 Implement `subscribe(listener: (e: OrchestratorEvent) => void): () => void` over a `private static listeners = new Set<...>()`, plus a private `emit(e)` and `getSnapshot()`.
- [x] 5.4 Implement `static async initialize(): Promise<void>`: call `BackgroundTaskService.initialize()`, `SearchService.loadIndex()`, and `ProcessingQueueRepository.resetStaleProcessing()` (crash recovery). Guard against double-init.
- [x] 5.5 Implement discovery+enqueue: for a batch, map `MediaChange` → `DiscoveredMedia` (via `MediaDiscoveryService.convertMediaChange`, `:178-192`), `MediaFileRepository.upsertFromDiscovered`, and — when the file is not already processed — `ProcessingQueueRepository.create({ mediaFileId, status: "pending", priority, taskType: "tier0_mlkit" })`. Use `MediaDiscoveryService.discoverAllMedia` as the fallback when the native module is unavailable (`isNativeModuleAvailable === false`).
- [x] 5.6 Implement `static async processNext(): Promise<boolean>` per design D4: `getNextPendingByTaskType("tier0_mlkit")` → `null` emits `completed` and returns `false`; else `markAsProcessing` → `findById` (orphan → `markAsCompleted`) → version-aware skip guard (`processed_at` + `ai_model_version` match → `markAsCompleted`) → `ProcessingService.processMedia(uri)` → on success `updateWithProcessingResult` (with provenance) + `SearchService.addToIndex` + `markAsCompleted` + `BackgroundTaskService.setLastProcessedId`/`incrementProcessed` + emit `item-processed`; on failure `markAsFailed` then `retry` while under budget else emit `item-failed`; finally emit `progress` + `BackgroundTaskService.updateProgress`; return `true`.
- [x] 5.7 Implement `static async runInitialProcessing(): Promise<void>`: run the foreground scan (`MediaDiscoveryService.startNativeScan` with `discoverAllMedia` fallback) enqueuing batches, emit `started`/`scan-progress`, then start the background drain via `BackgroundTaskService.start(tick, options)` where `tick = async () => { if (!(await OrchestratorService.processNext())) await BackgroundTaskService.stop(); }`. Early-return if already running.
- [x] 5.8 Implement `static async enqueueDiscovered(changes: MediaChange[]): Promise<void>` (upsert + enqueue new/modified; on `action === "deleted"` remove via `MediaFileRepository`/`SearchService.removeFromIndex`) and kick the drain if idle. Implement `pause()`/`resume()`/`stop()` delegating to `BackgroundTaskService`, emitting `paused`/`resumed`.
- [x] 5.9 Confirm the import graph is a DAG (`OrchestratorService` imports the leaf services only; none import it) and there is no `any`.

## 6. Build the React bridge and mount it (`src/components/system/OrchestratorBridge.tsx` + `src/App.tsx`)

- [x] 6.1 Create `src/components/system/OrchestratorBridge.tsx`: a component that renders `null` and holds the wiring in `useEffect`. Consume `useGallery`, `useProcessing`, `useSettings`.
- [x] 6.2 On mount, when `useSettings().state.preferences.onboardingCompleted` is true and permissions are granted, call `OrchestratorService.initialize()` then `runInitialProcessing()`.
- [x] 6.3 Subscribe via `OrchestratorService.subscribe` and map events to `ProcessingContext` dispatches: `started` → `START_PROCESSING`; `progress`/`scan-progress` → `UPDATE_PROGRESS`; `item-failed` → `ADD_FAILED_FILE`; `paused`/`resumed` → `SET_PAUSED`; `completed` → `STOP_PROCESSING`. Unsubscribe on unmount.
- [x] 6.4 Subscribe to `MediaFileRepository.observeVisible()` (`:151-156`) and dispatch `GalleryContext` `SET_MEDIA_FILES` with each emitted `MediaFile[]`; unsubscribe on unmount.
- [x] 6.5 Start `MediaDiscoveryService.startObserver(throttleMs, changes => OrchestratorService.enqueueDiscovered(changes))`; store and call the returned cleanup on unmount.
- [x] 6.6 Watch `SettingsContext` `batterySaver`/`nightProcessing` and call `BackgroundTaskService.updateSettings({ batterySaverEnabled, nightProcessingEnabled })` on change.
- [x] 6.7 Edit `src/App.tsx` (`:16-37`) to mount `<OrchestratorBridge />` once inside the provider stack (inside `SearchProvider`, alongside `RootNavigator`) so it can read all three contexts. This is the single UI wiring change and the sole pipeline entry point.

## 7. Wiring and consistency checks

- [x] 7.1 Grep-verify the previously dead call sites now exist: `ProcessingService.processMedia`, `MediaFileRepository.updateWithProcessingResult`/`upsertFromDiscovered`, `ProcessingQueueRepository.create`/`getNextPendingByTaskType`, `BackgroundTaskService.start`, and `SET_MEDIA_FILES` are all reachable from `OrchestratorService`/`OrchestratorBridge`.
- [x] 7.2 Confirm the orchestrator never calls `ProcessingService.addToQueue`/`processQueue`/`clearQueue` (the deprecated in-memory queue) and never calls `SearchService.index()` in the per-file hot path (only `addToIndex`).
- [x] 7.3 Confirm every new `processing_queue` row has a non-empty `task_type`, and every successful persist stamps `processed_at`/`ai_model_version` (invariant `is_processed === (processed_at !== null)` holds).
- [x] 7.4 Confirm no Gemma, no native module change, no new npm dependency (`package.json` unchanged), and no new path alias (`tsconfig.json`/`babel.config.js` unchanged).
- [x] 7.5 Confirm no `any` in any new/edited file and the import graph is acyclic (orchestrator/bridge are leaves-consumers).

## 8. Verification (zero new typecheck errors; touched files Biome-clean)

- [x] 8.1 Run `npm run typecheck` (`tsc --noEmit`) and confirm the error set is UNCHANGED from the task 1.1 baseline — the new/edited files add ZERO new errors (respect `noExplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`). Note: wiring `MediaDiscoveryService` back into use may clear the `OnboardingScreen.tsx:11` baseline error, which is acceptable (fewer, never more).
- [x] 8.2 Run `npm run lint` (`biome check .`) and confirm the touched files (`OrchestratorService.ts`, `OrchestratorBridge.tsx`, `ProcessingQueueRepository.ts`, `MediaFileRepository.ts`, `ProcessingService.ts`, `App.tsx`) are clean — tabs, double quotes, organized imports, no `noExplicitAny` — without sweeping unrelated pre-existing repo issues.
- [x] 8.3 If any touched-file formatting is flagged, run `npm run lint:fix` and re-verify that only the touched files changed.
