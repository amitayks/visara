## ADDED Requirements

### Requirement: Onboarding presents an ordered step flow with progress and Next navigation

The onboarding flow SHALL present an ordered sequence of steps that includes, in order: welcome, privacy, permissions, the optional AI model step, and a final completion step. A progress indicator SHALL reflect the user's current position in the sequence, and a primary Next control SHALL advance exactly one step per activation; on the final completion step the primary control SHALL complete onboarding. The model step's content and start-or-defer download choice are governed by the onboarding-model-step capability.

#### Scenario: Next advances through the ordered steps

- **WHEN** the user activates the primary Next control on a step before the final step
- **THEN** the flow advances to the next step in the defined order
- **AND** the progress indicator updates to reflect the new position

### Requirement: Skip control is functional and jumps to the completion step

Onboarding SHALL render a functional Skip control on every intermediate step (after the first step and before the final step). Activating Skip SHALL navigate directly to the final completion step, bypassing the remaining intermediate steps. Skip SHALL NOT itself mark onboarding complete, trigger a permission request, or start a model download.

#### Scenario: Skip is visible on intermediate steps

- **WHEN** the user views any step after the first and before the final step
- **THEN** a functional Skip control is rendered and responds to activation

#### Scenario: Skip jumps directly to the completion step

- **WHEN** the user activates Skip from an intermediate step
- **THEN** the final completion step is displayed
- **AND** onboarding is not yet marked complete
- **AND** no permission request or model download is triggered by the jump

### Requirement: Permissions step performs the real platform permission request

The permissions step SHALL invoke the operating system's photo permission request — on Android 13+ the READ_MEDIA_IMAGES and READ_MEDIA_VIDEO runtime permissions, on iOS photo-library authorization including the limited-library selection flow — and SHALL resolve the platform response to an explicit granted, limited, or denied outcome reflected in the step. The step SHALL NOT assume or hard-code a granted result.

#### Scenario: Permission granted

- **WHEN** the user triggers the permission request on the permissions step and grants access
- **THEN** the step reflects an explicit granted outcome
- **AND** the user can proceed to the next step

#### Scenario: Android 13+ media permissions are requested

- **WHEN** the permissions step requests access on Android 13+
- **THEN** the system runtime permission dialog for READ_MEDIA_IMAGES and READ_MEDIA_VIDEO is presented

#### Scenario: iOS limited-library selection

- **WHEN** the user chooses limited photo access in the iOS system prompt
- **THEN** the step resolves an explicit limited outcome
- **AND** onboarding proceeds with the limited selection treated as usable access

### Requirement: Permission denial is explained and recoverable

On a denied permission outcome, the permissions step SHALL present an explanation of the reduced functionality and SHALL offer both a path to retry the request and a path to open the app's system settings. A denied outcome SHALL NOT block progression: the user SHALL still be able to advance to the completion step and complete onboarding.

#### Scenario: Denied shows explanation and recovery paths

- **WHEN** the permission request resolves as denied
- **THEN** the step presents an explanation of what is unavailable without the permission
- **AND** offers a retry path and an open-system-settings path
- **AND** the user can still advance to the completion step and complete onboarding

#### Scenario: Retry re-invokes the system request

- **WHEN** the user activates the retry path and the platform still permits prompting
- **THEN** the operating-system permission request is presented again

#### Scenario: Settings path opens the app's system settings

- **WHEN** the user activates the open-settings path
- **THEN** the operating system's settings page for the app is opened

### Requirement: Onboarding privacy copy is accurate about network use and on-device data

The welcome and privacy steps SHALL state that the optional AI model is downloaded once over Wi-Fi and that analysis then runs fully offline, and SHALL accurately state that photos and personal data never leave the device. No onboarding copy SHALL claim that AI analysis never uses the internet. The model step's own copy and download-choice contract are governed by the onboarding-model-step capability.

#### Scenario: Copy reflects the one-time download

- **WHEN** the user reads the welcome and privacy steps
- **THEN** the copy states the model is downloaded once over Wi-Fi and then works fully offline
- **AND** no onboarding copy claims that AI analysis never uses the internet

#### Scenario: On-device data guarantee preserved

- **WHEN** the privacy copy is shown
- **THEN** it accurately states that photos and personal data never leave the device

### Requirement: Completing onboarding persists the flag, enters the Shell, and boots the pipeline

Completing onboarding via the final step's primary action SHALL set the persisted completion flag (settingsStore `onboardingCompleted`). Setting the flag SHALL swap the root navigator from Onboarding to the Shell and SHALL trigger the application boot sequence per the services-ui-facade boot-order contract. Completion SHALL NOT be conditioned on the permission outcome and SHALL NOT await model delivery (the non-blocking model contract is specified by the onboarding-model-step capability).

#### Scenario: Completion enters the Shell and starts the pipeline

- **WHEN** the user completes onboarding with the photo permission granted
- **THEN** the persisted completion flag is set and the root navigator presents the Shell
- **AND** the boot sequence initializes the processing pipeline and begins initial processing

#### Scenario: Completion with permission denied defers the pipeline

- **WHEN** the user completes onboarding while the photo permission is denied
- **THEN** onboarding completes normally and the Shell is presented
- **AND** the boot sequence surfaces the denied state instead of silently aborting, deferring pipeline processing until the permission is granted
- **AND** the gallery presents its permission-denied state per the orchestrator-gallery-bridge and gallery-experience capabilities

### Requirement: Onboarding is presented only until completed

The completion flag SHALL persist across app launches. Onboarding SHALL be presented only on launches where the flag is unset; once the flag is set, the app SHALL launch directly into the Shell. The Settings delete-all-data action SHALL preserve the completion flag: deleting all data SHALL NOT cause onboarding to be presented again.

#### Scenario: Shown on first launch

- **WHEN** the app launches with the completion flag unset
- **THEN** the onboarding flow is presented before the Shell

#### Scenario: Not shown again after completion

- **WHEN** the app is relaunched after onboarding was completed
- **THEN** onboarding is not presented and the Shell is shown directly

#### Scenario: Delete-all-data preserves completion

- **WHEN** the user runs the Settings delete-all-data action
- **THEN** the onboarding completion flag remains set
- **AND** onboarding is not presented on subsequent launches
