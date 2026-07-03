## ADDED Requirements

### Requirement: OrchestratorService connects the pipeline end to end

The system SHALL provide an all-static `OrchestratorService` that runs the processing pipeline as one sequence: discover media (`MediaDiscoveryService`) → upsert `media_files` rows → enqueue work via `ProcessingQueueRepository` → analyze each item via `ProcessingService.processMedia` → persist via `MediaFileRepository.updateWithProcessingResult` → update `SearchService` incrementally → report progress → populate the gallery. `OrchestratorService` MUST be the single entry point that drives this sequence; no other component SHALL reimplement the ordering.

#### Scenario: A discovered file flows through the full pipeline

- **WHEN** `OrchestratorService` discovers a new media file and the drain runs
- **THEN** a `media_files` row exists for it, a `processing_queue` row was created and completed for it, its `ProcessingResult` was persisted via `MediaFileRepository`, and it was added to the search index

#### Scenario: The orchestrator uses the engine seam, not a hard-wired producer

- **WHEN** the orchestrator analyzes an item
- **THEN** it calls `ProcessingService.processMedia(uri)` (which delegates to the configured `AnalysisEngine`)
- **AND** it does not import or call `ImageLabelingService` / `TextRecognitionService` directly

### Requirement: Processing is triggered post-onboarding with a foreground scan and background continuation

Processing SHALL kick off when the app enters the post-onboarding (Main) tree with media permissions granted. `OrchestratorService.runInitialProcessing` SHALL perform a foreground discovery scan (enqueuing work as batches arrive) and SHALL hand the bulk drain to `BackgroundTaskService` so processing continues while the app is backgrounded. Processing SHALL NOT start while onboarding is incomplete.

#### Scenario: First launch after onboarding starts processing

- **WHEN** onboarding is completed and the Main tree mounts with permissions granted
- **THEN** `OrchestratorService.initialize()` and `runInitialProcessing()` run
- **AND** a foreground discovery scan enqueues discovered media and the background drain begins

#### Scenario: Onboarding incomplete does not start processing

- **WHEN** onboarding has not been completed
- **THEN** `OrchestratorService.runInitialProcessing()` is not invoked and no discovery scan or drain starts

### Requirement: Discovery upserts are idempotent

Discovery SHALL NOT create duplicate `media_files` rows for the same media. Before creating a row, the orchestrator SHALL look up the file by `uri`; an existing file SHALL be updated in place, and a queue item SHALL be enqueued only when the file is not already processed.

#### Scenario: Rescanning an existing file creates no duplicate

- **WHEN** discovery encounters a `uri` that already has a `media_files` row
- **THEN** no second `media_files` row is created for that `uri`
- **AND** no duplicate `processing_queue` row is enqueued for an already-processed file

### Requirement: The pipeline is resumable and does not double-process

The orchestrator SHALL be safe to stop and resume. On `initialize`, any queue row left in `processing` from an interrupted run SHALL be returned to `pending`. Before analyzing an item, the orchestrator SHALL skip work that is already complete for the current engine version (using `processed_at` and `ai_model_version`) so a resumed or re-enqueued run does not redo it.

#### Scenario: Interrupted run resumes without losing work

- **WHEN** the app is killed mid-processing and relaunched
- **THEN** `initialize` resets rows stuck in `processing` back to `pending`
- **AND** the drain continues from the remaining `pending` rows

#### Scenario: Already-processed file is skipped on re-drive

- **WHEN** an item is drained whose `media_files` row has `processed_at` set and `ai_model_version` equal to the current engine's version
- **THEN** the orchestrator skips analysis and marks the queue item completed without re-running the engine

### Requirement: OrchestratorService exposes a framework-agnostic event API

`OrchestratorService` SHALL expose `subscribe(listener)` returning an unsubscribe function, and SHALL emit typed lifecycle events (started, scan progress, item processed, item failed, progress, paused, resumed, completed). The service MUST NOT import React or any UI context; consumers subscribe to observe.

#### Scenario: A subscriber receives progress events

- **WHEN** a consumer calls `OrchestratorService.subscribe(listener)` and processing runs
- **THEN** the listener receives progress and item-level events as they occur
- **AND** calling the returned unsubscribe function stops further delivery

### Requirement: Selection is tier-aware and forward-compatible

The orchestrator SHALL select work by `task_type`, draining `tier0_mlkit` today, and SHALL resolve the engine for a tier via the existing `EngineRegistry` / `ProcessingService` seam. Adding a Tier-1 (`tier1_gemma`) stream later SHALL require registering an engine and enqueuing that `task_type`, without restructuring the orchestrator.

#### Scenario: Tier-0 is the only stream drained today

- **WHEN** the orchestrator drains the queue
- **THEN** it selects pending items with `task_type = "tier0_mlkit"` and analyzes them with the Tier-0 engine

#### Scenario: A future tier layers on without a rewrite

- **WHEN** a later change registers a Tier-1 engine and enqueues `tier1_gemma` items
- **THEN** the orchestrator can drain that tier as a separate stream using the same selection seam
- **AND** the Tier-1 backlog does not block Tier-0 draining
