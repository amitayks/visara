# services-ui-facade Specification

## Purpose
TBD - created by archiving change rebuild-ui-foundation. Update Purpose after archive.
## Requirements
### Requirement: Hydrated hybrid search through searchMedia

The services facade SHALL expose a UI-facing `searchMedia(query)` operation that runs the hybrid search entry point (fusion and ranking per `hybrid-search`) and returns fully hydrated media models — never bare ids — ordered exactly by the fused ranking. Hydration SHALL resolve all result ids with ONE batched database query; the facade MUST NOT issue per-id lookups. Result ids that no longer resolve to a database row SHALL be omitted without error, preserving the relative order of the remaining results. When the semantic side is unavailable, `searchMedia` SHALL return hydrated results from hybrid search's lexical-only degradation without surfacing an error.

#### Scenario: Fused ranking survives batch hydration

- **WHEN** `searchMedia` runs a query whose hybrid result is a ranked id list
- **THEN** it returns media models in exactly that fused rank order
- **AND** all ids are resolved through a single batched database query, with no per-id lookup loop

#### Scenario: Semantic-unavailable search degrades without error

- **WHEN** `searchMedia` runs while no semantic vectors are indexed or the embedding model is cold
- **THEN** it returns hydrated results from the lexical ranking alone
- **AND** no error reaches the caller

#### Scenario: Stale index ids are dropped silently

- **WHEN** the hybrid result contains an id whose media row was deleted after indexing
- **THEN** `searchMedia` omits that id and returns the remaining results in fused order

### Requirement: Complete media removal through one public path

The services facade SHALL expose a UI-facing `removeMedia(media, { permanent })` operation that removes ALL app-side state for a media item in one call: its database row, its lexical search index entry, its semantic vector, and its processing-queue rows. The operation SHALL reuse the orchestrator's existing complete-removal logic through a public path rather than reimplementing it, so UI-initiated and pipeline-initiated removals cannot diverge. When `permanent` is false the removal SHALL be app-only: the underlying file remains in device storage. When `permanent` is true, the operation SHALL additionally delete the underlying file from device storage using the platform's file-deletion semantics. After `removeMedia` resolves, the item MUST NOT appear in gallery observations, search results, or subsequent drain work.

#### Scenario: Removed media stops being searchable

- **WHEN** a processed photo that matches an indexed query is removed via `removeMedia`
- **THEN** a subsequent `searchMedia` for that query does not return it
- **AND** its lexical index entry, semantic vector, and processing-queue rows are removed together with its database row

#### Scenario: Default removal keeps the device file

- **WHEN** `removeMedia` is called with `permanent: false`
- **THEN** the item disappears from gallery, search, and queue state
- **AND** the underlying file still exists in device storage

#### Scenario: Permanent removal deletes the device file

- **WHEN** `removeMedia` is called with `permanent` set
- **THEN** the underlying file is deleted from device storage
- **AND** the full app-side cleanup also completes

### Requirement: Search index lifecycle owned by ensureSearchIndex

The services facade SHALL expose an idempotent `ensureSearchIndex()` operation that guarantees search readiness: it SHALL load the persisted lexical index and rebuild it from the database only when no valid persisted index exists, and it SHALL load the semantic index fail-soft. Repeated and concurrent calls SHALL coalesce so at most one rebuild runs at a time, and a call made after the indexes are already loaded — including when orchestrator initialization already loaded them — SHALL perform no rebuild work. UI screens MUST NOT construct, load, or rebuild search indexes directly.

#### Scenario: Missing persisted index triggers exactly one rebuild

- **WHEN** `ensureSearchIndex` is called and no valid persisted lexical index exists
- **THEN** the lexical index is rebuilt from the database once
- **AND** callers arriving during the rebuild await that same rebuild instead of starting another

#### Scenario: Already-loaded indexes make the call a no-op

- **WHEN** `ensureSearchIndex` is called after the indexes were loaded by a prior call or by orchestrator initialization
- **THEN** no rebuild or reload work is performed

#### Scenario: Semantic index absence does not fail the call

- **WHEN** the semantic index cannot be loaded because no vectors exist or the embedding model is unavailable
- **THEN** `ensureSearchIndex` resolves successfully
- **AND** search operates lexical-only until vectors become available

### Requirement: Post-onboarding boot order preserved exactly

After onboarding completion — on the launch where onboarding finishes and on every subsequent launch with onboarding already complete — the app bootstrap SHALL run the boot sequence in this exact order: (1) start `GemmaModelDeliveryService.initialize()` fire-and-forget — the boot SHALL NOT await it, and that initialization SHALL only reconcile persisted delivery state and re-attach to live OS download tasks, never auto-starting a transfer; (2) await the media permission request; (3) on grant, await `OrchestratorService.initialize()` and only then `OrchestratorService.runInitialProcessing()`. The sequence SHALL be started from a single bootstrap seam; the headless module form and shell invocation are specified in `orchestrator-gallery-bridge`.

#### Scenario: Granted permission boots the pipeline in order

- **WHEN** onboarding is complete and the permission request resolves granted
- **THEN** `OrchestratorService.initialize()` completes before `runInitialProcessing()` starts
- **AND** model-delivery initialization was started before the permission request without being awaited

#### Scenario: Model-delivery boot never starts a transfer

- **WHEN** the boot sequence runs while a partially downloaded model is present but no transfer is active
- **THEN** `GemmaModelDeliveryService.initialize()` reconciles persisted state and re-attaches to live OS tasks only
- **AND** no new download transfer starts as a result of boot

### Requirement: Permission denial yields a recoverable denied state

When the media permission request resolves denied, the bootstrap SHALL NOT call `OrchestratorService.initialize()` or `runInitialProcessing()`, and SHALL expose a denied permission state consumable by the UI, replacing the current silent boot abort. The bootstrap SHALL provide a retry path that re-runs the permission request; when a retry is granted, the remaining boot sequence SHALL complete in the same app session, WITHOUT requiring an app restart. How the denied state is rendered is specified in `onboarding-experience`.

#### Scenario: Denial surfaces state instead of a silent abort

- **WHEN** the permission request resolves denied
- **THEN** the orchestrator is not initialized and no scan runs
- **AND** a denied permission state is observable by UI consumers

#### Scenario: Retry completes the boot without an app restart

- **WHEN** the user retries from the denied state and permission is granted
- **THEN** orchestrator initialization and initial processing run to completion in the same session

### Requirement: Orchestrator events feed the processing snapshot through one subscription

The bootstrap SHALL maintain exactly one subscription to `OrchestratorService` events whose handler updates the UI-facing processing snapshot, preserving the existing event mapping verbatim: `started` marks processing active; `scan-progress` updates the current count and total from discovered/total; `progress` updates processed count, total, and current file name; `item-failed` records the failed item's media id, filename, and error message with a timestamp; `paused` and `resumed` set and clear the paused flag; `completed` marks processing inactive. Because the orchestrator does not replay state on subscribe, the subscription SHALL seed the snapshot from `OrchestratorService.getSnapshot()` at subscribe time, normalizing to emit-on-subscribe semantics at the facade boundary without modifying orchestrator internals. `OrchestratorService` MUST NOT import React; all event-to-state adaptation SHALL live in the bootstrap seam. The snapshot's store representation is specified in `ui-state-management`.

#### Scenario: Each pipeline event updates the snapshot per the preserved map

- **WHEN** the orchestrator emits `progress` with processed count, total, and current file name
- **THEN** the processing snapshot reflects those values
- **AND** `paused`/`resumed` toggle the snapshot's paused flag and `completed` clears its active flag

#### Scenario: A subscription established mid-drain reflects current progress immediately

- **WHEN** the event subscription is established while a drain is already running
- **THEN** the snapshot is seeded from `getSnapshot()` so consumers observe current progress before the next event arrives

#### Scenario: The orchestrator stays framework-agnostic

- **WHEN** the boot wiring is complete
- **THEN** `OrchestratorService` contains no React dependency
- **AND** the event-to-snapshot adaptation exists only in the bootstrap seam

### Requirement: Live media observer runs from post-onboarding boot to shutdown

Once onboarding is complete, the bootstrap SHALL start the live media observer via `MediaDiscoveryService.startObserver` with the orchestrator's exported `OBSERVER_THROTTLE_MS` throttle and SHALL forward every change batch to `OrchestratorService.enqueueDiscovered`, so media added, modified, or deleted while the app runs is folded into the pipeline without a full rescan. When app services stop, the bootstrap SHALL invoke the observer's cleanup so no further batches are delivered.

#### Scenario: A photo added while the app runs is enqueued

- **WHEN** the platform reports a newly added photo in an observer batch
- **THEN** the batch is forwarded to `enqueueDiscovered`
- **AND** the file is upserted and queued for tier-0 processing without a full rescan

#### Scenario: Shutdown stops the observer

- **WHEN** app services are stopped
- **THEN** the observer cleanup is invoked
- **AND** no further observer batches are processed

### Requirement: Drain settings are boolean-typed, single-owner, and forwarded on change

Battery-saver and night-processing setting changes SHALL be forwarded to `BackgroundTaskService.updateSettings` so drain gating stays in sync with user preference. The persisted keys `BATTERY_SAVER_ENABLED` and `NIGHT_PROCESSING_ENABLED` SHALL be boolean-typed with a single owning writer — the settings store, which also owns the idempotent one-time migration of legacy string values (see `ui-state-management`) — and no code path SHALL write string values to these keys. On the service side, `BackgroundTaskService` SHALL read these keys as booleans and SHALL observe the user's persisted preference on cold start, including the first cold start after the legacy-string migration, so drain gating never silently reverts to defaults.

#### Scenario: A settings toggle reaches the drain gate

- **WHEN** the user enables battery saver
- **THEN** `BackgroundTaskService.updateSettings` is called with `batterySaverEnabled: true`
- **AND** the drain honors the new gating on its next pause check

#### Scenario: Cold start after legacy migration reads correct booleans

- **WHEN** a device that previously persisted battery saver as the string "true" cold-starts after the migration has run
- **THEN** `BackgroundTaskService.initialize()` boolean reads return `true`
- **AND** the drain applies battery-saver gating without the user re-toggling

#### Scenario: No writer reintroduces string-typed values

- **WHEN** any settings write occurs after the rebuild
- **THEN** the stored values for both keys remain boolean-typed
- **AND** a subsequent boolean read never returns undefined because of a type clash

