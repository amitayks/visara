## ADDED Requirements

### Requirement: Tier-1 reprocessing is selective, not the whole library

Tier-1 (`tier1_gemma`) reprocessing SHALL enqueue only a bounded, prioritized selection of the library and SHALL NOT enqueue every media file. The selection breadth SHALL be defined by policy constants (favorites, a recency window, and an optional recently-opened set) so that the heavy Gemma pass is reserved for high-value media. The non-selected tail SHALL NOT be enqueued for Tier-1 by default.

#### Scenario: Only the selected subset is enqueued for Tier-1

- **WHEN** the reprocess sweep builds the Tier-1 selection on a large library
- **THEN** `tier1_gemma` rows are created only for files in the prioritized selection
- **AND** files outside the selection have no `tier1_gemma` row

#### Scenario: The library tail is excluded from Tier-1 by default

- **WHEN** a file is neither a favorite, nor within the recency window, nor recently opened
- **THEN** no `tier1_gemma` row is enqueued for it under the default policy

### Requirement: Tier-1 selection is prioritized by favorites, then recency, then engagement

Within the `tier1_gemma` stream the planner SHALL assign priority (drained priority-descending) using signals that exist in the schema: favorites (`is_favorite = true`) SHALL take the highest band, recent media (`creation_date` within the configured window) the next band, and recently-opened media (an optional engagement signal) a lower band. Because there is no `last_opened_at` column today, the recently-opened band SHALL be optional and MAY be sourced from a lightweight recently-viewed store; the core selection SHALL remain correct using favorites and recency alone. All bands and the recency window SHALL be named constants and are POC-dependent.

#### Scenario: Favorites are drained before merely-recent media

- **WHEN** a favorite file and a non-favorite file within the recency window both have pending `tier1_gemma` rows
- **THEN** the favorite's row has a higher priority and is selected first

#### Scenario: Selection is correct without an engagement signal

- **WHEN** no recently-viewed store is available
- **THEN** the Tier-1 selection is still built from favorites and the recency window
- **AND** no error is surfaced for the missing engagement signal

### Requirement: Tier-1 admission is a composite gate and never a blanket pass

The system SHALL expose a single predicate (`LibraryReprocessingService.mayRunTier1Now()`) that the Tier-1 drain MUST evaluate before running each `tier1_gemma` item. It SHALL resolve `true` only when ALL hold: `DeviceCapabilityService.canRunTier1()` is `true` (device capability, live disk headroom, and thermal below the Tier-1 threshold), the device is charging, and the current time is within the Tier-1 (night) window. The gate SHALL be layered on top of the shared `BackgroundTaskService.shouldPauseProcessing` drain gate, not replace it. Because `canRunTier1()` fails closed, any unknown or error signal SHALL make the predicate resolve `false`, leaving Tier-0 unaffected.

#### Scenario: A capable, charging, cool, in-window device may run Tier-1

- **WHEN** `canRunTier1()` is true, the device is charging, and it is inside the night window
- **THEN** `mayRunTier1Now()` resolves `true`

#### Scenario: A discharging device may not run Tier-1 even if otherwise eligible

- **WHEN** `canRunTier1()` is true and it is inside the night window but the device is not charging
- **THEN** `mayRunTier1Now()` resolves `false`

#### Scenario: A hot or incapable device may not run Tier-1

- **WHEN** `canRunTier1()` resolves `false` (thermal at/above the Tier-1 threshold, insufficient RAM/disk, or an unknown signal)
- **THEN** `mayRunTier1Now()` resolves `false` regardless of charging or time of day

#### Scenario: Failing the gate idles Tier-1 without touching Tier-0

- **WHEN** `mayRunTier1Now()` resolves `false`
- **THEN** no `tier1_gemma` item is run on that tick
- **AND** the Tier-0 (`tier0_mlkit`) stream continues to drain normally

### Requirement: Tier-1 enqueue is guarded on a registered Tier-1 engine

To avoid stranding un-drainable rows, the planner SHALL enqueue `tier1_gemma` work only when a Tier-1 engine is registered in the `EngineRegistry`. When no Tier-1 engine is registered, the sweep SHALL still perform the Tier-0 backfill and SHALL NOT create any `tier1_gemma` rows.

#### Scenario: No Tier-1 engine means no Tier-1 rows

- **WHEN** the sweep runs and `EngineRegistry` has no Tier-1 engine registered
- **THEN** no `tier1_gemma` row is created
- **AND** the Tier-0 backfill still proceeds

#### Scenario: A registered Tier-1 engine enables the Tier-1 selection

- **WHEN** a Tier-1 engine is registered and the sweep runs
- **THEN** the prioritized `tier1_gemma` selection is enqueued with `model_version` set to the Tier-1 target
