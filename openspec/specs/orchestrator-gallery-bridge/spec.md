# orchestrator-gallery-bridge Specification

## Purpose
TBD - created by archiving change processing-orchestrator-wiring. Update Purpose after archive.
## Requirements
### Requirement: Live media changes are folded in incrementally

The bootstrap SHALL ensure live library observation is active after boot: `LibrarySync` starts `MediaIndexer.observe` and answers each change poke with a `changesSince` delta round (upserts, updates, purges), so media added, modified, or deleted while the app runs is reflected without a full rescan. Observation SHALL be started by `startAppServices()` (via `LibrarySync.start()`) and stopped by `stopAppServices()`.

#### Scenario: A newly added photo is folded in live

- **WHEN** the platform observer reports a library change containing a newly added photo
- **THEN** the delta round upserts it with `enrich_status='pending'`
- **AND** it appears in the gallery feed and becomes eligible for the running drain

### Requirement: Battery and night settings propagate to the drain

The bootstrap SHALL propagate battery-saver and night-processing changes from the settings store (`settingsStore`) to the Pipeline's gate configuration (`Pipeline.updateSettings`), so the gating authority stays in sync with user preferences.

#### Scenario: Enabling battery saver updates gating

- **WHEN** the user toggles battery-saver in settings
- **THEN** the bootstrap calls `Pipeline.updateSettings({ batterySaverEnabled: true })`
- **AND** the drain honors the new gating at its next between-item check

### Requirement: A headless bootstrap module adapts the orchestrator to app state

The system SHALL provide a headless bootstrap module — plain TypeScript exposing `startAppServices()` and `stopAppServices()`, not a React component — as the single sanctioned seam between the backend and UI state, and the backend SHALL NOT import React. The app shell SHALL invoke `startAppServices()` exactly once, and pipeline boot SHALL be gated on onboarding completion with this exact sequence: `GemmaModelDeliveryService.initialize()` fired without awaiting; `await MediaIndexer` access request; on grant or limited, `await LibrarySync.start()` (discovery through reconciliation and the discovery-complete gate) then `Pipeline.start()`. `stopAppServices()` SHALL remove the bootstrap's event subscriptions, stop observation, and stop the pipeline.

#### Scenario: The bootstrap boots the pipeline and cleans up

- **WHEN** `startAppServices()` runs after onboarding completion with permissions granted
- **THEN** it fires model-delivery initialization without blocking, awaits the access request, awaits `LibrarySync.start()`, then starts the pipeline and subscribes to its events
- **AND** a subsequent `stopAppServices()` unsubscribes, stops observation, and stops the pipeline

#### Scenario: Boot waits for onboarding completion

- **WHEN** the app runs with onboarding not completed
- **THEN** the bootstrap requests no permissions and starts neither discovery nor the pipeline until onboarding completes

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

The bootstrap SHALL NOT subscribe to the gallery feed and SHALL NOT mirror media entity arrays into any global store. The gallery SHALL consume the backend feed (`useVisibleMedia`) through a throttled screen-level subscription — specified in `ui-state-management` and `gallery-experience` — so the gallery still reflects database truth as media is discovered and processed, without a global re-render per database write.

#### Scenario: Processed media reaches the gallery without a global mirror

- **WHEN** discovery or processing changes the visible media set
- **THEN** the gallery updates through its own throttled feed subscription
- **AND** no global store holds the media array and the bootstrap performs no gallery-population work

### Requirement: Permission denial is surfaced and recoverable

WHEN the boot-time access request is denied, the bootstrap SHALL record a UI-consumable permission-denied state instead of silently aborting, and SHALL provide a retry operation that re-runs the access request and, on grant, continues the remaining boot sequence (`LibrarySync.start()` then `Pipeline.start()`) in the same app session without an app restart. Presentation of the denied state is owned by the consuming screens (see `onboarding-experience`).

#### Scenario: Denial becomes visible state

- **WHEN** the access request resolves as denied during boot
- **THEN** the bootstrap sets a permission-denied state readable by the UI
- **AND** neither discovery nor the pipeline is started

#### Scenario: Retry boots the pipeline without restart

- **WHEN** the user retries from the denied state and grants permission
- **THEN** the bootstrap runs `LibrarySync.start()` then `Pipeline.start()` in the same session
- **AND** discovery and processing begin without relaunching the app
