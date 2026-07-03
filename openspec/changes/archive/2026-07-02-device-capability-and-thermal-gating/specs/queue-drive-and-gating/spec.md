## MODIFIED Requirements

### Requirement: The drain runs under BackgroundTaskService gating and checkpointing

The bulk drain SHALL run through `BackgroundTaskService.start`, reusing its pause/resume, battery-saver, night-window, and **thermal-pressure** gating, and MMKV checkpoint. `BackgroundTaskService.shouldPauseProcessing` SHALL pause the drain when the device is thermally throttled at or above the drain threshold, as reported by `ThermalService` (a third gating axis beside battery-saver and the night window), protecting any heavy pass including Tier-0. The thermal axis SHALL be always-on (not behind a user setting), SHALL read the cached thermal level so it adds no per-tick native round-trip, and SHALL fail open (treat an unavailable/erroring thermal source as `nominal`, i.e. do not pause) so a broken thermal source never wedges the pipeline. Each background tick SHALL process at most one queue item so gating is evaluated between items, and the drain SHALL stop the background service when the selected tier is drained.

#### Scenario: Gating pauses the drain

- **WHEN** battery-saver is enabled and the device is not charging (or night-processing is on and it is daytime)
- **THEN** `BackgroundTaskService` pauses between items and the drain does not process further work until allowed

#### Scenario: Thermal pressure pauses the drain

- **WHEN** the device reports a thermal level at or above the drain threshold while the drain is running
- **THEN** `shouldPauseProcessing` returns true, the drain pauses between items, and it resumes once the device cools below the threshold

#### Scenario: A missing thermal source does not pause the drain

- **WHEN** the thermal source is unavailable or a read errors
- **THEN** the thermal axis is treated as `nominal`, `shouldPauseProcessing` does not pause on thermal grounds, and battery-saver/night gating are unaffected

#### Scenario: Draining an empty tier stops the service

- **WHEN** a tick finds no remaining pending item for the tier
- **THEN** the orchestrator stops the background service instead of spinning the loop

#### Scenario: Progress is checkpointed for resume

- **WHEN** items are processed
- **THEN** `BackgroundTaskService` records the last processed id and counts to its MMKV checkpoint
- **AND** the checkpoint is restored on the next launch
