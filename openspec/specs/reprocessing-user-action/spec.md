# reprocessing-user-action Specification

## Purpose
TBD - created by archiving change library-reprocessing-backfill. Update Purpose after archive.
## Requirements
### Requirement: Settings exposes a "Re-run analysis" action

The Settings surface SHALL provide a user-invokable "Re-run analysis" action, placed in the Settings *Processing* section, that triggers `Pipeline.reprocess()`. Because reprocessing is a heavy operation, the action SHALL require an explicit confirmation before starting, consistent with the existing confirm-then-act data actions.

#### Scenario: The action is present and triggers a reprocess

- **WHEN** the user opens Settings and taps "Re-run analysis" and confirms
- **THEN** `Pipeline.reprocess()` is invoked
- **AND** rows with stale model versions or failed status flip to `pending` and the drain begins/continues

#### Scenario: Cancelling the confirmation starts nothing

- **WHEN** the user taps "Re-run analysis" and cancels the confirmation
- **THEN** no reprocess sweep runs and no row statuses change

### Requirement: The action is idempotent while processing is active

Invoking "Re-run analysis" while a sweep or drain is already running SHALL NOT start a second concurrent sweep and SHALL NOT stack duplicate work: the sweep is a single status UPDATE, and a running drain simply observes more pending rows. Re-invocation during activity SHALL be a no-op or surface the in-progress status.

#### Scenario: Re-tapping during an active run does not double-enqueue

- **WHEN** a reprocess or drain is already running and the user taps "Re-run analysis" again
- **THEN** no duplicate work items are created (row statuses are already `pending` or in flight)

### Requirement: Reprocess progress reuses the existing pipeline progress surface

Reprocessing SHALL report progress through the existing pipeline event path (the bootstrap's single `Pipeline.subscribe` feeding `processingStore`), so the user sees reprocessing in the same progress UI as first-run processing. This change SHALL NOT introduce a separate progress screen or store for reprocessing.

#### Scenario: Reprocessing shows in the existing progress UI

- **WHEN** a reprocess sweep flips rows and the drain runs
- **THEN** the existing processing progress surface reflects the reprocessing progress
- **AND** no new reprocessing-specific progress screen is added
