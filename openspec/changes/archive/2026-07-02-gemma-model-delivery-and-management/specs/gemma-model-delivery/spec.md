## ADDED Requirements

### Requirement: Explicit opt-in model acquisition

The system SHALL NOT download the Gemma-4 model without an explicit user action. A new `GemmaModelDeliveryService` (all-static, JS-only) SHALL own model acquisition, and the `MODEL_ENABLED` preference SHALL default to `false`. No download SHALL begin on app launch, on onboarding completion, or as a side effect of any Tier-0 processing; a transfer SHALL start only when the user triggers it from the onboarding model step or the Settings "AI Model" section. This SHALL replace `react-native-executorch`'s implicit first-`useLLM` download as the way the model is acquired in normal use.

#### Scenario: No download without consent

- **WHEN** the app launches, onboarding completes, or Tier-0 processing runs, and the user has not triggered a model download
- **THEN** no Gemma model bytes are fetched and the delivery state remains `notPresent`

#### Scenario: User explicitly starts acquisition

- **WHEN** the user activates the download affordance in Settings or the onboarding model step
- **THEN** `GemmaModelDeliveryService` begins the gated acquisition and the delivery state advances toward `downloading`

### Requirement: Wi-Fi and charging gated download

The download SHALL be constrained to un-metered (Wi-Fi) connectivity via OS-enforced flags — `isAllowedOverMetered:false` and `isAllowedOverRoaming:false` per Android download task, and `setConfig({ allowsCellularAccess:false })` for the iOS background session — so the OS itself withholds the transfer off Wi-Fi. Charging SHALL be gated in JS: the service SHALL check `DeviceInfo.isBatteryCharging()` before starting and MAY pause the transfer if charging stops, and SHALL fail open (treat an unreadable charging state as chargeable) so an unreadable sensor never permanently blocks acquisition. When a download cannot proceed because of the Wi-Fi/charging policy, the service SHALL expose a "waiting" state with the reason rather than failing.

#### Scenario: Download withheld off Wi-Fi

- **WHEN** the user starts the download while on a metered/cellular connection
- **THEN** the download tasks are created with metered/roaming disallowed (and iOS cellular access disabled) so the OS does not transfer bytes, and the service reports a "waiting for Wi-Fi" state

#### Scenario: Download proceeds on Wi-Fi and charging

- **WHEN** the device is on Wi-Fi and charging and the user starts the download
- **THEN** the transfer proceeds and progress is observable

#### Scenario: Charging state is unreadable

- **WHEN** `DeviceInfo.isBatteryCharging()` throws or is unavailable at start
- **THEN** the charging gate fails open (treats the device as chargeable) and does not block acquisition on that ground

### Requirement: Managed download placed at the executorch cache path

`GemmaModelDeliveryService` SHALL drive the download itself using `@kesha-antonov/react-native-background-downloader`, writing each of the model's three sources (`modelSource`, `tokenizerSource`, `tokenizerConfigSource` from `models.llm.gemma4_e2b_multimodal()`) to the exact final path `react-native-executorch` uses — `${directories.documents}/react-native-executorch/${filename}` where `filename` is the executorch `getFilenameFromUri` transform (strip scheme, cut at `#`, replace every non-`[a-zA-Z0-9._-]` char with `_`). Because the bare resource-fetcher skips a download when that final path already exists, a fully pre-placed set MUST allow a subsequent `useLLM` load to complete with NO re-download. The URL/path convention SHALL be treated as pinned to `react-native-executorch@0.9.2`.

#### Scenario: Files land where executorch expects

- **WHEN** acquisition completes
- **THEN** the `.pte`, `tokenizer.json`, and `tokenizer_config.json` exist at `${directories.documents}/react-native-executorch/${getFilenameFromUri(url)}` for their respective source URLs

#### Scenario: useLLM performs no re-download after pre-placement

- **WHEN** the model files are already present at the executorch cache path and Tier-1 later calls `useLLM({ model: models.llm.gemma4_e2b_multimodal() })`
- **THEN** the resource-fetcher finds the files present and loads them without downloading again

### Requirement: Resumable acquisition with boot reconciliation

The download SHALL survive app termination on both platforms by using the background downloader, and on `initialize()` the service SHALL re-attach progress/done/error handlers to any still-running task via `getExistingDownloadTasks()`. `initialize()` SHALL also reconcile persisted MMKV state against on-disk reality (using `BareResourceFetcher.listDownloadedModels()` and `RNFS.exists`, plus a lazy checksum) so a `ready` state whose file is missing reverts to `notPresent`, and a complete-but-unrecorded file is adopted. `initialize()` SHALL NOT auto-start any transfer — it only observes and reconciles.

#### Scenario: In-flight download resumes after relaunch

- **WHEN** the app is killed mid-download and relaunched
- **THEN** `initialize()` re-attaches to the existing background task and progress continues to be reported (no restart from zero for the in-flight file)

#### Scenario: Stale ready state is corrected

- **WHEN** persisted state says `ready` but the model file no longer exists on disk
- **THEN** reconciliation resets the state to `notPresent` and `isReady()` returns false

#### Scenario: initialize never auto-downloads

- **WHEN** `initialize()` runs at boot with `MODEL_ENABLED` false and no files present
- **THEN** it reconciles state only and starts no transfer

### Requirement: Checksum integrity verification, fail closed

Before the model is marked `ready`, the downloaded `.pte` SHALL be verified with a native streaming hash — `@dr.pogodin/react-native-fs` `hash(path, "sha256")` — against a pinned expected digest, so the multi-gigabyte file is never read into JS. Small artifacts (tokenizer/config, or a signed manifest) MAY be verified with `react-native-quick-crypto`. Verification SHALL be fail-closed: a digest mismatch or hash error SHALL delete the offending file, set the state to `failed`, and refuse the `ready` transition. The state SHALL reach `ready` only when every required file exists AND the `.pte` digest matches.

#### Scenario: Corrupt model is rejected

- **WHEN** the downloaded `.pte` hash does not match the pinned expected digest
- **THEN** the file is deleted, the state becomes `failed`, and the model is not marked ready

#### Scenario: Verified model becomes ready

- **WHEN** all three files are present and the `.pte` SHA-256 matches the pinned digest
- **THEN** the state transitions to `ready` and `checksumVerified` is true

### Requirement: Durable delivery state in MMKV

The service SHALL persist a delivery state machine under `STORAGE_KEYS.MODEL_DELIVERY_STATE` capturing at least `status` (`notPresent | queued | downloading | paused | verifying | ready | failed`), `variant`, `modelVersion`, `bytesDownloaded`, `bytesTotal`, per-file paths/verified flags, `checksumVerified`, `updatedAt`, and the last `error`. Progress writes SHALL be throttled (not per-byte). The service SHALL expose `isReady()` which returns true only when `MODEL_ENABLED` is on, the status is `ready`, and the checksum is verified.

#### Scenario: State persists across launches

- **WHEN** a download reaches 40% and the app is relaunched
- **THEN** the restored state reports `downloading` with the persisted byte counts (subject to reconciliation)

#### Scenario: isReady requires enabled, ready, and verified

- **WHEN** the status is `ready` and the checksum is verified but `MODEL_ENABLED` is false
- **THEN** `isReady()` returns false

### Requirement: iOS backup-excluded cache placement

On iOS the model cache directory SHALL be excluded from iCloud/iTunes backup. The service SHALL create `${directories.documents}/react-native-executorch/` with `RNFS.mkdir(dir, { NSURLIsExcludedFromBackupKey: true })` before the first download, so the multi-gigabyte weights are not swept into device backups; because the resource-fetcher only creates the directory when absent, pre-creating it with the flag SHALL make the fetcher's own creation a no-op. Reconciliation SHALL re-assert the exclusion idempotently.

#### Scenario: Cache directory is backup-excluded on iOS

- **WHEN** the cache directory is created ahead of the first download on iOS
- **THEN** it is created with `NSURLIsExcludedFromBackupKey` set to true

### Requirement: Free-disk pre-flight and reclaim

Before starting a download the service SHALL compare the variant's expected size against live free disk (`DeviceInfo.getFreeDiskStorage()`) with headroom slack and SHALL refuse to start (surfacing a "not enough space" reason) when space is insufficient; the pre-flight is advisory and a downloader disk error SHALL still be handled into `failed` without a partial `ready`. The service SHALL provide a delete/reclaim operation that removes the downloaded files (via `BareResourceFetcher.deleteResources(...)` or `RNFS.unlink`) and returns the state to `notPresent`.

#### Scenario: Insufficient space blocks the download

- **WHEN** free disk is below the variant size plus headroom
- **THEN** the download does not start and the service reports insufficient space

#### Scenario: Delete reclaims space

- **WHEN** the user deletes the downloaded model
- **THEN** the model files are removed, freed space is reflected by the OS, and the state returns to `notPresent`

### Requirement: Variant and manifest derived from the executorch getter

The active variant SHALL be derived from `Platform.OS` (`ios → mlx`, `android → vulkan`, optional `android → aicore`) and its URL set SHALL be read from `models.llm.gemma4_e2b_multimodal()` so the manifest never drifts from the pinned library. The manifest SHALL expose a `modelVersion` string that MUST equal the value a future Gemma engine will stamp into `media_files.ai_model_version`, so the orchestrator's version-aware idempotency guard remains correct once a Tier-1 drain is added. Byte-sizes and expected digests carried by the manifest MAY be placeholders until confirmed on-device and pinned.

#### Scenario: Variant matches platform

- **WHEN** the manifest is resolved on Android
- **THEN** the variant is `vulkan` (or `aicore` when detected) and the URLs come from the executorch getter, not hardcoded constants

#### Scenario: modelVersion aligns with schema provenance

- **WHEN** the manifest exposes `modelVersion`
- **THEN** it equals the string the future Gemma engine will write to `ai_model_version`, keeping re-run idempotency consistent

### Requirement: Optional Android AICore fast-path

The system MAY support an Android AICore / Gemini-Nano variant that satisfies model readiness WITHOUT downloading. A `probeAicoreAvailable()` seam SHALL exist and SHALL default to `false` until a native capability bridge implements it; when it returns `true`, the service SHALL select the `aicore` variant, skip the download, and MAY reach `ready` with `bytesTotal` of zero. All downstream consumers (enable toggle, Settings display, re-run seam, `isReady()`) SHALL treat `aicore` as an ordinary ready variant.

#### Scenario: AICore skips the download

- **WHEN** `probeAicoreAvailable()` returns true on an Android device
- **THEN** the service selects the `aicore` variant and does not download the Vulkan `.pte`

#### Scenario: AICore probe defaults off

- **WHEN** no native AICore bridge is present
- **THEN** `probeAicoreAvailable()` returns false and the service uses the downloadable `vulkan` variant

### Requirement: Delivery does not block or alter Tier-0

`GemmaModelDeliveryService` SHALL expose delivery state, `isReady()`, the `MODEL_ENABLED` flag, and a `requestReanalysis()` seam, but SHALL wire NO consumer into the Tier-0 drain: `ProcessingService`, the `OrchestratorService` `processNext`/`maybeStartDrain` path, and `EngineRegistry` SHALL be unchanged, no Gemma engine SHALL be registered, and no `tier1_gemma` work SHALL be enqueued. The app SHALL remain fully functional on Tier-0 whether or not the model is present, and `EngineRegistry.getById("gemma")` SHALL still resolve `undefined`.

#### Scenario: Tier-0 pipeline unchanged

- **WHEN** the diff for this change is reviewed
- **THEN** `ProcessingService`, `OrchestratorService.processNext`/`maybeStartDrain`, and `EngineRegistry` are unmodified, and no Gemma engine or `tier1_gemma` enqueue is added

#### Scenario: App works with no model present

- **WHEN** the model is absent or the download failed
- **THEN** the app continues to run Tier-0 ML-Kit processing normally
