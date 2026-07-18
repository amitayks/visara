# onboarding-model-step Specification

## Purpose
TBD - created by archiving change gemma-model-delivery-and-management. Update Purpose after archive.
## Requirements
### Requirement: Model delivery auto-starts as part of the onboarding setup finale

Onboarding SHALL start model delivery as the final task of the setup finale's single-activation sequence (owned by the `onboarding-experience` capability): starting the sequence SHALL opt the user into the model (delivery enabled) and request a download start fire-and-forget. The setup step SHALL make clear the download is one-time and gated on Wi-Fi (and charging), and that it can be managed later from Settings. A failed start (for example insufficient free space) SHALL surface on the setup task's status and SHALL NOT block onboarding completion.

#### Scenario: Setup schedules the model download

- **WHEN** the user runs the setup sequence and photo access resolves as usable
- **THEN** delivery is enabled and a download start is requested without awaiting the transfer
- **AND** the setup step reflects that the download runs over Wi-Fi while charging and is manageable in Settings

#### Scenario: Insufficient space surfaces without blocking

- **WHEN** the download start reports insufficient free space
- **THEN** the setup task presents that outcome with a pointer to Settings
- **AND** onboarding still completes normally

### Requirement: Onboarding never blocks on the model download

Onboarding completion SHALL be independent of model delivery state. Completing onboarding SHALL set the persisted onboarding-completion flag (`onboardingCompleted` in the settings store) regardless of whether a model download was started, is in progress, or failed, and SHALL NOT await the download. Until the model is present AND enabled, the app SHALL run the Tier-0 ML-Kit path only.

#### Scenario: Completion does not wait for the download

- **WHEN** the setup sequence schedules the model download and onboarding completes
- **THEN** onboarding completes immediately without waiting for the multi-gigabyte download, and the app proceeds on Tier-0

#### Scenario: Continue-anyway after denial skips the download without blocking

- **WHEN** the user completes onboarding via continue-anyway after a denied photo permission
- **THEN** onboarding completes normally without a model download having started, and the app runs Tier-0 only

### Requirement: Privacy copy reconciled to "download once, then offline"

The onboarding flow's story-step copy SHALL NOT imply zero network use. Wherever onboarding describes AI analysis or privacy, the copy SHALL state that the AI model is downloaded once (over Wi-Fi) and that analysis then runs fully offline, while continuing to assert accurately that photos and personal data never leave the device. No copy SHALL remain that claims AI analysis never uses the internet.

#### Scenario: Copy reflects the one-time download

- **WHEN** the user reads the onboarding story steps
- **THEN** the copy states the model is downloaded once over Wi-Fi and then works fully offline, and does not claim analysis happens with no internet ever

#### Scenario: On-device data guarantee preserved

- **WHEN** the reconciled privacy copy is shown
- **THEN** it still accurately states that photos and personal data never leave the device
