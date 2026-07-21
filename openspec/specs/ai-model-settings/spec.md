# ai-model-settings Specification

## Purpose
TBD - created by archiving change gemma-model-delivery-and-management. Update Purpose after archive.
## Requirements
### Requirement: Settings exposes an "AI Model" section

The Settings screen SHALL provide an "AI Model" section (a section of the pushed Settings screen alongside its other sections such as Appearance, Processing, Data Management, and About/Legal; screen hosting is owned by the `settings-experience` capability). The section SHALL be data-driven from `GemmaModelDeliveryService` state and SHALL render at least: the current delivery status, the model set name and total size (the pinned Gemma 4 E2B + EmbeddingGemma artifact set — there are no per-platform variants), and the available controls. It SHALL reflect state changes while the screen is visible.

#### Scenario: Section renders from delivery state

- **WHEN** the user opens the Settings screen
- **THEN** an "AI Model" section is shown with the current status and model-set identity sourced from `GemmaModelDeliveryService`

#### Scenario: Section updates as state changes

- **WHEN** the delivery state transitions (for example `downloading` to `ready`)
- **THEN** the section reflects the new status while the screen is visible

### Requirement: Download progress and lifecycle controls

The AI Model section SHALL show download progress (percent and/or byte counts from the delivery state machine) while a transfer is active, and SHALL expose Download, Pause, Cancel, and Delete controls appropriate to the current state. Pause/Cancel SHALL act on the underlying background download; Delete SHALL remove the downloaded files and return the state to `notPresent`. When a download is waiting on the Wi-Fi/charging policy, the section SHALL show that waiting reason rather than a generic error.

#### Scenario: Progress is shown during download

- **WHEN** a download is in progress
- **THEN** the section displays progress and offers Pause and Cancel

#### Scenario: Delete reclaims and resets

- **WHEN** the user taps Delete on a downloaded model
- **THEN** the model files are removed and the section returns to the not-downloaded state offering Download

#### Scenario: Waiting reason is surfaced

- **WHEN** a download cannot proceed because the device is off Wi-Fi or not charging
- **THEN** the section shows the waiting-for-Wi-Fi/charging reason instead of failing

### Requirement: Model size versus free disk

Before and during acquisition the section SHALL display the model's size against the device's available storage (`DeviceInfo.getFreeDiskStorage()`), and SHALL warn when free disk is insufficient for the variant plus headroom so the user understands why a download is blocked.

#### Scenario: Size and free disk are shown

- **WHEN** the model is not yet downloaded
- **THEN** the section shows the model size and current free disk space

#### Scenario: Insufficient space is warned

- **WHEN** free disk is below the model size plus headroom
- **THEN** the section warns that there is not enough space and does not start the download

### Requirement: Enable toggle (opt-in)

The section SHALL provide an enable toggle bound to the `MODEL_ENABLED` preference, defaulting to off. The toggle's displayed state SHALL be sourced from the `GemmaModelDeliveryService` subscription (which emits current state on subscribe; mirrored by `modelStore`); the section SHALL NOT hold a component-local copy of the enabled state that can diverge from subscription updates when the preference is changed from another surface. The toggle SHALL represent the user's intent to use the on-device model; it SHALL NOT itself start a download, and enabling it while no model is present SHALL NOT make `isReady()` true.

#### Scenario: Enable defaults off

- **WHEN** the user first opens the AI Model section
- **THEN** the enable toggle is off

#### Scenario: Enabling without a model does not make it ready

- **WHEN** the user turns the enable toggle on while no verified model is present
- **THEN** `MODEL_ENABLED` is set true but `isReady()` remains false until a verified model exists

#### Scenario: Toggle tracks the subscription, not a local snapshot

- **WHEN** the `MODEL_ENABLED` preference is changed through any path other than the section's own toggle and `GemmaModelDeliveryService` emits the updated state while the section is visible
- **THEN** the toggle displays the emitted enabled value without the Settings screen being reopened

### Requirement: Re-run analysis hook is exposed but not wired to an active drain

The section SHALL present a "Re-run analysis" control that invokes `Pipeline.reprocess()` — now a live operation (the rebuilt pipeline exists): stale-version and failed rows flip to `pending` and drain under the standard progress surface. The control SHALL be disabled or clearly marked unavailable while the model is not ready or not enabled, and invoking it during an active drain SHALL NOT create duplicate work.

#### Scenario: Re-run starts a live reprocess

- **WHEN** the user taps "Re-run analysis" with the model ready and enabled
- **THEN** `Pipeline.reprocess()` flips stale/failed rows to `pending` and the drain proceeds under the existing progress UI

#### Scenario: Re-run gated on readiness

- **WHEN** the model is not ready or not enabled
- **THEN** the "Re-run analysis" control is disabled or clearly marked unavailable
