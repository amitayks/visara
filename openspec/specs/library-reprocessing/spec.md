# library-reprocessing Specification

## Purpose
TBD - created by archiving change library-reprocessing-backfill. Update Purpose after archive.
## Requirements
### Requirement: A reprocessing planner enqueues by model-version mismatch

The system SHALL provide an all-static `LibraryReprocessingService` that computes which already-processed `media_files` are stale by comparing each row's stored `ai_model_version` against the current target engine descriptor (`ProcessingService.getEngine().descriptor` for Tier-0; the registered Tier-1 descriptor from `EngineRegistry` for Tier-1) and enqueues each stale file into the durable `ProcessingQueueRepository`. The planner SHALL NOT drain the queue and SHALL NOT invoke any analysis engine itself; draining remains the responsibility of `OrchestratorService` and its tier streams. A file SHALL be treated as Tier-0-stale when its `processed_at` is null OR its `ai_model_version` differs from the Tier-0 target model version.

#### Scenario: A file processed by an older model is enqueued

- **WHEN** the reprocess sweep runs and a `media_files` row has `ai_model_version` different from the current Tier-0 target
- **THEN** a `processing_queue` row is created for it via `ProcessingQueueRepository.create` with `task_type = "tier0_mlkit"` and `model_version` set to the Tier-0 target
- **AND** the planner does not itself call any engine

#### Scenario: A file already at the current version is not enqueued

- **WHEN** the sweep evaluates a `media_files` row whose `ai_model_version` equals the current Tier-0 target and `processed_at` is non-null
- **THEN** no new `processing_queue` row is created for it

### Requirement: Tier-0 backfills broadly and Tier-1 is enqueued as a distinct stream

The planner SHALL enqueue every Tier-0-stale file for the `tier0_mlkit` stream (a broad backfill) and SHALL enqueue Tier-1 work only on the `tier1_gemma` stream, using `processing_queue.task_type` so the two streams are selected independently and neither backlog blocks the other. Tier-0 backfill rows SHALL be created at a priority that sorts after live discovery (which enqueues at priority 0), so newly discovered media is drained before old re-tag work.

#### Scenario: Streams are kept distinct by task type

- **WHEN** the sweep enqueues both Tier-0 backfill and Tier-1 selection rows
- **THEN** the Tier-0 rows have `task_type = "tier0_mlkit"` and the Tier-1 rows have `task_type = "tier1_gemma"`
- **AND** `ProcessingQueueRepository.getNextPendingByTaskType("tier0_mlkit")` returns only Tier-0 rows

#### Scenario: Backfill yields to fresh discovery

- **WHEN** a Tier-0 backfill row and a live-discovery row (priority 0) are both pending in the `tier0_mlkit` stream
- **THEN** the live-discovery row is selected first because the backfill row's priority is lower

### Requirement: Reprocessing overwrites in place and never resets the library up front

Reprocessing SHALL NOT null `processed_at` or delete enrichment ahead of draining. Each stale file SHALL be re-driven by enqueuing a queue row and letting the normal drain overwrite the `media_files` row in place on success via `MediaFileRepository.updateWithProcessingResult`, which advances `ai_model_version`/`ai_schema_version` atomically with `is_processed`. The invariant `is_processed === (processed_at !== null)` SHALL continue to hold at every point during and after a sweep.

#### Scenario: The library is never transiently marked unprocessed

- **WHEN** a reprocess sweep is in progress
- **THEN** no `media_files` row has had its `processed_at` cleared by the planner
- **AND** `MediaFileRepository.getUnprocessed()` does not begin returning previously-processed files because of the sweep

#### Scenario: A re-driven file advances its version in place

- **WHEN** a stale file is re-driven and its analysis succeeds
- **THEN** the same `media_files` row is updated with the new result and the target `ai_model_version`
- **AND** no duplicate `media_files` row is created

### Requirement: Reprocessing is idempotent and reuses the version-aware skip

Reprocessing SHALL be safe to run repeatedly. Before enqueuing a file the planner SHALL skip files that already have a `pending` or `processing` `processing_queue` row for the same `task_type`, so re-tapping the trigger does not stack duplicate active rows. A re-driven item that is already current SHALL be a no-op at drain time via the existing version-aware skip guard in `OrchestratorService.processNext` (which compares `processed_at`, `ai_model_version`, and the row's `model_version`).

#### Scenario: Re-running the sweep does not stack duplicate rows

- **WHEN** the sweep runs a second time while a file already has a pending `tier0_mlkit` row
- **THEN** no additional `tier0_mlkit` row is created for that file

#### Scenario: An already-current enqueued item is skipped at drain

- **WHEN** a re-driven queue row is drained but the file's `ai_model_version` already equals the row's target `model_version` and `processed_at` is set
- **THEN** the orchestrator marks the row completed without re-running the engine

### Requirement: The reprocess sweep is resumable and safe to stop

The enqueue sweep SHALL checkpoint its progress in MMKV under a dedicated `REPROCESS_CHECKPOINT` key (a cursor plus counts) and SHALL page `media_files` deterministically so a sweep interrupted by an app kill resumes from its cursor rather than restarting. Stopping mid-sweep SHALL leave the already-enqueued rows drainable by the normal pipeline and SHALL NOT corrupt any `media_files` or `processing_queue` state. Draining resumability SHALL rely unchanged on the existing durable queue, `resetStaleProcessing`, and the `BackgroundTaskService` checkpoint.

#### Scenario: A killed sweep resumes from its cursor

- **WHEN** the app is killed mid-sweep and relaunched
- **THEN** on initialize the planner resumes the sweep from the stored cursor
- **AND** files before the cursor are not re-scanned from the start

#### Scenario: Stopping mid-sweep leaves a drainable queue

- **WHEN** a sweep is stopped after enqueuing some but not all stale files
- **THEN** the already-enqueued rows remain pending and are drained normally
- **AND** no `media_files` row is left in an inconsistent processed/unprocessed state

### Requirement: A rollback-if-worse gate preserves prior enrichment

Reprocessing SHALL NOT overwrite a file's existing enrichment with a failed or empty result. When a re-driven pass for a file that already has enrichment returns `success === false`, or returns empty output (no caption, no description, and no new labels), the planner-driven flow SHALL keep the file's last-good enrichment rather than replacing it, and SHALL let the normal retry budget handle the failure. Provenance isolation (`labels.source`) SHALL keep Tier-0 and Tier-1 labels independent so a bad pass in one tier cannot destroy the other tier's labels. The precise acceptance predicate beyond failed/empty is POC-dependent on the #4 Gemma gate and SHALL be a tunable constant.

#### Scenario: A failed re-pass does not destroy good data

- **WHEN** a file with an existing caption is re-driven and the pass returns `success === false`
- **THEN** the existing caption, description, and labels are left unchanged
- **AND** the queue row is handled by the normal retry budget

#### Scenario: An empty re-pass is not persisted over prior enrichment

- **WHEN** a re-driven pass returns success but produces no caption, no description, and no labels for a file that already had enrichment
- **THEN** the prior enrichment is preserved rather than overwritten with empty output

### Requirement: An embedding stream can be scheduled without wiring an engine

The planner SHALL be able to schedule re-embedding as its own `embedding` `task_type` stream, kept distinct from Tier-0 and Tier-1, for files whose `embeddings.model_version` is stale or missing relative to the active embedding model. This change SHALL only schedule such work when an embedding engine is available and SHALL NOT itself run embeddings; when no embedding engine is registered, no `embedding` rows SHALL be enqueued.

#### Scenario: No embedding engine means no embedding rows

- **WHEN** the sweep runs and no embedding engine is registered
- **THEN** no `processing_queue` row with `task_type = "embedding"` is created

#### Scenario: Stale vectors are scheduled distinctly when an engine exists

- **WHEN** an embedding engine is registered and a file's `embeddings.model_version` differs from the active embedding model
- **THEN** an `embedding` `task_type` row MAY be enqueued for that file, separate from any `tier0_mlkit` or `tier1_gemma` row

