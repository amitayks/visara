## ADDED Requirements

### Requirement: Root navigator is a single native-stack static tree

The app SHALL define exactly one root navigator: a React Navigation 7 native stack declared with the static API, whose screens are Onboarding (included only while onboarding is not completed), Shell, PhotoViewer (presented as `transparentModal` over the Shell), Settings (standard push presentation), and the dev POC screens (included only in `__DEV__` builds). No JavaScript-stack or bottom-tabs navigator SHALL exist anywhere in the tree.

#### Scenario: Fresh install boots into onboarding

- **WHEN** the app cold-starts with onboarding not completed
- **THEN** Onboarding is the initial route of the root stack

#### Scenario: PhotoViewer presents transparently over the Shell

- **WHEN** the PhotoViewer route is presented
- **THEN** it renders as a transparent modal with the Shell remaining mounted and visible beneath it (viewer content and gestures per `gallery-experience`)

#### Scenario: Dev screens are absent from production builds

- **WHEN** the app is built with `__DEV__` false
- **THEN** the dev POC routes are not registered in the navigator and are unreachable (POC screen behavior per `executorch-poc-screen`)

### Requirement: Onboarding-to-Shell swap is driven by the conditional gate

The swap from Onboarding to the Shell SHALL happen exclusively through the static tree's conditional gate re-evaluating the persisted onboarding-completed state; no code SHALL imperatively navigate from Onboarding to the Shell. While onboarding is completed, the Onboarding screen SHALL NOT be registered in the navigator.

#### Scenario: Completing onboarding reveals the Shell without a navigate call

- **WHEN** the user completes (or skips) onboarding and the persisted completion flag becomes true
- **THEN** the gate removes Onboarding from the tree and the Shell becomes the root screen without any imperative navigation call
- **AND** pressing Android back on the Shell does not return to Onboarding

#### Scenario: Completed cold start skips onboarding entirely

- **WHEN** the app cold-starts with onboarding already completed
- **THEN** the Shell is the initial route and Onboarding is absent from the navigator

### Requirement: Shell hosts the Gallery/Albums pager outside navigation

The Shell SHALL be a single native-stack entry that hosts the two-page horizontal pager (Gallery ↔ Albums) and the morphing bottom bar; the pager SHALL NOT be a navigator, and switching pages SHALL NOT create navigation history. Page-state authority, edge-gesture validity, and search/document mode semantics are governed by `page-navigation-core`. Presenting PhotoViewer or pushing Settings SHALL leave shell state (current page, document mode) intact for return.

#### Scenario: Page swipes create no history

- **WHEN** the user swipes between Gallery and Albums repeatedly
- **THEN** the root stack depth is unchanged and hardware back does not undo page changes

#### Scenario: Shell state survives a Settings round-trip

- **WHEN** the user is on Albums with document mode previously enabled, pushes Settings, and pops back
- **THEN** the Shell shows Albums with document-mode state intact

### Requirement: Bottom bar morph choreography

The bottom bar SHALL morph between its buttons state and its search-field state along a single animation progress of approximately 300ms with cubic-bezier(0.25, 0.1, 0.25, 1) easing, staggered as follows: the buttons animate out (opacity to 0 with translateY 20 and scale 0.95) over progress 0→0.3, and the search field animates in over progress 0.7→1.0; exiting search mode SHALL play the reverse morph with the same duration and easing. Both states SHALL be absolutely positioned and overlapping within the bar so the morph never changes layout, and only GPU-composited properties (opacity, transform) SHALL be animated — width, height, flex, or other layout properties MUST NOT be animated.

#### Scenario: Entering search mode staggers buttons out then field in

- **WHEN** search mode activates
- **THEN** the buttons are fully transparent by 30% of the ~300ms progress and the search field fades in only during the final 30%
- **AND** no layout property animates during the morph

#### Scenario: Exiting search mode reverses the morph

- **WHEN** search mode deactivates
- **THEN** the field animates out and the buttons animate back in with the same ~300ms duration and easing, ending with the buttons visible and interactive

### Requirement: Bottom bar interaction safety and keyboard avoidance

Interactivity of the two bar states SHALL be controlled by `pointerEvents` values derived from React state — never from animated style values — so that only the logically active state is tappable, and the bar container SHALL be non-interactive while a morph is in flight. The search input SHALL receive focus (opening the keyboard) only after the morph completes. When the keyboard is shown, the bar SHALL translate to remain fully visible above it using the frame-synced animated keyboard height (`useAnimatedKeyboard`, a protected surface per `reanimated-4-animation-stack`).

#### Scenario: Mid-morph taps hit nothing

- **WHEN** the user taps the bar while a morph animation is in flight
- **THEN** neither the outgoing buttons nor the incoming search field receive the touch

#### Scenario: Autofocus fires after the morph settles

- **WHEN** the enter-search morph completes
- **THEN** the search input becomes focused and the keyboard opens only after completion, not during the morph

#### Scenario: Bar rides the keyboard

- **WHEN** the keyboard animates open or closed while search mode is active
- **THEN** the bar translates in sync with the keyboard animation, staying fully visible above the keyboard, and returns to its resting position when the keyboard dismisses

### Requirement: Bottom bar reflects and drives navigation state

The bottom bar SHALL render as a pure projection of the navigation store: the search-field state is shown if and only if search mode is active, the Albums button is highlighted if and only if the current page is Albums, and the Documents button is highlighted if and only if document mode is on — consistent regardless of whether the state changed via swipe, button press, or store action. Button presses SHALL drive the corresponding store transitions: Search activates search mode, Documents applies the document-mode semantics of `page-navigation-core`, Albums switches the pager page, and Settings opens the Settings screen.

#### Scenario: Bar agrees with the pager through both entry paths

- **WHEN** the user reaches Albums by swiping the pager or by tapping the Albums button
- **THEN** the Albums button renders active in both cases and the store, the pager position, and the bar agree on the current page

#### Scenario: Document toggle reflects immediately

- **WHEN** document mode toggles on or off
- **THEN** the Documents button active state updates to match the store

### Requirement: Centralized Android back priority

Android hardware-back handling SHALL be owned by exactly one handler that evaluates a fixed priority chain: (1) if search mode is active, exit search mode; (2) else if a sheet or dialog is open, close the topmost one; (3) else if the root stack can pop (Settings or PhotoViewer presented), pop it; (4) else fall through to the system default. Effective back behavior MUST NOT depend on component mount order or handler-registration order.

#### Scenario: Back exits search first

- **WHEN** search mode is active on the Shell and the user presses hardware back
- **THEN** search mode exits (the bar morphs back to buttons) and nothing else closes or pops

#### Scenario: Back closes an open sheet before popping

- **WHEN** a sheet (for example the photo info sheet) is open and the user presses hardware back
- **THEN** only the sheet closes and the screen beneath it stays presented

#### Scenario: Back pops pushed screens, then defaults

- **WHEN** the user presses hardware back on Settings with no sheet or dialog open
- **THEN** the stack pops to the Shell
- **AND** a further back press on the idle Shell (no search, no sheet, nothing to pop) falls through to the system default behavior

### Requirement: Settings opens as a pushed screen from two entry points

The Settings screen SHALL open via a standard native-stack push from exactly two entry points: the bottom-bar Settings button and the Albums-page right-edge swipe (gesture validity and thresholds per `page-navigation-core`). Both entries SHALL land on the same Settings route. Once pushed, the platform back affordances (Android back button/gesture, iOS back-swipe) SHALL pop back to the Shell, and no overlay settings drawer SHALL exist.

#### Scenario: Button and edge swipe converge on the same screen

- **WHEN** the user taps the Settings button, or performs a valid right-edge swipe on the Albums page
- **THEN** the same Settings screen is pushed onto the root stack in both cases

#### Scenario: Native back affordances dismiss Settings

- **WHEN** Settings is presented and the user uses the platform back gesture or button
- **THEN** the stack pops back to the Shell with no custom dismissal handling required
