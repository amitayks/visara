# onboarding-experience Specification

## Purpose
TBD - created by archiving change rebuild-ui-foundation. Update Purpose after archive.
## Requirements
### Requirement: Onboarding presents a three-step flow ending in a one-tap setup finale

The onboarding flow SHALL present an ordered sequence of exactly three steps: welcome, privacy, and a setup finale. A progress indicator SHALL reflect the user's current position, and a primary Continue control SHALL advance exactly one step per activation on the story steps (welcome, privacy). The setup finale's primary control SHALL run the first-run setup sequence (permissions and model delivery, per the requirements below) rather than merely advancing.

#### Scenario: Continue advances through the story steps

- **WHEN** the user activates the primary control on the welcome or privacy step
- **THEN** the flow advances to the next step in the defined order
- **AND** the progress indicator updates to reflect the new position

### Requirement: Skip control is functional and jumps to the setup step

Onboarding SHALL render a functional Skip control on every step before the setup finale. Activating Skip SHALL navigate directly to the setup step, bypassing the remaining story steps. Skip SHALL NOT itself mark onboarding complete, trigger a permission request, or start a model download.

#### Scenario: Skip jumps directly to the setup step

- **WHEN** the user activates Skip from a story step
- **THEN** the setup step is displayed
- **AND** onboarding is not yet marked complete
- **AND** no permission request or model download is triggered by the jump

### Requirement: The setup finale runs the full first-run sequence from a single activation

Activating the setup finale's primary control SHALL run, in order, as one sequence: (1) the real platform photo permission request, (2) on Android, a best-effort notification permission request (POST_NOTIFICATIONS), and (3) the model delivery auto-start governed by the onboarding-model-step capability. The step SHALL present each task's live status (pending, in progress, done, or needs attention) as the sequence runs. When the sequence completes with usable photo access (granted or limited), onboarding SHALL complete automatically without a further activation.

#### Scenario: One tap runs permissions and model delivery, then enters the app

- **WHEN** the user activates the setup control and grants photo access
- **THEN** the photo permission prompt, the Android notification prompt (where applicable), and the model download start are all performed by that single activation
- **AND** each task's outcome is reflected in the step
- **AND** onboarding then completes automatically

#### Scenario: Notification denial never blocks

- **WHEN** the user declines the notification permission during the sequence
- **THEN** the sequence continues to the model task and onboarding still completes

### Requirement: Setup performs the real platform photo permission request

The setup sequence SHALL invoke the operating system's photo permission request — on Android 13+ the READ_MEDIA_IMAGES and READ_MEDIA_VIDEO runtime permissions, on iOS photo-library authorization including the limited-library selection flow — and SHALL resolve the platform response to an explicit granted, limited, or denied outcome reflected in the step. The step SHALL NOT assume or hard-code a granted result.

#### Scenario: Android 13+ media permissions are requested

- **WHEN** the setup sequence requests access on Android 13+
- **THEN** the system runtime permission dialog for READ_MEDIA_IMAGES and READ_MEDIA_VIDEO is presented

#### Scenario: iOS limited-library selection

- **WHEN** the user chooses limited photo access in the iOS system prompt
- **THEN** the setup task resolves an explicit limited outcome
- **AND** the sequence proceeds with the limited selection treated as usable access

### Requirement: Photo permission denial is explained and recoverable

On a denied photo permission outcome, the setup step SHALL pause the sequence, present an explanation of the reduced functionality, and offer a retry path, a path to open the app's system settings, and a continue-anyway path. A denied outcome SHALL NOT block completion: continue-anyway SHALL complete onboarding without photo access and without starting the model download tasks that were not reached.

#### Scenario: Denied pauses with explanation and recovery paths

- **WHEN** the photo permission request resolves as denied
- **THEN** the step presents an explanation of what is unavailable without the permission
- **AND** offers a retry path, an open-system-settings path, and a continue-anyway path

#### Scenario: Retry re-invokes the system request

- **WHEN** the user activates the retry path and the platform still permits prompting
- **THEN** the operating-system permission request is presented again

#### Scenario: Continue-anyway completes onboarding

- **WHEN** the user activates continue-anyway after a denied outcome
- **THEN** onboarding completes normally and the Shell is presented

### Requirement: Onboarding privacy copy is accurate about network use and on-device data

The story steps SHALL state that the AI model is downloaded once over Wi-Fi and that analysis then runs fully offline, and SHALL accurately state that photos and personal data never leave the device. No onboarding copy SHALL claim that AI analysis never uses the internet.

#### Scenario: Copy reflects the one-time download

- **WHEN** the user reads the story steps
- **THEN** the copy states the model is downloaded once over Wi-Fi and then works fully offline
- **AND** no onboarding copy claims that AI analysis never uses the internet

#### Scenario: On-device data guarantee preserved

- **WHEN** the privacy copy is shown
- **THEN** it accurately states that photos and personal data never leave the device

### Requirement: Completing onboarding persists the flag, enters the Shell, and boots the pipeline

Completing onboarding — automatically after a successful setup sequence, or via continue-anyway after a denial — SHALL set the persisted completion flag (settingsStore `onboardingCompleted`). Setting the flag SHALL swap the root navigator from Onboarding to the Shell and SHALL trigger the application boot sequence per the services-ui-facade boot-order contract. Completion SHALL NOT be conditioned on the permission outcome and SHALL NOT await model delivery (the non-blocking model contract is specified by the onboarding-model-step capability).

#### Scenario: Completion enters the Shell and starts the pipeline

- **WHEN** onboarding completes with the photo permission granted
- **THEN** the persisted completion flag is set and the root navigator presents the Shell
- **AND** the boot sequence initializes the processing pipeline and begins initial processing

#### Scenario: Completion with permission denied defers the pipeline

- **WHEN** onboarding completes while the photo permission is denied
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
