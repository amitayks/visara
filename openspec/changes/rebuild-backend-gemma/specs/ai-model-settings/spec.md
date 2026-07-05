# ai-model-settings — Delta Spec

## MODIFIED Requirements

### Requirement: Settings exposes an "AI Model" section

The Settings screen SHALL provide an "AI Model" section (a section of the pushed Settings screen alongside its other sections such as Appearance, Processing, Data Management, and About/Legal; screen hosting is owned by the `settings-experience` capability). The section SHALL be data-driven from `GemmaModelDeliveryService` state and SHALL render at least: the current delivery status, the model set name and total size (the pinned Gemma 4 E2B + EmbeddingGemma artifact set — there are no per-platform variants), and the available controls. It SHALL reflect state changes while the screen is visible.

#### Scenario: Section renders from delivery state

- **WHEN** the user opens the Settings screen
- **THEN** an "AI Model" section is shown with the current status and model-set identity sourced from `GemmaModelDeliveryService`

#### Scenario: Section updates as state changes

- **WHEN** the delivery state transitions (for example `downloading` to `ready`)
- **THEN** the section reflects the new status while the screen is visible

### Requirement: Re-run analysis hook is exposed but not wired to an active drain

The section SHALL present a "Re-run analysis" control that invokes `Pipeline.reprocess()` — now a live operation (the rebuilt pipeline exists): stale-version and failed rows flip to `pending` and drain under the standard progress surface. The control SHALL be disabled or clearly marked unavailable while the model is not ready or not enabled, and invoking it during an active drain SHALL NOT create duplicate work.

#### Scenario: Re-run starts a live reprocess

- **WHEN** the user taps "Re-run analysis" with the model ready and enabled
- **THEN** `Pipeline.reprocess()` flips stale/failed rows to `pending` and the drain proceeds under the existing progress UI

#### Scenario: Re-run gated on readiness

- **WHEN** the model is not ready or not enabled
- **THEN** the "Re-run analysis" control is disabled or clearly marked unavailable
