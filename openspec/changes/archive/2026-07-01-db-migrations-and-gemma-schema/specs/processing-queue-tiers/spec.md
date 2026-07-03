## ADDED Requirements

### Requirement: Processing queue distinguishes task tiers
The `processing_queue` table SHALL provide a `task_type` string column (e.g., `tier0_mlkit`, `tier1_gemma`, `embedding`) and an optional `model_version` string column. The `ProcessingQueue` model SHALL expose `taskType` and `modelVersion?`.

#### Scenario: Enqueue a Tier-0 task
- **WHEN** a Tier-0 ML Kit job is enqueued
- **THEN** the queue row has `task_type = "tier0_mlkit"`

#### Scenario: Enqueue a Tier-1 task with a target model
- **WHEN** a Tier-1 Gemma job is enqueued
- **THEN** the queue row has `task_type = "tier1_gemma"` and a non-null `model_version`

### Requirement: Distinct tiers can be scheduled independently
The scheduler SHALL be able to select pending work by `task_type` so Tier-0 and Tier-1 passes are drained as separate streams, without a Tier-1 backlog blocking Tier-0 or vice versa. Existing ordering by priority then `created_at` SHALL be preserved within a tier.

#### Scenario: Fetch next pending Tier-1 task
- **WHEN** the queue contains pending `tier0_mlkit` and `tier1_gemma` rows
- **THEN** querying pending rows filtered by `task_type = "tier1_gemma"` returns only Tier-1 rows
- **AND** they are still ordered by `priority` descending then `created_at` ascending

### Requirement: Existing queue rows backfill to Tier-0
Because v1 enqueued only ML Kit work, the v1→v2 migration SHALL backfill existing `processing_queue` rows so their `task_type` is `tier0_mlkit`.

#### Scenario: Migrated queue rows default to tier0_mlkit
- **WHEN** the v1→v2 migration runs on a device with existing `processing_queue` rows
- **THEN** every pre-existing queue row has `task_type = "tier0_mlkit"` afterward
- **AND** `model_version` remains null for those rows
