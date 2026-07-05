# settings-experience — Delta Spec

## MODIFIED Requirements

### Requirement: Re-run Analysis is fire-and-forget and idempotent

The Processing section SHALL provide a Re-run Analysis action that starts the model-version-aware library reprocess (`Pipeline.reprocess()`) as a fire-and-forget operation: the tap interaction SHALL complete without awaiting the sweep, and the Settings screen SHALL remain responsive while it runs. Activating the action while a sweep or drain is already active SHALL NOT start a duplicate sweep. This action is distinct from the AI Model section's re-analysis control, which remains governed by `ai-model-settings`.

#### Scenario: Tap does not block on the sweep

- **WHEN** the user triggers Re-run Analysis on a large library
- **THEN** the interaction completes immediately and the Settings screen stays responsive
- **AND** the reprocess proceeds in the background

#### Scenario: Repeat activation is a no-op

- **WHEN** the user triggers Re-run Analysis again while a sweep or drain is active
- **THEN** no duplicate sweep is started
