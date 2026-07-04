## ADDED Requirements

### Requirement: A headless bootstrap module adapts the orchestrator to app state

The system SHALL provide a headless bootstrap module — plain TypeScript exposing `startAppServices()` and `stopAppServices()`, not a React component — as the single sanctioned seam between the services layer and UI state, and the orchestrator SHALL NOT import React. The app shell SHALL invoke `startAppServices()` exactly once, and pipeline boot SHALL be gated on onboarding completion with this exact sequence: `GemmaModelDeliveryService.initialize()` fired without awaiting; `await MediaDiscoveryService.requestPermissions()`; on grant, `await OrchestratorService.initialize()` then `await OrchestratorService.runInitialProcessing()`. `stopAppServices()` SHALL remove the bootstrap's event subscriptions and stop the live media observer.

#### Scenario: The bootstrap boots the pipeline and cleans up

- **WHEN** `startAppServices()` runs after onboarding completion with permissions granted
- **THEN** it fires model-delivery initialization without blocking, awaits the permission request, then awaits `OrchestratorService.initialize()` followed by `runInitialProcessing()`, and subscribes to orchestrator events
- **AND** a subsequent `stopAppServices()` unsubscribes and stops the live observer

#### Scenario: Boot waits for onboarding completion

- **WHEN** the app runs with onboarding not completed
- **THEN** the bootstrap requests no permissions and does not initialize the orchestrator until onboarding completes

### Requirement: Orchestrator events map to the processing store

The bootstrap SHALL translate orchestrator events into `processingStore` updates preserving the prior payload semantics: `started` → processing active; `scan-progress` and `progress` → processed count, total, and current file name; `item-failed` → a failed-file record (media id, file name, error message, timestamp); `paused`/`resumed` → paused state with pause reason; `completed` → processing inactive. The processing store SHALL be the sole React-facing sink for these events; zero-re-render consumption of high-frequency progress (the SharedValue mirror) is specified in `ui-state-management`.

#### Scenario: Progress updates reach the processing store

- **WHEN** the orchestrator emits a `progress` or `scan-progress` event
- **THEN** the processing store reflects the current processed count, total, and current file name

#### Scenario: A permanent failure is counted

- **WHEN** the orchestrator emits an `item-failed` event
- **THEN** the processing store increments its failed-item count (surfaced as "N failed" in the UI), consistent with the processing-snapshot shape defined in `ui-state-management`

#### Scenario: Pause, resume, and completion are reflected

- **WHEN** the orchestrator emits `paused`, `resumed`, or `completed`
- **THEN** the processing store's paused and processing-active state update accordingly

### Requirement: The bootstrap does not own gallery data

The bootstrap SHALL NOT subscribe to `MediaFileRepository.observeVisible()` and SHALL NOT mirror media entity arrays into any global store. The gallery SHALL consume `observeVisible()` through a throttled screen-level subscription — specified in `ui-state-management` and `gallery-experience` — so the gallery still reflects database truth as media is discovered and processed, without a global re-render per database write.

#### Scenario: Processed media reaches the gallery without a global mirror

- **WHEN** discovery or processing changes the visible media set
- **THEN** the gallery updates through its own throttled `observeVisible()` subscription
- **AND** no global store holds the media array and the bootstrap performs no gallery-population work

### Requirement: Permission denial is surfaced and recoverable

WHEN the boot-time permission request is denied, the bootstrap SHALL record a UI-consumable permission-denied state instead of silently aborting, and SHALL provide a retry operation that re-runs `MediaDiscoveryService.requestPermissions()` and, on grant, continues the remaining boot sequence (`OrchestratorService.initialize()` then `runInitialProcessing()`) in the same app session without an app restart. Presentation of the denied state is owned by the consuming screens (see `onboarding-experience`).

#### Scenario: Denial becomes visible state

- **WHEN** `requestPermissions()` resolves as denied during boot
- **THEN** the bootstrap sets a permission-denied state readable by the UI
- **AND** the orchestrator is not initialized

#### Scenario: Retry boots the pipeline without restart

- **WHEN** the user retries from the denied state and grants permission
- **THEN** the bootstrap runs `OrchestratorService.initialize()` and `runInitialProcessing()` in the same session
- **AND** initial processing begins without relaunching the app

## MODIFIED Requirements

### Requirement: Live media changes are folded in incrementally

The bootstrap SHALL start the native `MediaObserver` via `MediaDiscoveryService.startObserver` and forward each change batch to `OrchestratorService.enqueueDiscovered`, so media added or modified while the app runs is upserted and enqueued without a full rescan. The observer SHALL be started by `startAppServices()` and stopped by `stopAppServices()`.

#### Scenario: A newly added photo is enqueued live

- **WHEN** the `ContentObserver` reports a newly added photo
- **THEN** the bootstrap forwards the change to `enqueueDiscovered`
- **AND** the file is upserted and a `tier0_mlkit` queue item is enqueued for it

### Requirement: Battery and night settings propagate to the drain

The bootstrap SHALL propagate battery-saver and night-processing changes from the settings store (`settingsStore`) to `BackgroundTaskService.updateSettings`, so the gating authority stays in sync with user preferences.

#### Scenario: Enabling battery saver updates gating

- **WHEN** the user toggles battery-saver in settings
- **THEN** the bootstrap calls `BackgroundTaskService.updateSettings({ batterySaverEnabled: true })`
- **AND** the drain honors the new gating on its next pause check

## REMOVED Requirements

### Requirement: A React bridge adapts the orchestrator to app state

**Reason**: The provider stack and the null-rendering `OrchestratorBridge` component are deleted in the UI rebuild; services wiring is now a headless plain-TypeScript module invoked from the app shell.
**Migration**: Replaced by the ADDED requirement "A headless bootstrap module adapts the orchestrator to app state" — same single sanctioned seam, boot gating, boot order, and teardown semantics, with no React component.

### Requirement: Progress is reported via ProcessingContext

**Reason**: `ProcessingContext` is deleted with the context layer; processing state now lives in the Zustand `processingStore`.
**Migration**: Replaced by the ADDED requirement "Orchestrator events map to the processing store" — identical event set and payload semantics.

### Requirement: The gallery is populated via SET_MEDIA_FILES

**Reason**: `GalleryContext` and its `SET_MEDIA_FILES` dispatch are deleted; mirroring the full visible-media array into global state forced app-wide re-renders on every database write during processing drains.
**Migration**: The gallery consumes `MediaFileRepository.observeVisible()` via a throttled screen-level subscription (see `ui-state-management` and `gallery-experience`); the ADDED requirement "The bootstrap does not own gallery data" forbids reintroducing a global mirror.
