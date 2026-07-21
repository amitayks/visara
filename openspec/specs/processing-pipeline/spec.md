# processing-pipeline Specification

## Purpose
TBD - created by archiving change rebuild-backend-gemma. Update Purpose after archive.
## Requirements
### Requirement: Single drain over row status — no queue table, no tiers

The pipeline SHALL drain work by querying media rows directly (`enrich_status='pending' AND kind='image' AND deleted=0`, newest `taken_at` first, one item at a time), with durable state living entirely on the rows: `processing` marks the in-flight item, `done`/`failed`/`skipped` are terminal per attempt cycle, `retry_count` increments per failure and items fail permanently at retry_count ≥ 2. At pipeline start, stale `processing` rows SHALL be reset to `pending` (crash recovery). There SHALL be no separate queue table and no MMKV checkpoint blobs — row status IS the checkpoint.

#### Scenario: Kill mid-item, resume clean

- **WHEN** the process dies while item X is `processing`
- **THEN** on next pipeline start X is reset to `pending` and re-drained; no other item is affected

#### Scenario: Newest first

- **WHEN** the drain picks its next item
- **THEN** it is the pending image with the greatest `taken_at`

### Requirement: Admission gates evaluated between items

Before each item, the pipeline SHALL verify ALL gates and otherwise pause (emitting `paused` with a reason) or stop: (1) this session's discovery-complete has fired (`library-discovery-first`); (2) `GemmaModelDeliveryService.isReady()` — enabled + all artifacts verified; (3) device capability: total RAM ≥ 5.5 GB (below: items admit as `skipped`, pipeline reports idle-complete, settings copy explains); (4) thermal state < serious (via ThermalObserver, fail-open on read errors); (5) battery: charging OR level > 20%; (6) battery-saver setting: when on, require charging; (7) night-processing setting: when on, drain only 00:00–06:00 local; (8) no manual pause/stop. Gate changes (thermal events, charge state, settings) SHALL take effect at the next between-item check without restarting the pipeline.

#### Scenario: Thermal serious pauses, recovery resumes

- **WHEN** thermal reaches `serious` mid-drain
- **THEN** the drain pauses after the in-flight item with reason surfaced, and resumes automatically when thermal drops below serious

#### Scenario: Processing never precedes discovery

- **WHEN** the pipeline is started while discovery is still streaming
- **THEN** no item enters `processing` until `discovery-complete` fires

### Requirement: Preserved event contract

The pipeline SHALL emit the exact `OrchestratorEvent` union the UI already reduces — `started`, `scan-progress {discovered,total}`, `item-processed {mediaFileId,filename}`, `item-failed {mediaFileId,filename,error}`, `progress {processed,total,failed,currentFileName?}`, `paused`, `resumed`, `completed` — via `subscribe(listener) → unsubscribe` and `getSnapshot() → {processed,total,failed,isRunning,isPaused}`. `processingStore.applyEvent` and the SharedValue progress mirror SHALL work unmodified. (`discovery-complete` is additionally emitted for new consumers; existing reducers ignore unknown members by construction.)

#### Scenario: Existing progress UI works unchanged

- **WHEN** the new pipeline drains 100 items
- **THEN** the gallery progress pill and settings processing section render progress exactly as before, with zero changes to `processingStore`

### Requirement: Per-item flow is atomic and inline-embedded

Each drained item SHALL: mark `processing` → prepare image → VisionEngine.analyze → persist enrichment + FTS + `done` status + provenance in one transaction → embed + vector write → emit `item-processed` and `progress`. Failures at any stage mark the item (`pending` retry or `failed`) in its own transaction and emit `item-failed` without aborting the drain.

#### Scenario: One bad image doesn't stall the library

- **WHEN** item X fails twice (corrupt image)
- **THEN** X is `failed` with its error recorded, the failed count increments, and the drain continues

### Requirement: Background execution honest to each platform

On Android the drain SHALL run inside the existing dataSync foreground service wrapper (`react-native-background-actions`), updating that service's own progress notification (processed/total) — `@notifee` is removed and no second notification stack exists. On iOS the drain SHALL run while the app is active with the idle timer disabled during active draining (keep-awake released on pause/stop), and on backgrounding SHALL settle the in-flight item within the OS grace window, release the VLM, and rely on row status to resume on next activation. OS-imposed service timeouts (Android 15/16 6-hour cap) SHALL be treated as a pause: settle, stop the service, resume on next foreground.

#### Scenario: Android background continuation

- **WHEN** the user backgrounds the app mid-drain on Android
- **THEN** the foreground service keeps draining with its notification updating, and OS timeout/kill leaves only resumable row state behind

#### Scenario: iOS screen stays awake while draining

- **WHEN** a drain is actively processing on iOS in the foreground
- **THEN** the idle timer is disabled; pausing or completing re-enables it

### Requirement: Pause, resume, stop are user-honored

`pause()` SHALL halt after the in-flight item and emit `paused`; `resume()` re-enters the drain loop and emits `resumed`; `stop()` halts, releases the VLM context, and stops the platform service. All three SHALL be idempotent.

#### Scenario: Manual pause survives gate churn

- **WHEN** the user pauses and thermal/battery gates later become favorable
- **THEN** the drain stays paused until an explicit resume

### Requirement: Reprocessing is one status sweep

`reprocess()` SHALL flip to `pending` every image row whose `model_version` differs from the current VLM manifest version or whose status is `failed` (resetting `retry_count`), invalidate affected vectors by version rule, and start/continue the drain — reusing the same progress surface. Invoking it while a drain runs SHALL NOT create duplicate work (the sweep is a row-status UPDATE; the running drain simply sees more pending rows).

#### Scenario: Model upgrade re-enriches the library

- **WHEN** a release ships a new VLM version and the user taps Re-run analysis
- **THEN** previously `done` rows with the old version flip to `pending` and drain newest-first under the same progress UI
