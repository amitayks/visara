# orchestrator-gallery-bridge Specification

## Purpose
TBD - created by archiving change processing-orchestrator-wiring. Update Purpose after archive.
## Requirements
### Requirement: A React bridge adapts the orchestrator to app state

The system SHALL provide a single mounted React boundary (an `OrchestratorBridge`) that subscribes to `OrchestratorService` events and adapts them to app contexts, without the orchestrator importing React. The bridge SHALL be mounted once inside the provider stack and SHALL start the pipeline (after onboarding, with permissions) and tear down its subscriptions on unmount.

#### Scenario: The bridge starts the pipeline and cleans up

- **WHEN** the bridge mounts post-onboarding with permissions granted
- **THEN** it calls `OrchestratorService.initialize()` and `runInitialProcessing()` and subscribes to orchestrator events
- **AND** on unmount it unsubscribes and stops the live observer

### Requirement: Progress is reported via ProcessingContext

The bridge SHALL translate orchestrator events into `ProcessingContext` dispatches: start → `START_PROCESSING`; progress/scan-progress → `UPDATE_PROGRESS` (current, total, current file name); item failure → `ADD_FAILED_FILE`; pause/resume → `SET_PAUSED`; completion → `STOP_PROCESSING`.

#### Scenario: Progress updates reach the processing context

- **WHEN** the orchestrator emits a progress event
- **THEN** the bridge dispatches `UPDATE_PROGRESS` with the current count, total, and current file name

#### Scenario: A permanent failure is recorded

- **WHEN** the orchestrator emits an item-failed event
- **THEN** the bridge dispatches `ADD_FAILED_FILE` with the media id, file name, error message, and timestamp

### Requirement: The gallery is populated via SET_MEDIA_FILES

The bridge SHALL drive `GalleryContext` `SET_MEDIA_FILES` from `MediaFileRepository.observeVisible()`, dispatching the emitted visible `MediaFile[]` so the gallery reflects database truth as media is discovered and processed. `SET_MEDIA_FILES` (previously never dispatched) SHALL be dispatched by this bridge.

#### Scenario: Discovered and processed media appear in the gallery

- **WHEN** `observeVisible()` emits an updated list (after discovery or processing)
- **THEN** the bridge dispatches `SET_MEDIA_FILES` with that list
- **AND** the gallery displays the current visible media

### Requirement: Live media changes are folded in incrementally

The bridge SHALL start the native `MediaObserver` via `MediaDiscoveryService.startObserver` and forward each change batch to `OrchestratorService.enqueueDiscovered`, so media added or modified while the app runs is upserted and enqueued without a full rescan.

#### Scenario: A newly added photo is enqueued live

- **WHEN** the `ContentObserver` reports a newly added photo
- **THEN** the bridge forwards the change to `enqueueDiscovered`
- **AND** the file is upserted and a `tier0_mlkit` queue item is enqueued for it

### Requirement: Battery and night settings propagate to the drain

The bridge SHALL propagate `SettingsContext` battery-saver and night-processing changes to `BackgroundTaskService.updateSettings`, so the gating authority stays in sync with user preferences.

#### Scenario: Enabling battery saver updates gating

- **WHEN** the user toggles battery-saver in settings
- **THEN** the bridge calls `BackgroundTaskService.updateSettings({ batterySaverEnabled: true })`
- **AND** the drain honors the new gating on its next pause check

