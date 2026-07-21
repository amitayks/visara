# gemma-model-delivery Specification

## Purpose
TBD - created by archiving change gemma-model-delivery-and-management. Update Purpose after archive.
## Requirements
### Requirement: Static pinned manifest

The delivery manifest SHALL be a static TypeScript constant defining exactly three artifacts — VLM `gemma-4-E2B-it-qat-q4_0.gguf` (~3.35 GB), projector `mmproj-gemma-4-E2B-it-Q8_0.gguf` (~0.56 GB), embedder `embeddinggemma-300M-Q8_0.gguf` (~0.33 GB) — each with URL (ungated public Hugging Face `resolve` links), byte size, pinned SHA-256, target filename, and a set-level `modelVersion` tag used for enrichment provenance. Both platforms use the same set. URLs and digests SHALL be pinned at build time (no runtime getter indirection).

#### Scenario: Manifest is the single version source

- **WHEN** enrichment stamps provenance or reprocess compares versions
- **THEN** the value equals the manifest's `modelVersion`

### Requirement: Opt-in acquisition of the three-artifact set

Acquisition SHALL start only on explicit user action (onboarding model step or settings), never automatically. `setEnabled(bool)` SHALL persist the opt-in flag and emit state; `startDownload()` SHALL acquire all missing artifacts and resolve `{started: boolean, reason?}` (`alreadyActive`, `notEnoughSpace`, `alreadyReady`).

#### Scenario: Onboarding starts the download

- **WHEN** the user enables the model in onboarding
- **THEN** all three artifacts begin downloading with aggregate progress visible, and onboarding proceeds without blocking

### Requirement: Network and disk preflight gates

Downloads SHALL default to Wi-Fi-only (cellular opt-in per platform download-manager flags) and SHALL preflight free disk ≥ total remaining bytes + 1 GB headroom, failing with `notEnoughSpace` (and surfacing required vs free) when unmet.

#### Scenario: Insufficient disk blocks cleanly

- **WHEN** free disk is 3 GB and 4.5 GB remain to download
- **THEN** `startDownload()` resolves `{started: false, reason: 'notEnoughSpace'}` and state shows the shortfall

### Requirement: Resumable, reconciled, per-artifact acquisition

Each artifact SHALL download as an OS-level background download (react-native-background-downloader) resumable across app kills; `initialize()` at boot SHALL re-attach to in-flight downloads, adopt completed files, and recompute overall status. Progress events SHALL expose per-artifact and aggregate `{bytesDownloaded, bytesTotal}`.

#### Scenario: App killed mid-download

- **WHEN** the app is killed at 60% of the VLM artifact and relaunched
- **THEN** delivery re-attaches and continues from the OS download state (no restart from zero)

### Requirement: Pinned SHA-256 verification

After each artifact completes, its SHA-256 SHALL be computed (streaming) and compared to the manifest pin: mismatch → delete file, mark that artifact failed (retryable), never ready. `isReady()` SHALL be true only when the opt-in flag is set AND all three artifacts exist with verified digests. Placeholder/unpinned digests MUST NOT ship.

#### Scenario: Corrupt download is rejected

- **WHEN** an artifact's digest mismatches
- **THEN** the file is deleted, state shows a retryable failure, and `isReady()` stays false

### Requirement: Placement and backup exclusion

Artifacts SHALL live under the app documents directory in `models/` with final names from the manifest; on iOS the directory SHALL be excluded from iCloud/iTunes backup (`NSURLIsExcludedFromBackupKey`).

#### Scenario: Backup exclusion on iOS

- **WHEN** artifacts finish downloading on iOS
- **THEN** the `models/` directory carries the backup-exclusion attribute

### Requirement: Durable delivery state and preserved contract

The service SHALL keep the public name `GemmaModelDeliveryService` and contract: `subscribe(listener)` (emits current state immediately on attach), `getState()`, `isEnabled()/setEnabled()`, `isReady()`, `initialize()`, `startDownload()`, `pause()`, `resume()`, `cancel()`, `deleteModel()` — so `modelStore`, onboarding, and settings compile against it unchanged. State (status, per-artifact progress, verified flags, enabled) SHALL survive restarts (MMKV + filesystem reconciliation, filesystem wins).

#### Scenario: modelStore works unmodified

- **WHEN** delivery state transitions during download
- **THEN** the existing `attachModelStore()` subscription renders correct status/progress with no store changes

#### Scenario: Delete reclaims all space

- **WHEN** the user deletes the model from settings
- **THEN** all three files are removed, status returns to `idle`, `isReady()` is false, and the pipeline admission gate closes
