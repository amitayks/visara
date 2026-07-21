# library-discovery-first Specification

## Purpose
TBD - created by archiving change rebuild-backend-gemma. Update Purpose after archive.
## Requirements
### Requirement: The whole library is visible before any processing

On every app session, the backend SHALL complete library discovery — every accessible photo, video, and (Android) PDF upserted into the database and therefore visible in the gallery feed — **before** the processing pipeline is permitted to start. Discovery completion is a per-session gate: the pipeline's admission check SHALL fail until the current session's discovery has completed, regardless of how much enrichment backlog exists.

#### Scenario: First launch shows everything before ML starts

- **WHEN** a user with 10,000 photos completes onboarding with permission granted
- **THEN** all 10,000 photos stream into the gallery grid (batched inserts, reactive feed) and the enrichment pipeline processes zero items until the scan-complete reconciliation has finished

#### Scenario: Relaunch gates processing on reconciliation

- **WHEN** the app relaunches with a fully enriched library
- **THEN** the gallery renders instantly from the database, `changesSince` reconciliation runs, and only after it completes may the pipeline resume any pending work

### Requirement: First scan populates via streaming bulk upserts

When the database holds no media rows (first run, post-wipe, or a `full: true` token reset), `LibrarySync` SHALL run `MediaIndexer.fullScan`, upserting each arriving batch inside a single transaction per batch (`INSERT ... ON CONFLICT(uri) DO UPDATE` on metadata columns only — enrichment status and provenance columns are never touched by discovery upserts), emitting `scan-progress {discovered, total}` events as batches land. The gallery feed SHALL reflect batches incrementally (throttled reactive re-query), not only at scan end.

#### Scenario: Grid grows while the scan streams

- **WHEN** the initial scan streams 5 batches
- **THEN** the gallery feed emits updated row sets during the scan (at the feed's throttle cadence), and the first photos are visible within ~1 second on a mid-range device

#### Scenario: Re-discovered rows keep their enrichment

- **WHEN** a `full` rescan upserts a URI that already has `enrich_status='done'`
- **THEN** the row's enrichment status, provenance, and enrichment/vector rows are unchanged

### Requirement: Reconciliation removes what the OS removed

After a full scan completes, `LibrarySync` SHALL reconcile: database media ids absent from the scanned id set are purged (media row, enrichment row, FTS entry, vector, album memberships) in one transaction. After an incremental `changesSince`, the returned `deletedIds` SHALL be purged identically. The gallery feed and search results SHALL never show an asset the OS no longer has.

#### Scenario: Externally deleted photo disappears

- **WHEN** reconciliation runs after the OS reports a deletion
- **THEN** the photo's row, enrichment, FTS entry, vector, and album memberships are gone, and the grid no longer renders it

### Requirement: Incremental sync on subsequent launches

When media rows exist and a persisted change token is available, `LibrarySync` SHALL call `changesSince(token)` instead of a full scan, apply `added`/`updated` as upserts and `deletedIds` as purges, persist `newToken`, and then declare discovery complete. A `full: true` response SHALL route to the full-scan path. The change token SHALL be persisted in `sync_state` only after its deltas are durably applied.

#### Scenario: Two new photos since last launch

- **WHEN** the app launches after the camera saved 2 photos while it was dead
- **THEN** `changesSince` returns 2 additions, they are upserted (status `pending`), discovery completes, and the pipeline may then enrich them

#### Scenario: Token persists only after apply

- **WHEN** the app crashes mid-application of deltas
- **THEN** the old token is still stored, and the next launch re-fetches the same deltas (upserts are idempotent by URI)

### Requirement: Live changes fold in while the app runs

After discovery completes, `LibrarySync` SHALL start `MediaIndexer.observe` (throttle ~2000 ms) and respond to each `indexer_changed` poke with a `changesSince` round (same apply path, token advanced). Observation SHALL stop on app teardown (`stopAppServices()`), and live additions SHALL become visible in the gallery and eligible for enrichment without any rescan.

#### Scenario: Photo taken while app is open

- **WHEN** the user takes a photo while the app is foregrounded
- **THEN** within the observer throttle window the photo appears in the grid with `enrich_status='pending'`, and the running pipeline picks it up (newest-first)

### Requirement: Discovery-complete is observable

`LibrarySync` SHALL emit a `discovery-complete {total}` event each session when the gate opens (after first-scan reconciliation or incremental apply). The pipeline SHALL consume this event/state for its admission gate; UI surfaces MAY consume it for status copy.

#### Scenario: Pipeline waits for the event

- **WHEN** boot sequencing starts the pipeline before discovery has completed
- **THEN** the pipeline idles (admission gate closed) and begins draining only after `discovery-complete` fires
