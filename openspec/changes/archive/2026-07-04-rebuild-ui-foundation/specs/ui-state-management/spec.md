## ADDED Requirements

### Requirement: Zustand domain store topology with single-owner state

App-global UI state SHALL live in exactly seven Zustand 5 domain stores — `settingsStore` (persisted), `navStore`, `selectionStore`, `searchStore`, `processingStore`, `modelStore`, and `viewerStore` — and SHALL NOT be held in React context providers. Every app-global datum SHALL have exactly one authoritative store; no store SHALL hold a copy of state owned by another. Components SHALL subscribe through selectors that pick only the slice they render. Store domains:

- `settingsStore` — persisted user preferences: theme, gridZoomLevel, batterySaverEnabled, nightProcessingEnabled, onboardingCompleted.
- `navStore` — currentPage, searchMode, documentMode; the single page/mode authority whose transition semantics are specified in `page-navigation-core`, and the single state input to the centralized Android back-priority chain (behavior per `app-navigation-shell`).
- `selectionStore` — multi-select membership as a set of media ids.
- `searchStore` — query, search status, request identity, and the current result snapshot (search behavior per `search-experience`).
- `processingStore` — the latest pipeline progress snapshot (see the high-frequency progress requirement).
- `modelStore` — the mirror of model-delivery service state (see the model mirror requirement).
- `viewerStore` — transient viewer session: the item list and start index handed over at open (in-memory Model references, never serialized through navigation params) plus the current index; cleared when the viewer closes.

#### Scenario: Search mode has a single flag

- **WHEN** search mode is activated or deactivated through any entry path (edge swipe, bottom-bar interaction, label tap, page-swipe exit)
- **THEN** `navStore.searchMode` is the only mode flag that changes, and every consumer (bottom bar, grid, pager) derives from it
- **AND** no other store holds a search-active flag that can drift from it

#### Scenario: Operational settings have a narrow blast radius

- **WHEN** the user toggles battery saver
- **THEN** only components whose selected slice changed re-render
- **AND** the gallery grid and navigation shell do not re-render

### Requirement: Entity collections are consumed at screen level, never mirrored into stores

Global stores SHALL NOT subscribe to WatermelonDB observables and SHALL NOT hold entity collections mirrored from the database. Screens that render database collections SHALL subscribe to the owning repository observable at screen level with a trailing throttle of approximately 250 ms (trailing edge guaranteed, so the final database state always renders), hold emissions in screen-local state, and render cells memoized on the reference-stable Model instances the database emits. Exactly two bounded snapshots of already-loaded entities are permitted in global stores — `searchStore`'s current result set (written only by a completed, non-stale search response) and `viewerStore`'s open-session item list (written only when the viewer opens) — and these SHALL NOT be updated by database observation and SHALL be cleared when their surface exits.

#### Scenario: A processing drain does not storm the UI

- **WHEN** the pipeline drain writes one processed photo to the database per item across thousands of items
- **THEN** no global store receives a per-write update
- **AND** the gallery re-renders at most approximately once per 250 ms from its throttled subscription, and renders the final emission after the drain ends

#### Scenario: Unchanged rows do not re-render

- **WHEN** a throttled emission delivers an updated array in which one row changed
- **THEN** only cells whose Model reference changed re-render, and all other memoized cells are skipped

#### Scenario: Deletion propagates through observation alone

- **WHEN** a photo is deleted
- **THEN** the grid updates via the observable's next emission
- **AND** no code manually patches a mirrored array or dispatches a removal into a global store

### Requirement: Derived values are computed at read time, never stored

Stores SHALL NOT hold values derivable from other state — including result counts, progress percentages or ratios, filtered subsets (such as document-only lists), date-section groupings, and the effective (resolved) theme. Consumers SHALL derive such values at render time from the authoritative inputs, memoized where the derivation is expensive, and every derivation SHALL guard degenerate inputs.

#### Scenario: A count cannot drift from its collection

- **WHEN** the search result set changes
- **THEN** the displayed result count is computed from the result set itself
- **AND** no stored count field exists that can disagree with it

#### Scenario: Progress ratio is derived and guarded

- **WHEN** a processing run has started but the total is still 0
- **THEN** the derived progress ratio renders as 0% (never NaN or Infinity), because it is computed from processed/total at read time with a zero guard

### Requirement: Persisted preference keys have exactly one writer and one type

Every MMKV-persisted preference key SHALL have exactly one owning writer and exactly one value type. The battery-saver and night-processing keys (`BATTERY_SAVER_ENABLED`, `NIGHT_PROCESSING_ENABLED`) SHALL be boolean-typed and owned by `settingsStore`; `BackgroundTaskService` SHALL continue to read them as booleans at initialization and SHALL NOT write them (runtime propagation of changes to the service is specified in `services-ui-facade`). A one-time migration SHALL run before the first settings write: it SHALL read the legacy string values (`'true'`/`'false'`, written by the retired SettingsContext), rewrite them as booleans, and SHALL be idempotent — a second run, or a run against already-boolean or absent values, changes nothing. UI stores SHALL NOT write service-owned keys (search/semantic indexes, processing/reprocess checkpoints, model delivery state and enablement, device capability snapshot).

#### Scenario: Legacy string values migrate once

- **WHEN** the app first launches after upgrade with `BATTERY_SAVER_ENABLED` stored as the string `'true'`
- **THEN** the migration rewrites it as boolean `true` before any settings write occurs
- **AND** running the migration again changes nothing

#### Scenario: A toggle survives restart without a UI re-sync

- **WHEN** the user enables battery saver and cold-restarts the app
- **THEN** `BackgroundTaskService` reads boolean `true` at initialization and gates the drain accordingly
- **AND** correctness does not depend on any post-mount re-sync from the UI (the silent toggle revert cannot recur)

### Requirement: Grid zoom level persists and applies on cold start

`settingsStore` SHALL own a single `gridZoomLevel` value (3, 4, or 11 columns) serving as both the live zoom state and the persisted preference: zoom changes SHALL write it, it SHALL persist to MMKV, and on cold start the grid SHALL render at the persisted level from its first frame. No second zoom state SHALL exist. (Pinch-zoom gesture behavior is specified in `gallery-experience`.)

#### Scenario: Pinch zoom survives an app restart

- **WHEN** the user pinches the grid from 4 to 3 columns, kills the app, and relaunches
- **THEN** the gallery renders 3 columns from its first frame

### Requirement: Selection re-renders only cells whose membership flipped

`selectionStore` SHALL hold multi-select membership as a set of media ids. Grid cells SHALL subscribe via a per-id membership selector so that a selection change re-renders only the cells whose membership flipped plus selection-summary surfaces (such as the selection bar count) — never the full grid.

#### Scenario: Toggling one photo in a 10,000-photo library

- **WHEN** the grid shows a 10,000-photo library and the user toggles selection of one photo
- **THEN** only that photo's cell and the selection-summary surfaces re-render
- **AND** no other cell re-renders

#### Scenario: Clearing a selection

- **WHEN** a selection of k photos is cleared
- **THEN** exactly the k previously selected cells re-render (their membership flipped)

### Requirement: High-frequency processing progress bypasses React rendering

`processingStore` SHALL hold the latest pipeline snapshot — isProcessing, processed, total, currentFileName, isPaused, failedCount — written solely by the bootstrap's orchestrator event subscription (event-to-state mapping per `orchestrator-gallery-bridge`). Continuous progress SHALL additionally be mirrored into a Reanimated SharedValue via a vanilla-store subscription outside the React render path, and the progress indicator SHALL animate from that SharedValue. Per-item progress events SHALL NOT re-render screens or the grid; React consumers of snapshot fields SHALL be leaf surfaces subscribed via selectors.

#### Scenario: The progress bar advances without React re-renders during a drain

- **WHEN** a drain processes 1,000 photos and the orchestrator emits a progress event per item
- **THEN** the progress bar advances via the SharedValue with zero React re-renders caused by progress events
- **AND** the gallery screen and grid re-render only via the throttled media subscription

### Requirement: Model delivery state is mirrored from the service without local copies

`modelStore` SHALL be populated exclusively by subscribing to `GemmaModelDeliveryService`, whose subscription emits the current state immediately on subscribe. Every surface that displays model status, download progress, or enablement SHALL read `modelStore`; no component SHALL keep a separate local snapshot of delivery state or of the enabled flag. Enablement SHALL be read from the service-emitted state and changed only through the service API, with the store updating from the resulting emission. (The Settings AI-model section behavior is specified in `ai-model-settings`.)

#### Scenario: Enabled state cannot drift between surfaces

- **WHEN** model enablement is toggled from any surface
- **THEN** every surface displaying enablement reflects the new value from the same subscription, without remount or polling

#### Scenario: Current state is available at subscribe time

- **WHEN** a surface mounts and `modelStore` subscribes
- **THEN** the store reflects the service's current delivery state immediately via emit-on-subscribe, with no default-state flash

### Requirement: Onboarding completion is a single persisted flag

`settingsStore` SHALL persist a single `onboardingCompleted` boolean that alone drives both the root navigator's onboarding gate (per `app-navigation-shell`) and the service bootstrap trigger (boot order per `services-ui-facade`). Completing or skipping onboarding SHALL set this flag exactly once, and the flag SHALL be hydrated synchronously before the navigation tree first renders.

#### Scenario: One write flips both the gate and the boot

- **WHEN** the user completes (or skips) onboarding
- **THEN** the single flag write swaps the navigator from Onboarding to the Shell
- **AND** the same flag change triggers the pipeline bootstrap
- **AND** no second completion flag exists anywhere

#### Scenario: Cold start after completion

- **WHEN** the app relaunches with the flag persisted as true
- **THEN** the Shell renders with no onboarding flash and the bootstrap runs
