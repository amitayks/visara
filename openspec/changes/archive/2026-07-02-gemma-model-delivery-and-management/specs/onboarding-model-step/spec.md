## ADDED Requirements

### Requirement: Onboarding includes an optional model step

Onboarding SHALL include a model step (a new entry in the `OnboardingScreen` `screens` array, using the existing `OnboardingTemplate` pattern) that explains the optional on-device Gemma model and its one-time Wi-Fi download, and offers a choice to start the download or defer it. The step SHALL make clear the download is optional and gated on Wi-Fi (and charging).

#### Scenario: Model step is presented during onboarding

- **WHEN** a first-time user proceeds through onboarding
- **THEN** a model step is shown describing the optional on-device model and its one-time Wi-Fi download

#### Scenario: User can defer the download

- **WHEN** the user chooses to defer on the model step
- **THEN** no download starts and onboarding continues

### Requirement: Onboarding never blocks on the model download

Onboarding completion SHALL be independent of model delivery state. `handleComplete` SHALL dispatch `SET_ONBOARDING_COMPLETED` regardless of whether a model download was started, is in progress, or failed, and SHALL NOT await the download. Until the model is present AND enabled, the app SHALL run the Tier-0 ML-Kit path only.

#### Scenario: Completion does not wait for the download

- **WHEN** the user starts the model download on the model step and then finishes onboarding
- **THEN** onboarding completes immediately without waiting for the multi-gigabyte download, and the app proceeds on Tier-0

#### Scenario: Declined download still completes onboarding

- **WHEN** the user declines the model download
- **THEN** onboarding completes normally and the app runs Tier-0 only

### Requirement: Privacy copy reconciled to "download once, then offline"

The onboarding copy that currently promises processing "100% private… without internet" SHALL be reconciled so it no longer implies zero network use. The `WelcomeContent` and `PrivacyContent` copy in `src/screens/Onboarding/OnboardingScreen.tsx` SHALL state that the AI model is downloaded once (over Wi-Fi) and that analysis then runs fully offline, while continuing to assert accurately that photos and personal data never leave the device. No copy SHALL remain that claims AI analysis never uses the internet.

#### Scenario: Copy reflects the one-time download

- **WHEN** the user reads the welcome/privacy onboarding steps
- **THEN** the copy states the model is downloaded once over Wi-Fi and then works fully offline, and does not claim analysis happens with no internet ever

#### Scenario: On-device data guarantee preserved

- **WHEN** the reconciled privacy copy is shown
- **THEN** it still accurately states that photos and personal data never leave the device
