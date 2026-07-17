## ADDED Requirements

### Requirement: Settings is a pushed navigation screen

The application SHALL present Settings as a screen pushed onto the root native stack, replacing the previous overlay drawer. Settings SHALL be reachable from the bottom bar's settings control and from the right-edge swipe gesture on the Albums page (gesture validity and thresholds are governed by `page-navigation-core`), and both entry points SHALL land on the same screen. The screen SHALL be dismissible through the platform's native back affordances (Android back button/gesture, iOS back swipe), returning to the shell with its prior page and filter state intact. When opened, Settings SHALL display the Appearance, Processing, AI Model, Data Management, and About sections.

#### Scenario: Opened from the bottom bar

- **WHEN** the user activates the settings control in the bottom bar
- **THEN** the Settings screen is pushed onto the native stack
- **AND** the Appearance, Processing, AI Model, Data Management, and About sections are present

#### Scenario: Opened from the Albums right-edge swipe

- **WHEN** the user completes a valid right-edge swipe on the Albums page
- **THEN** the same Settings screen is pushed onto the native stack

#### Scenario: Dismissed with native back

- **WHEN** the user uses the system back gesture or back button while Settings is open
- **THEN** Settings pops off the stack
- **AND** the shell is shown with its prior page and filter state unchanged

### Requirement: Theme selection applies immediately

The Appearance section SHALL provide a theme selector offering exactly Light, Dark, and System, indicating the active choice. Selecting a theme SHALL apply it app-wide immediately — including the status bar style — without an app restart or screen re-entry. While System is selected, the app SHALL follow the OS color scheme, including OS scheme changes that occur while the app is running. The selected theme SHALL persist across app restarts (persisted through the settings store per `ui-state-management`).

#### Scenario: Immediate app-wide application

- **WHEN** the user selects Dark while the app renders in light theme
- **THEN** all visible surfaces and the status bar switch to dark styling immediately, without restarting the app

#### Scenario: System theme follows the OS

- **WHEN** the theme is System and the OS color scheme changes while the app is running
- **THEN** the app's rendered theme updates to match the new OS scheme

#### Scenario: Selection persists

- **WHEN** the user selects a theme and later relaunches the app
- **THEN** the app renders with the selected theme from launch

### Requirement: Processing toggles stay in sync with drain gating

The Processing section SHALL provide a battery saver toggle (pause processing while the device is not charging) and a night processing toggle (restrict processing to the 00:00–06:00 window). Every toggle change SHALL be delivered to `BackgroundTaskService.updateSettings` at the time of the change so drain gating reflects the new value without an app restart. The rendered toggle state SHALL equal the persisted value after an app restart, and a toggle SHALL NOT silently revert (single-owner, boolean-typed persistence per `ui-state-management`).

#### Scenario: Battery saver reaches the drain

- **WHEN** the user enables the battery saver toggle
- **THEN** `BackgroundTaskService.updateSettings` receives `batterySaverEnabled: true`
- **AND** the drain honors battery-saver gating (pausing while the device is not charging) without an app restart

#### Scenario: Night processing reaches the drain

- **WHEN** the user enables the night processing toggle outside the 00:00–06:00 window
- **THEN** `BackgroundTaskService.updateSettings` receives `nightProcessingEnabled: true`
- **AND** drain gating treats the current time as outside the allowed processing window

#### Scenario: Toggle state survives restart

- **WHEN** the user changes either toggle and restarts the app
- **THEN** the toggle renders in the state the user set
- **AND** drain gating agrees with the rendered state

### Requirement: Pipeline status display

The Processing section SHALL display the current pipeline status: the processed count against the total. While the pipeline is paused, the status SHALL state that processing is paused and include the pause reason (such as battery-saver gating, night-window gating, or thermal throttling). When the failed count is greater than zero the status SHALL include it; when it is zero, no failure figure SHALL be shown. The status SHALL update live while the screen is visible.

#### Scenario: Progress is shown and live

- **WHEN** the pipeline is processing items while Settings is visible
- **THEN** the status shows the processed/total counts and updates as items complete, without re-opening the screen

#### Scenario: Pause reason is surfaced

- **WHEN** the pipeline is paused
- **THEN** the status states that processing is paused and shows the pause reason

#### Scenario: Failures appear only when present

- **WHEN** the failed count is greater than zero
- **THEN** the status includes the failed count
- **AND** when the failed count is zero no failure figure is displayed

### Requirement: Re-run Analysis is fire-and-forget and idempotent

The Processing section SHALL provide a Re-run Analysis action that starts the model-version-aware library reprocess (`LibraryReprocessingService.requestReprocess`) as a fire-and-forget operation: the tap interaction SHALL complete without awaiting the library sweep, and the Settings screen SHALL remain responsive while the sweep runs. Activating the action while a sweep or drain is already active SHALL NOT start a duplicate sweep. This action is distinct from the AI Model section's re-analysis control, which remains governed by `ai-model-settings`.

#### Scenario: Tap does not block on the sweep

- **WHEN** the user triggers Re-run Analysis on a large library
- **THEN** the interaction completes immediately and the Settings screen stays responsive
- **AND** the reprocess sweep proceeds in the background

#### Scenario: Repeat activation is a no-op

- **WHEN** the user triggers Re-run Analysis again while a sweep or drain is active
- **THEN** no duplicate sweep is started

### Requirement: AI Model section is hosted in Settings

The Settings screen SHALL host the AI Model section. The section's content and behavior — delivery status, download progress, lifecycle controls, enable toggle, size-versus-disk display, and re-analysis gating — are governed by the `ai-model-settings` capability and SHALL NOT be redefined by this capability.

#### Scenario: Section renders per its owning capability

- **WHEN** the user opens Settings
- **THEN** the AI Model section is present and behaves as specified by `ai-model-settings`

### Requirement: Clear Cache is implemented

The Data Management section SHALL provide a Clear Cache action that clears the app's cached image and thumbnail data (replacing the previous stub). Clearing the cache SHALL NOT affect photos in the device library, processed metadata in the database, search indexes, or settings. On completion the app SHALL show confirmation feedback via a toast; on failure the app SHALL surface the error rather than fail silently.

#### Scenario: Cache cleared with feedback

- **WHEN** the user activates Clear Cache and the operation completes
- **THEN** cached image and thumbnail data is removed
- **AND** a toast confirms completion

#### Scenario: Library data is untouched

- **WHEN** the cache has been cleared
- **THEN** media records, labels, OCR texts, embeddings, search indexes, and settings remain intact
- **AND** the gallery still renders the library

### Requirement: Delete All Data is implemented with typed confirmation

The Data Management section SHALL provide a Delete All Data action guarded by a typed confirmation: the destructive action SHALL remain unavailable until the user types the stated confirmation phrase exactly, and dismissing or failing the confirmation SHALL delete nothing. On confirmation the app SHALL delete all media records, labels, OCR texts, embeddings, processing-queue rows, and the lexical and semantic search indexes (including their persisted snapshots), and SHALL then restart media discovery so the library re-populates and re-processes without requiring an app restart. The operation SHALL preserve user settings and the onboarding-completed flag (the user is NOT returned to onboarding), SHALL NOT delete downloaded AI model files (model deletion belongs to the AI Model section per `ai-model-settings`), and SHALL NOT modify or delete any photo in the device library.

#### Scenario: Typed confirmation gates deletion

- **WHEN** the user activates Delete All Data and does not enter the exact confirmation phrase
- **THEN** nothing is deleted and the app state is unchanged

#### Scenario: Confirmed deletion wipes and restarts discovery

- **WHEN** the user completes the typed confirmation
- **THEN** media records, labels, OCR texts, embeddings, queue rows, and both search indexes are deleted
- **AND** media discovery restarts and the gallery re-populates as items are re-discovered

#### Scenario: Preserved surfaces survive the wipe

- **WHEN** the deletion completes
- **THEN** the theme, processing toggles, and other settings retain their values
- **AND** the onboarding flow is not shown again
- **AND** downloaded AI model files remain on disk
- **AND** photos in the device library are untouched

### Requirement: About section with no non-functional controls

The About section SHALL display the installed app version (sourced from device info) and an on-device privacy statement affirming that photo analysis runs on the device and photos never leave it. The Settings screen SHALL NOT present controls whose actions are unimplemented; in particular the legacy placeholder rows Privacy Policy, Terms of Service, and Open Source Licenses SHALL NOT be present.

#### Scenario: Version and privacy statement shown

- **WHEN** the user views the About section
- **THEN** the app version and the on-device privacy statement are displayed

#### Scenario: No dead controls anywhere in Settings

- **WHEN** the user inspects every Settings section
- **THEN** no Privacy Policy, Terms of Service, or Open Source Licenses rows exist
- **AND** every rendered control performs its documented action
