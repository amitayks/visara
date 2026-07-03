# reprocessing-user-action Specification

## Purpose
TBD - created by archiving change library-reprocessing-backfill. Update Purpose after archive.
## Requirements
### Requirement: Settings exposes a "Re-run analysis" action

The Settings surface SHALL provide a user-invokable "Re-run analysis" action, placed in the SettingsDrawer *Processing* section, that triggers `LibraryReprocessingService.requestReprocess()`. Because reprocessing is a heavy operation, the action SHALL require an explicit confirmation before starting, consistent with the existing confirm-then-act data actions.

#### Scenario: The action is present and triggers a reprocess

- **WHEN** the user opens Settings and taps "Re-run analysis" and confirms
- **THEN** `LibraryReprocessingService.requestReprocess()` is invoked
- **AND** the reprocess sweep begins enqueuing stale files

#### Scenario: Cancelling the confirmation starts nothing

- **WHEN** the user taps "Re-run analysis" and cancels the confirmation
- **THEN** no reprocess sweep is started and no queue rows are created

### Requirement: The action is idempotent while processing is active

Invoking "Re-run analysis" while a reprocess sweep or a drain is already running SHALL NOT start a second concurrent sweep and SHALL NOT stack duplicate work. The action SHALL detect the active state (via the orchestrator/background-task running state) and no-op or surface the in-progress status instead.

#### Scenario: Re-tapping during an active run does not double-enqueue

- **WHEN** a reprocess or drain is already running and the user taps "Re-run analysis" again
- **THEN** no second sweep starts and no duplicate `processing_queue` rows are created

### Requirement: Reprocess progress reuses the existing pipeline progress surface

Reprocessing SHALL report progress through the existing orchestrator event path (the `OrchestratorBridge` mapping orchestrator events onto `ProcessingContext`), so the user sees reprocessing in the same progress UI as first-run processing. This change SHALL NOT introduce a separate progress screen or context for reprocessing.

#### Scenario: Reprocessing shows in the existing progress UI

- **WHEN** a reprocess sweep enqueues work and the drain runs
- **THEN** the existing processing progress surface reflects the reprocessing progress
- **AND** no new reprocessing-specific progress screen is added

