# media-indexer-native Specification

## Purpose
TBD - created by archiving change rebuild-backend-gemma. Update Purpose after archive.
## Requirements
### Requirement: MediaIndexer TurboModule exists on both platforms

The system SHALL provide a `MediaIndexer` TurboModule (spec `NativeMediaIndexer.ts` under the existing `VisaraSpecs` codegen, `jsSrcsDir` unchanged) implemented in Swift (iOS) and Kotlin (Android), registered exactly like the surviving `ThermalObserver` module (iOS `RCT_EXTERN_REMAP_MODULE` + generated-spec `getTurboModule` conformance; Android `TurboReactPackage` added in `MainApplication.kt`). The legacy `MediaObserver` and `VisionTextRecognizerModule` TurboModules (TS specs, Swift/ObjC and Kotlin/Java implementations, and package registrations) SHALL be deleted in the same change.

#### Scenario: Module resolves on both platforms

- **WHEN** JS calls `TurboModuleRegistry.get('MediaIndexer')` on an Android or iOS build
- **THEN** the module resolves and its methods are callable

#### Scenario: Legacy modules are gone

- **WHEN** the app builds after this change
- **THEN** no `MediaObserver` or `VisionTextRecognizerModule` TurboModule, TS spec, or native source remains in the tree

### Requirement: Bulk scan streams minimal records fast

`fullScan(batchSize)` SHALL enumerate the entire accessible library and stream results as `indexer_batch` events (`{items: MediaItem[]}`) followed by one `indexer_scan_complete` event (`{total: number, token: string}`), where `MediaItem = {id, uri, filename, mimeType, kind: 'image'|'video'|'pdf', width, height, fileSize, takenAt}` and nothing more (no EXIF, no location, no per-item file-system access). On iOS the scan SHALL use `PHAsset.fetchAssets` with no predicate and no sort descriptors, read only cached asset properties plus the KVC filename, sort in native memory by creation date descending, and emit `ph://<localIdentifier>` URIs. On Android the scan SHALL use a single `ContentResolver` query per media collection with an 8-column projection sorted `DATE_TAKEN DESC` (falling back to `DATE_ADDED * 1000` when `DATE_TAKEN` is null/0) and emit `content://` URIs. All scanning SHALL run off the main/UI thread.

#### Scenario: Full library streams in batches

- **WHEN** `fullScan(2000)` runs against a library of 10,000 photos
- **THEN** five `indexer_batch` events of 2,000 minimal records each arrive, followed by `indexer_scan_complete` with `total: 10000` and an opaque change token

#### Scenario: Payloads stay minimal

- **WHEN** any batch event is emitted
- **THEN** each item carries exactly the `MediaItem` fields (the fat-payload OOM/freeze failure mode is structurally excluded)

### Requirement: Cross-launch change tracking including deletions

`changesSince(token)` SHALL resolve `{added: MediaItem[], updated: MediaItem[], deletedIds: string[], newToken: string, full: boolean}`. On iOS it SHALL use `PHPhotoLibrary.fetchPersistentChanges(since:)` mapping inserted/updated/deleted identifiers; when the change history is expired or the token is invalid it SHALL resolve `full: true` (caller re-runs `fullScan` and reconciles). On Android it SHALL compare `MediaStore.getVersion()` (mismatch → `full: true`), otherwise query rows with `GENERATION_ADDED` or `GENERATION_MODIFIED` greater than the token's generation, and detect deletions via an `_ID`-only sweep the caller diffs against its known ids (the module MAY return the id sweep in `deletedIds` when it can compute the diff natively). Deletions SHALL be reported — the legacy module's silent deletion gap MUST NOT be reproduced.

#### Scenario: A photo deleted while the app was dead is reported

- **WHEN** the user deletes a photo from the OS gallery while the app is not running, then launches the app and `changesSince(lastToken)` runs
- **THEN** the result contains that photo's id in `deletedIds` (or `full: true`, after which reconciliation removes it)

#### Scenario: Expired history degrades to full rescan

- **WHEN** `changesSince` is called with a token the OS no longer honors
- **THEN** the module resolves `full: true` with a fresh token, and no error is thrown

### Requirement: Live observation is a poke, not a second data path

`observe(throttleMs)` SHALL register a platform observer (`PHPhotoLibraryChangeObserver` / debounced `ContentObserver`) that emits `indexer_changed` events (empty payload) at most once per throttle window while the app runs; `stopObserving()` SHALL unregister it. Consumers respond by calling `changesSince` — the delta contract is the single source of change data.

#### Scenario: Burst of new photos coalesces to one poke

- **WHEN** 20 photos are saved within one throttle window while observing
- **THEN** exactly one `indexer_changed` event is emitted, and the subsequent `changesSince` call returns all 20 additions

### Requirement: Access request and status

`requestAccess()` SHALL trigger the platform photo-library authorization flow and resolve `'granted' | 'limited' | 'denied'`; `getAccessStatus()` SHALL resolve the current status without prompting. iOS limited-library selection SHALL behave as the accessible library (scans return the selection; selection edits surface through the observer/changesSince path).

#### Scenario: Limited access still yields a working library

- **WHEN** the user grants limited access to 50 photos
- **THEN** `requestAccess()` resolves `'limited'` and `fullScan` streams exactly those 50 items

### Requirement: OS-level asset deletion

`deleteAssets(ids)` SHALL request deletion through the platform's user-confirmed flow (`PHAssetChangeRequest.deleteAssets` on iOS; `MediaStore.createDeleteRequest` with activity result on Android) and resolve `{deleted: string[]}` for the ids actually removed. File-path `unlink` hacks MUST NOT be used for library assets.

#### Scenario: User confirms a permanent delete

- **WHEN** `deleteAssets([id])` runs and the user confirms the system dialog
- **THEN** the asset is removed from the device library and the promise resolves with that id in `deleted`

#### Scenario: User cancels the system dialog

- **WHEN** the user declines the system deletion prompt
- **THEN** the promise resolves with an empty `deleted` array and no error is thrown

### Requirement: Android PDF discovery parity

On Android, `pdfScan()` SHALL stream `indexer_batch` events for `application/pdf` rows from `MediaStore.Files` with `kind: 'pdf'`, terminated by `indexer_scan_complete`. On iOS `pdfScan()` SHALL resolve immediately with `total: 0` (platform has no shared PDF store).

#### Scenario: Android PDFs appear as documents

- **WHEN** `pdfScan()` runs on Android with 12 PDFs on device
- **THEN** batch events deliver 12 items with `kind: 'pdf'` and documents mode can filter them
