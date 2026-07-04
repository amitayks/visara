## MODIFIED Requirements

### Requirement: Settings exposes an "AI Model" section

The Settings screen SHALL provide an "AI Model" section (a section of the pushed Settings screen alongside its other sections such as Appearance, Processing, Data Management, and About/Legal; screen hosting is owned by the `settings-experience` capability). The section SHALL be data-driven from `GemmaModelDeliveryService` state and SHALL render at least: the current delivery status, the platform variant label, the model size, and the available controls. It SHALL reflect state changes while the screen is visible.

#### Scenario: Section renders from delivery state

- **WHEN** the user opens the Settings screen
- **THEN** an "AI Model" section is shown with the current status and variant sourced from `GemmaModelDeliveryService`

#### Scenario: Section updates as state changes

- **WHEN** the delivery state transitions (for example `downloading` to `ready`)
- **THEN** the section reflects the new status while the screen is visible

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
