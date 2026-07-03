## Context

The Visara pipeline (#3) discovers media, enqueues one durable `processing_queue` row per file, and drains it one item per background tick through `OrchestratorService.processNext` (`src/services/orchestrator/OrchestratorService.ts:185-268`), persisting via `MediaFileRepository.updateWithProcessingResult` and refreshing search via `SearchService.addToIndex`. Two facts leave the **existing library** frozen at its first-pass model:

1. **Discovery never re-enqueues processed files.** `ingestDiscovered` bails on `if (mediaFile.isProcessed) return;` (`OrchestratorService.ts:363`), and `runInitialProcessing` emits `completed` when the queue is empty (`:146-150`). A model/engine upgrade does not, by itself, produce any new queue rows.
2. **The join point exists but is unused.** #3 built a **version-aware skip guard** keyed on `processed_at` + `ai_model_version` + `queue.modelVersion` (`OrchestratorService.ts:206-214`) precisely so a *newer* pass is **not** skipped, and called out the deferred owner in-code: *"A newer model (change #10) will not match here"* (`:205`). The schema is ready: `media_files.ai_model_version/ai_schema_version/processed_at` (`schema.ts:27-30`), `processing_queue.task_type` (indexed) + `model_version` (`schema.ts:92-93`), `labels.source/model_version` (`schema.ts:44-46`), and an `embeddings.model_version` (`schema.ts:105-110`).

#5 adds `DeviceCapabilityService.canRunTier1()` = capability (RAM/disk/ABI, fail-closed) **AND** `ThermalService` not throttled at the Tier-1 threshold, exposed but **wired to no consumer**. #7 (dependency) registers the Tier-1 **Gemma** `AnalysisEngine` in the `EngineRegistry` (`src/services/ml/engines/EngineRegistry.ts`) and adds the `tier1_gemma` drain stream that the #3 `processing-orchestrator` spec already declares a forward-compatible seam ("Adding a Tier-1 (`tier1_gemma`) stream later SHALL require registering an engine and enqueuing that `task_type`, without restructuring the orchestrator").

This change is the **planner** that feeds those seams: it decides *what* to re-enqueue, *at what priority*, *under what gate*, and *how to resume* — reusing #3's durable queue + version-aware skip + MMKV checkpoint and #5's `canRunTier1()`. It runs **no model** itself (Tier-0 is `MlKitEngine`, Tier-1 is #7's Gemma engine).

**Constraints:** Biome (tabs, double quotes, `noExplicitAny: error`), strict TS, all-static services, legacy decorators, `@services`/`@models`/`@utils` aliases. No DB/schema change (columns exist), no new dependency, no change to the persist write shape.

## Goals / Non-Goals

**Goals:**
- An all-static `LibraryReprocessingService` that computes a reprocess plan from `ai_model_version` mismatch vs the current target descriptor(s) and enqueues it into `ProcessingQueueRepository` with correct `task_type`/`model_version`/`priority`.
- **Tier-0 broad** backfill; **Tier-1 selective + prioritized** (favorites → recent → recently-opened); a composite Tier-1 admission gate `canRunTier1()` **AND** charging **AND** night that is *never a blanket pass*.
- **Resumable** (MMKV sweep cursor), **idempotent** (reuse #3's version-aware skip + duplicate-active-row guard), **safe to stop** (enqueue-then-overwrite-in-place; no destructive reset).
- A user **"Re-run analysis"** action in Settings; progress via the existing #3 bridge.
- A **rollback-if-worse** quality gate that never overwrites good enrichment with failed/empty output.
- A forward-compatible **embedding** stream (schedule-only).

**Non-Goals:**
- Implementing the Gemma engine, the `tier1_gemma` per-item drain, or any embedding engine — those are #7 / later. This change wires **no** model call.
- Changing the persist write shape (`MediaFileRepository.updateWithProcessingResult`), the DB schema, `SearchService` internals, or any Tier-0 discovery/drain behavior.
- A schema-version-only reprocessing trigger (the #3 skip guard keys on `ai_model_version`, not schema — see D2 / Open Questions).
- Automatic reprocessing on model-version bump — the trigger here is the explicit Settings action (auto-on-bump is an Open Question).

## Decisions

### D1: A dedicated `LibraryReprocessingService` planner that enqueues but never drains

Add `src/services/orchestrator/LibraryReprocessingService.ts` (all-static, co-located with the orchestrator it feeds, with the sibling `noStaticOnlyClass` biome-ignore header). It owns three responsibilities and **nothing else**: (a) compute which files are stale per tier, (b) enqueue them via `ProcessingQueueRepository.create` with the correct `task_type`/`model_version`/`priority`, (c) checkpoint the sweep. Draining stays the single responsibility of `OrchestratorService` + `BackgroundTaskService` (#3) and #7's Tier-1 stream — the planner calls `OrchestratorService`'s existing drain kick after enqueue.

**Why:** the #3 spec makes the orchestrator "the single entry point that drives [the pipeline] sequence; no other component SHALL reimplement the ordering." A separate planner respects that — it produces queue rows, exactly like discovery does, and lets the unchanged drain consume them.

**Alternatives:** fold reprocessing into `OrchestratorService.runInitialProcessing` — rejected; that path early-returns on already-processed files (`:363`) and on an empty queue (`:146`), and conflates first-run discovery with backfill. A React-side loop — rejected; the planner must run headless under the background task, like every sibling service.

### D2: Reset = enqueue-then-overwrite-in-place, keyed on `ai_model_version`; no destructive up-front wipe

The sweep does **not** null `processed_at` or delete labels ahead of time. For each stale file it creates a `processing_queue` row (`status:"pending"`, the tier's `task_type`, `model_version = target`), and lets the normal drain overwrite the row in place on success — `updateWithProcessingResult` already advances `ai_model_version`/`ai_schema_version` atomically with `is_processed` (`MediaFileRepository.ts:300-312`), preserving #1's `is_processed === (processed_at !== null)` invariant. "Stale" is defined **by `ai_model_version` mismatch** (per the task and the #3 skip guard, which compares `media.aiModelVersion === provenance.modelVersion` at `OrchestratorService.ts:207-208`): a file is Tier-0-stale when `processedAt == null` **or** `aiModelVersion !== tier0Target.modelVersion`.

**Why:** an up-front `processed_at = null` bulk reset would (a) flip the whole library to "unprocessed", regressing the gallery/search and `getUnprocessed()` (`MediaFileRepository.ts:102-107`) mid-sweep, and (b) be unsafe to interrupt — a kill would strand the library in a half-reset state. Enqueue-then-overwrite is atomic per file and interrupt-safe: a killed sweep leaves a partially-filled queue that drains normally.

**Caveat (Open Question):** the #3 skip guard ignores `ai_schema_version`, so a **schema-only** bump (same model id, new output contract) would be *skipped* by `processNext`. This change therefore keys on model version only; a schema-only migration needs the #3 guard extended to compare `ai_schema_version` and is out of scope here.

**Alternatives:** bulk `UPDATE media_files SET processed_at = NULL` then re-drain via discovery — rejected (destructive, non-resumable, regresses search); a shadow table of pending reprocess ids — rejected (re-implements the durable queue #3 already provides).

### D3: Tier-0 broad, Tier-1 selective + prioritized, over distinct `task_type` streams

`task_type` keeps the streams independent (`ProcessingQueueRepository.getNextPendingByTaskType`, `src/services/database/ProcessingQueueRepository.ts:104-118`), so a large Tier-0 backlog never blocks the small Tier-1 selection and vice-versa (the #3 "distinct tiers scheduled independently" requirement).

- **Tier-0 (`tier0_mlkit`) — broad.** Enqueue *every* Tier-0-stale file, at a **negative** priority band (`TIER0_BACKFILL_PRIORITY`, e.g. `-10`) so it sorts **after** live discovery (which enqueues at `priority: 0`, `OrchestratorService.ts:377`) — new photos still process before old re-tags, since selection is `priority DESC, created_at ASC` (`ProcessingQueueRepository.ts:111-114`).
- **Tier-1 (`tier1_gemma`) — selective.** Enqueue only a **prioritized selection**, never the whole library, at descending within-stream priority bands (D4). `model_version` on each row = the Gemma target (from the #7 Tier-1 descriptor).
- **Embedding (`embedding`) — forward-compat, schedule-only.** When (and only when) an embedding engine is registered, the sweep MAY enqueue `embedding` rows for files whose `embeddings.model_version` is stale/missing (semantic-embeddings "identify stale embeddings"). No embedding engine is wired here.

**Alternatives:** one merged stream with a `tier` priority — rejected; a Tier-1 backlog would starve Tier-0 and defeats the independent-stream selection #3 built.

### D4: Tier-1 prioritization from the signals that actually exist — favorites, recency; recently-opened is a NEW optional signal

Within the `tier1_gemma` stream, priority (DESC) uses only columns the schema has today:
- `TIER1_PRIORITY_FAVORITE` (highest) — `is_favorite = true` (`MediaFileRepository.getFavorites`, `:109-118`).
- `TIER1_PRIORITY_RECENT` — `creation_date` within `TIER1_RECENT_WINDOW_DAYS` (default **90**), ordered `creation_date DESC` (`MediaFileRepository.getVisible` ordering, `:127-132`).
- `TIER1_PRIORITY_ENGAGED` — recently-**opened**. **There is no `last_opened_at` column and no viewed-tracking store** (confirmed: `MediaFile` has no such field, `src/models/MediaFile.ts`; no MMKV key). Proposed mechanism: a small MMKV **recently-viewed ring** (bounded list of media ids) written from the media detail/modal viewer under Main. This is **optional** — the core policy runs on favorites + recency alone — and is flagged POC/product-dependent so the change does not block on a new signal.

The **tail** (non-selected library) is **not** enqueued for Tier-1 by default (Tier-1 is selective). An optional `TIER1_PRIORITY_TAIL` (`0`) trickle for idle/charging/cool/night devices is deferred behind a flag.

All bands, the window, and the selection breadth are named constants and **POC-dependent** (re-tune once #4 reports Gemma latency/quality).

**Alternatives:** treat the whole library as Tier-1 with pure recency ordering — rejected; violates "selective" and would run Gemma on thousands of low-value files. Add a `last_opened_at` DB column now — rejected as scope creep into #1's schema; the MMKV ring is non-schema and reversible.

### D5: Tier-1 admission is a composite gate — `canRunTier1()` AND charging AND night — never a blanket pass

Expose one predicate the #7 Tier-1 drain calls before each `tier1_gemma` item:

```
LibraryReprocessingService.mayRunTier1Now()  =
    DeviceCapabilityService.canRunTier1()      // #5: capability + live disk + thermal@Tier-1, fail-closed
 && (await isDeviceCharging())                 // src/utils/device/battery.ts (always required, not just battery-saver)
 && withinTier1Window()                        // night window, reused from BackgroundTaskService (00:00–06:00)
```

This is **layered on top of** the shared drain gate — `BackgroundTaskService.shouldPauseProcessing` (battery-saver, night, and #5 thermal-for-drain, `BackgroundTaskService.ts:309-334`) still pauses the *whole* background loop. The Tier-1 predicate adds the axes that gate specifically apply to the heaviest pass:
- **Charging — always.** `shouldPauseProcessing` only requires charging when battery-saver is *on* (`:316-321`). Tier-1 is the top energy **and** heat source, so it requires charging **unconditionally** via `isDeviceCharging()` (`battery.ts:48`).
- **Night — always.** Tier-1's heavy batch defaults to the overnight window, reusing the same 00:00–06:00 predicate the night setting uses (`BackgroundTaskService.ts:325-327`), independent of the user's Tier-0 night toggle. (Whether a charging + cool + idle device may also run Tier-1 in daytime is an Open Question.)
- **Thermal + capability + disk** come from `canRunTier1()` (#5), which fails **closed**.

Because `canRunTier1()` fails closed and this predicate ANDs three more conditions, a missing #5/#7, a non-charging device, or daytime all yield `false` → the Tier-1 stream simply idles, Tier-0 is unaffected. This mirrors #5's own "expose the check, wire no consumer" stance: this change ships `mayRunTier1Now()` as a **pure, testable** predicate; #7's drain is its consumer.

**Alternatives:** reuse `shouldPauseProcessing` alone for Tier-1 — rejected; it neither guarantees charging nor consults capability/disk. Put the composition inside #5's `canRunTier1()` — rejected; charging/night are reprocessing-scheduling policy, not device capability, and #5 explicitly scoped charging as an Open Question for the consumer.

### D6: Resumable sweep via an MMKV checkpoint distinct from the drain checkpoint

Add `REPROCESS_CHECKPOINT` to `STORAGE_KEYS` (`src/utils/constants/storage-keys.ts`; sits beside the existing `PROCESSING_CHECKPOINT` and #5's `DEVICE_CAPABILITY_SNAPSHOT`). It stores a JSON `{ status, phase, cursor, tier0Enqueued, tier1Enqueued, startedAt }`. The **enqueue sweep** pages `media_files` deterministically (e.g. `creation_date DESC`, bounded pages), advancing `cursor` after each page so a kill mid-sweep resumes from the cursor rather than restarting. `resumeIfPending()` (called from `OrchestratorService.initialize`, `:113-125`) continues an interrupted sweep. The **drain** needs no new checkpoint — #3's durable queue + `ProcessingQueueRepository.resetStaleProcessing` (`:125-130`) + `BackgroundTaskService` checkpoint already make draining resumable.

Idempotency of enqueue reuses the discovery guard pattern (`OrchestratorService.ts:366-372`): before creating a row, skip files that already have a `pending`/`processing` row for that `task_type` (extend `findByMediaFileId` filtering), and rely on the #3 version-aware skip to no-op any row that is already current by drain time.

**Alternatives:** hold the whole stale-id set in memory — rejected; not durable across a kill and unbounded for large libraries. A separate SQLite sweep-state table — rejected; MMKV matches the existing checkpoint pattern with zero schema change.

### D7: Rollback-if-worse — preserve prior enrichment; never overwrite good data with failed/empty output

Two layers, one built-in and one added:
- **Built-in (provenance isolation).** `labels.source` (#1) already keeps `mlkit` and `gemma` labels distinct; a correct Tier-1 re-run replaces only `source = "gemma"` rows, leaving Tier-0 labels intact (label-provenance requirement). So a bad Tier-1 pass cannot destroy Tier-0 data. **Caveat (Risk/Dependency):** the *current* Tier-0 `updateWithProcessingResult` deletes **all** labels for a file regardless of source (`MediaFileRepository.ts:315-317`), so a Tier-0 *re-run* would clobber `gemma` labels — reconciling that with the source-scoped rule is a persistence fix owned by #7's Gemma-persist wiring, **not** this change's write-shape edit. This change compensates by **ordering**: for a file selected for both, Tier-0 backfill is enqueued at a lower priority so it drains first, and Tier-1 (re)generates afterward.
- **Added (quality gate).** Before a Tier-1 result overwrites a file that already has enrichment, apply an acceptance predicate: reject `success === false`, and reject empty output (no caption AND no description AND no gemma labels). On rejection, **do not overwrite** — the file keeps its last-good enrichment and the queue row is failed under the normal retry budget (`OrchestratorService.ts:235-253`). This is *preserve-prior*, the tractable form of rollback (on-device we cannot reliably score "gibberish").

The concrete "worse/unacceptable" predicate — empty vs low-confidence vs latency-driven — is **POC-dependent (#4 gate output shape/quality)** and MUST be re-tuned; the spec fixes the *contract* (never overwrite good with failed/empty), the threshold is a constant.

**Alternatives:** always overwrite and rely on a later re-run — rejected; loses a good caption to a transient bad pass. Snapshot the prior row for true revert — deferred; preserve-prior + provenance isolation already prevents data loss without a snapshot table.

### D8: User trigger in Settings, progress through the existing bridge

Add `onReRunAnalysis` to `SettingsDrawerProps` and a button row in the **Processing** section (`SettingsDrawer.tsx:197-200`), styled and confirmed like the existing `Delete All Data` / `Clear Cache` rows (a heavy op ⇒ an `Alert` confirm, `:120-135`). `SettingsScreen.tsx` wires it to `LibraryReprocessingService.requestReprocess()`. The action is **idempotent**: while a sweep or drain is active it is a no-op (or shows in-progress), reusing `OrchestratorService.getSnapshot()`/`BackgroundTaskService.isTaskRunning()`. Progress needs **no new UI** — the drain already emits the #3 `OrchestratorEvent`s that `OrchestratorBridge` maps onto `ProcessingContext` (`orchestrator-gallery-bridge` spec), so reprocessing shows in the same progress surface as first-run processing.

**Alternatives:** a new reprocessing context/screen — rejected; duplicates the #3 progress plumbing. A `SettingsContext` reducer action — unnecessary; the trigger is a fire-and-forget service call like `onClearCache`, not persisted UI state.

## Risks / Trade-offs

- **Tier-0 re-run clobbers `gemma` labels via the non-source-scoped delete (`MediaFileRepository.ts:315-317`).** → Compensated by enqueue **ordering** (Tier-0 before Tier-1 per file) and flagged as a persistence prerequisite for #7; this change does not edit the write shape.
- **`ai_schema_version`-only bumps are skipped by the #3 guard (`OrchestratorService.ts:207-208`).** → Scoped out; reprocessing keys on `ai_model_version` (per the task). Extending the guard is an Open Question.
- **Tier-1 rows enqueued before #7 lands sit `pending` indefinitely.** → Safe (idempotent, resumable, gated) and harmless — they drain once #7 registers the Gemma stream. The Settings action can gate Tier-1 enqueue behind "a Tier-1 engine is registered" (`EngineRegistry.getByTier("tier1")` non-empty) so nothing is enqueued that cannot be consumed.
- **"Recently-opened" has no backing signal.** → Core policy runs on favorites + recency; the MMKV recently-viewed ring is optional and deferred.
- **A full-library Tier-0 backfill is a large batch on big libraries.** → Bounded by the negative-priority band (fresh media first), the durable queue's one-item-per-tick gating, and full pause/resume; it is interrupt-safe and never blocks the UI.
- **Rollback "worse" is only preserve-prior, not quality-scoring.** → Accepted; provenance isolation + reject-empty/failed prevents data loss. True quality scoring is POC-dependent and deferred.
- **Re-tapping "Re-run analysis" spams enqueue.** → The idempotent guard (active sweep/drain ⇒ no-op) and the duplicate-active-row check prevent stacking.

## Migration Plan

Additive and reversible; JS-only (agent-verifiable against the typecheck baseline), with the on-device Tier-1 behavior verified by a human once #7 + a real device are available.

1. **Planner + policy (agent-run):** add `LibraryReprocessingService` (stale scan, tier-tagged enqueue, priority bands, sweep checkpoint, `mayRunTier1Now()`, `requestReprocess()`, `resumeIfPending()`); add `REPROCESS_CHECKPOINT`. `tsc`/Metro/Biome clean.
2. **Settings action (agent-run):** `onReRunAnalysis` prop + Processing-section row + `SettingsScreen` wiring; confirm + idempotent.
3. **Resume hook (agent-run):** call `resumeIfPending()` from `OrchestratorService.initialize`.
4. **Consumption (with #7, human-verified on device):** #7's `tier1_gemma` drain calls `mayRunTier1Now()` per item and the Tier-1 acceptance gate before persist; verify on an M-class iPad Pro / Android flagship that Tier-1 runs only while charging, cool, in-window, and skips/keeps-prior on empty output.

**Rollback:** delete `LibraryReprocessingService.ts`, the `REPROCESS_CHECKPOINT` key, the `onReRunAnalysis` prop/row/handler, and the one `resumeIfPending()` call. No schema, no data, no dependency change; the #3 Tier-0 pipeline is unaffected.

## Open Questions

- **Trigger model:** explicit Settings action only (this change), or **also** auto-enqueue on a detected `ai_model_version` bump at startup? The idempotency key is ready for either.
- **Daytime Tier-1:** must Tier-1 always wait for the night window, or may a charging + cool + idle device run it in daytime (relaxing D5's night axis)? — POC/product.
- **Selection breadth / bands / window:** are favorites + 90-day recency the right Tier-1 selection, and are the priority bands and `TIER1_RECENT_WINDOW_DAYS` correct before #4 reports Gemma per-image latency? — POC-dependent.
- **Rollback predicate:** what exactly is "worse" beyond failed/empty once #4 reports Gemma output shape/quality (confidence? length? language?)? — POC-dependent.
- **Schema-version bumps:** extend the #3 skip guard to compare `ai_schema_version`, or keep reprocessing model-version-only?
- **Recently-opened signal:** add the MMKV recently-viewed ring now, or defer until product asks for opened-priority?
- **Embedding stream:** enqueue `embedding` rows opportunistically now (schedule-only), or wait until an embedding engine is registered to avoid orphan pending rows?
