# services-ui-facade Specification

## Purpose
TBD - created by archiving change rebuild-ui-foundation. Update Purpose after archive.
## Requirements
### Requirement: One facade module fronts the backend

`src/backend/facade.ts` SHALL be the only sanctioned import surface for screens/features: `searchMedia(query)`, `removeMedia(media, {permanent})`, `loadMediaMetadata(mediaId)`, `wipeAllData()`, `suggest(prefix)`, album accessors (`getManualAlbums`, `getAlbumMedia`, `createAlbum`, `updateAlbum`, `deleteAlbum`, `addToAlbum`, `removeFromAlbum`, `getSmartAlbumMedia`), plus re-exports of `useVisibleMedia`, `Pipeline` (subscribe/getSnapshot/pause/resume/stop/reprocess), `GemmaModelDeliveryService`, and `ThermalService`. Feature code SHALL NOT import repositories, engines, or native modules directly.

#### Scenario: UI compiles against the facade alone

- **WHEN** the rewiring lands
- **THEN** every `@services/*`/`@models/*` import in features/app/state resolves to `@backend/*` facade exports, and no feature file imports repo/engine/native internals

### Requirement: searchMedia returns hydrated rows in fused order

`searchMedia(query)` SHALL run the hybrid ranking (`hybrid-search`) and resolve fully hydrated media rows in fused order; ids that vanish between ranking and hydration drop out order-preserving; empty query resolves empty.

#### Scenario: Fused order preserved through hydration

- **WHEN** hybrid ranking returns ids [c, a, b] and `b` was purged meanwhile
- **THEN** `searchMedia` resolves rows [c, a]

### Requirement: removeMedia is the single removal path

`removeMedia(media, {permanent: false})` SHALL hide the row (`hidden=1`) — reversible, excluded from feed and search. `{permanent: true}` SHALL request OS deletion via `MediaIndexer.deleteAssets` and, only for ids the user confirmed, purge all traces (row, enrichment, FTS, vector, album memberships) in one transaction. Declining the OS dialog SHALL leave the item fully intact.

#### Scenario: Permanent delete honors the OS dialog

- **WHEN** the user requests permanent deletion and cancels the system prompt
- **THEN** the photo remains in the library, the grid, and the database unchanged

### Requirement: loadMediaMetadata serves the viewer

`loadMediaMetadata(mediaId)` SHALL resolve `{labels: string[], ocrText: string | null, caption: string | null, description: string | null}` from the enrichment row (labels = parsed tags), resolving empty values for un-enriched media without error.

#### Scenario: Viewer info for a pending photo

- **WHEN** the viewer opens a photo still `pending`
- **THEN** metadata resolves with empty labels and null texts (no throw), and the UI renders its existing empty states

### Requirement: Boot sequence gates processing on discovery

`startAppServices()` SHALL run: attach model-store + pipeline-event subscriptions → `GemmaModelDeliveryService.initialize()` (not awaited) → `await requestAccess()` → on grant/limited: `await LibrarySync.start()` (discovery streams, reconciliation, discovery-complete) → `Pipeline.start()` (admission gates take over). `stopAppServices()` SHALL stop observation, the pipeline, and remove subscriptions. Boot SHALL be gated on onboarding completion as today.

#### Scenario: Boot order on a granted device

- **WHEN** `startAppServices()` runs post-onboarding
- **THEN** discovery completes (grid fully populated) strictly before any enrichment item starts

### Requirement: Permission denial is recoverable in-session

Denied access SHALL set the UI-consumable denied state (settingsStore permission state, as today) without initializing LibrarySync or Pipeline, and a retry that succeeds SHALL continue the boot sequence in the same session without app restart.

#### Scenario: Deny then grant without restart

- **WHEN** the user denies, then retries from the UI and grants
- **THEN** discovery and the pipeline boot in-session

### Requirement: Pipeline events feed the processing snapshot through one subscription

The bootstrap SHALL hold exactly one `Pipeline.subscribe` feeding `processingStore.applyEvent` (seeded from `getSnapshot()`), preserving current payload semantics for `started`/`scan-progress`/`progress`/`item-failed`/`paused`/`resumed`/`completed`. No other UI-layer pipeline subscription SHALL exist.

#### Scenario: Progress reaches the UI as before

- **WHEN** the pipeline emits `progress`
- **THEN** the processing store updates through the single bootstrap subscription

### Requirement: Live observation runs from post-onboarding boot to shutdown

The bootstrap SHALL ensure LibrarySync observation is active from successful boot until `stopAppServices()`, so OS library changes fold in live per `library-discovery-first`.

#### Scenario: Observer lifecycle bound to services

- **WHEN** `stopAppServices()` runs
- **THEN** native observation stops and no further delta rounds fire

### Requirement: Drain settings forwarded to pipeline gates

The bootstrap SHALL push `settingsStore` battery-saver and night-processing values into the Pipeline's gate configuration at boot and on every change; the pipeline applies them at its next between-item check.

#### Scenario: Battery saver takes effect mid-drain

- **WHEN** the user enables battery saver during a drain on battery power
- **THEN** the drain pauses at the next between-item check with the saver reason
