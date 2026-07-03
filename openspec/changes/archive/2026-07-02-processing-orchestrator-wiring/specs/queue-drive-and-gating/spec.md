## ADDED Requirements

### Requirement: The persistent queue is the single source of truth

The orchestrator SHALL drive the repo-backed `ProcessingQueueRepository` (persisted in SQLite) as the single source of truth for pending work. `ProcessingService`'s in-memory queue (`addToQueue`/`processQueue`/`clearQueue` and related state) SHALL be deprecated and SHALL NOT be used by the orchestrator; `ProcessingService` SHALL be used only as the stateless engine seam (`processMedia`/`getEngine`/`setEngine`).

#### Scenario: Work is enqueued into the persistent repository

- **WHEN** the orchestrator enqueues a file for processing
- **THEN** a `processing_queue` row is created via `ProcessingQueueRepository`
- **AND** `ProcessingService.addToQueue` / `processQueue` are not called

#### Scenario: Pending work survives an app restart

- **WHEN** items are pending and the app is killed and relaunched
- **THEN** the pending `processing_queue` rows are still present and drainable
- **AND** no work is lost to a volatile in-memory queue

### Requirement: Enqueue records task type and model version

Enqueuing SHALL set `task_type` on every new `processing_queue` row (`tier0_mlkit` for the Tier-0 pass) and MAY set `model_version`. `ProcessingQueueRepository.create` SHALL accept and persist these fields so no new row is left with an empty `task_type`.

#### Scenario: A Tier-0 enqueue is tagged

- **WHEN** the orchestrator enqueues a Tier-0 item
- **THEN** the created row has `task_type = "tier0_mlkit"`

#### Scenario: New rows never have an empty task type

- **WHEN** any row is created through `ProcessingQueueRepository.create`
- **THEN** its `task_type` is a non-empty value

### Requirement: Selection can filter by task type

`ProcessingQueueRepository` SHALL provide a query that returns the next pending row for a given `task_type`, preserving ordering by `priority` descending then `created_at` ascending, so tiers are drained as independent streams.

#### Scenario: Next pending is scoped to a tier

- **WHEN** the queue holds pending `tier0_mlkit` and `tier1_gemma` rows and the next pending `tier0_mlkit` is requested
- **THEN** a `tier0_mlkit` row is returned
- **AND** it is the highest-priority, oldest such row

### Requirement: The drain runs under BackgroundTaskService gating and checkpointing

The bulk drain SHALL run through `BackgroundTaskService.start`, reusing its pause/resume, battery-saver and night-window gating, and MMKV checkpoint. Each background tick SHALL process at most one queue item so gating is evaluated between items, and the drain SHALL stop the background service when the selected tier is drained.

#### Scenario: Gating pauses the drain

- **WHEN** battery-saver is enabled and the device is not charging (or night-processing is on and it is daytime)
- **THEN** `BackgroundTaskService` pauses between items and the drain does not process further work until allowed

#### Scenario: Draining an empty tier stops the service

- **WHEN** a tick finds no remaining pending item for the tier
- **THEN** the orchestrator stops the background service instead of spinning the loop

#### Scenario: Progress is checkpointed for resume

- **WHEN** items are processed
- **THEN** `BackgroundTaskService` records the last processed id and counts to its MMKV checkpoint
- **AND** the checkpoint is restored on the next launch

### Requirement: Interrupted processing rows are recovered

On startup the system SHALL return any `processing_queue` row stuck in the `processing` state (from a run interrupted mid-item) back to `pending`, so no item is stranded.

#### Scenario: A stranded processing row is requeued

- **WHEN** `initialize` runs and a row is in the `processing` state with no active drain
- **THEN** that row is reset to `pending` and becomes eligible for draining again

### Requirement: Failures retry within a bounded budget

A failed analysis SHALL mark the queue row failed and increment its `retry_count`; while `retry_count` is under the retry budget the row SHALL be returned to `pending` for another attempt, and once the budget is exhausted the file SHALL be surfaced as permanently failed rather than retried indefinitely.

#### Scenario: A transient failure is retried

- **WHEN** analysis fails and the row's `retry_count` is below the budget
- **THEN** the row is set back to `pending` for a later attempt

#### Scenario: An exhausted file is surfaced as failed

- **WHEN** analysis fails and the row's `retry_count` has reached the budget
- **THEN** the row remains failed and a failure is emitted for the file
