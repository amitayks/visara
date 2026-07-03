## MODIFIED Requirements

### Requirement: Selection is tier-aware and forward-compatible

The orchestrator SHALL select work by `task_type`, draining `tier0_mlkit` (analysis) and `embedding` (vector generation) as independent streams, and SHALL resolve the producer for a stream via the appropriate seam — the `EngineRegistry` / `ProcessingService` seam for analysis tiers, and `EmbeddingService` for the `embedding` stream. Each stream SHALL be selected with `ProcessingQueueRepository.getNextPendingByTaskType`, preserving `priority` descending then `created_at` ascending within a stream, so no stream blocks another (an `embedding` backlog never blocks Tier-0, and vice versa). The `embedding` stream SHALL be drained at no higher priority than analysis, so a fresh library becomes browsable and lexically searchable before it is fully embedded. Adding a Tier-1 (`tier1_gemma`) analysis stream later SHALL still require only registering an engine and enqueuing that `task_type`, without restructuring the orchestrator.

#### Scenario: Tier-0 analysis is drained with the Tier-0 engine

- **WHEN** the orchestrator drains pending analysis work
- **THEN** it selects pending items with `task_type = "tier0_mlkit"` and analyzes them with the Tier-0 engine

#### Scenario: Embedding is drained as an independent second stream

- **WHEN** the queue holds pending `tier0_mlkit` and `embedding` rows and the orchestrator drains work
- **THEN** each stream is selected via its own `task_type` query and produced by its own seam (`ProcessingService` for `tier0_mlkit`, `EmbeddingService` for `embedding`)
- **AND** a backlog in one stream does not block draining of the other

#### Scenario: A future analysis tier layers on without a rewrite

- **WHEN** a later change registers a Tier-1 engine and enqueues `tier1_gemma` items
- **THEN** the orchestrator can drain that tier as a separate stream using the same selection seam
- **AND** the Tier-1 backlog does not block Tier-0 draining
