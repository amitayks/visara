# reanimated-4-animation-stack Specification

## Purpose
TBD - created by archiving change upgrade-rn-086-platform. Update Purpose after archive.
## Requirements
### Requirement: SWM animation stack pinned in verified lockstep

The project SHALL pin `react-native-reanimated@4.5.1` with its mandatory peer `react-native-worklets@0.10.1` (strict 4.5.x↔0.10.x pairing), `react-native-gesture-handler@3.0.2`, `react-native-pager-view@8.0.3`, and `react-native-reanimated-dnd@2.0.0`. Reanimated 3.x MUST NOT remain anywhere in the resolution tree (it does not support RN 0.84+).

#### Scenario: Lockstep pins resolve cleanly

- **WHEN** dependencies install after the rebuild's dependency changes
- **THEN** `npm ls react-native-reanimated react-native-worklets` shows exactly 4.5.1 and 0.10.1 with no peer errors and no 3.x reanimated anywhere
- **AND** `react-native-pager-view` resolves to exactly 8.0.3

### Requirement: Babel worklets plugin replaces the reanimated plugin in last position

`babel.config.js` SHALL replace `react-native-reanimated/plugin` with `react-native-worklets/plugin`, keeping it as the LAST plugin (after `module-resolver` and the decorator/class plugins), with the 11-alias `module-resolver` block untouched.

#### Scenario: Plugin renamed and ordered

- **WHEN** `babel.config.js` is inspected and Metro starts with a reset cache
- **THEN** `react-native-worklets/plugin` is the final plugins entry, `react-native-reanimated/plugin` appears nowhere, and the bundle builds without worklet-compilation errors

### Requirement: Existing animation surfaces remain functional under reanimated 4

The rebuilt UI SHALL implement its gesture- and animation-driven surfaces on Reanimated 4 + Gesture Handler 3, and each surface SHALL remain functional at runtime. The three hand-rolled drawer springs (Settings, Upload, and Info drawers) are no longer Reanimated surfaces: photo-info presentation moves to native TrueSheet sheets (per `ui-design-system`) and Settings becomes a pushed native-stack screen (per `app-navigation-shell`). The Reanimated-owned surfaces SHALL be:

- page swipe + edge gestures composed via `Gesture.Race`
- bottom-bar morph choreography including `useAnimatedKeyboard` translation
- photo-viewer pinch/pan/double-tap/dismiss composed via `Gesture.Simultaneous`
- album drag-reorder via reanimated-dnd 2.0.0 (`DropProvider`/`Sortable`) with the reorder callback actually wired (ordering semantics and persistence per `albums-experience`)
- search-mode fade transitions
- button/progress springs, with pipeline progress driving the progress surface through a Reanimated SharedValue (state path per `ui-state-management`)

#### Scenario: Gesture-driven surfaces work on device

- **WHEN** the rebuilt app runs on device and each surface is exercised (Gallery↔Albums page swipe, edge swipes, photo-viewer pinch/pan/double-tap/dismiss, bottom-bar morph with the keyboard open, search fade)
- **THEN** each responds without crash, freeze, or dropped gesture recognition

#### Scenario: Album drag-reorder is wired

- **WHEN** an album is long-pressed and dragged to a new position
- **THEN** the drag tracks the finger and the drop invokes the wired reorder handler with the new order (persistence per `albums-experience`)

#### Scenario: Progress animates without React re-renders

- **WHEN** pipeline progress events stream during a drain
- **THEN** the progress surface animates from SharedValue updates
- **AND** the streaming progress values cause zero React re-renders of the progress component

### Requirement: Gesture-handler 3 adopted without API migration

All gesture code in the rebuilt UI SHALL use exclusively the RNGH 3.0.2 declarative API (`Gesture`/`GestureDetector`/`GestureHandlerRootView`/`Gesture.Race`/`Gesture.Simultaneous`). The v3 hooks API MUST NOT be mixed into gesture configs, and legacy gesture-handler components (e.g. `PanGestureHandler`) MUST NOT be used anywhere. With `@react-navigation/stack` removed, stack swipe-back SHALL be provided by native-stack's platform-native back gesture: iOS swipe-back on pushed screens (e.g. Settings) MUST pop the screen with no RNGH legacy dependency.

#### Scenario: Native swipe-back on pushed screens

- **WHEN** the Settings screen is pushed and the user swipes back from the left edge on iOS
- **THEN** the platform-native back gesture pops the screen without `@react-navigation/stack` or any legacy `PanGestureHandler` involvement

#### Scenario: Declarative gesture API only

- **WHEN** the rebuilt gesture sources are inspected
- **THEN** every gesture is composed with the declarative `Gesture`/`GestureDetector` API, and no v3 hooks API usage or legacy handler components appear

### Requirement: Drag-reorder Sortable is not nested in a plain ScrollView

The reanimated-dnd `Sortable` powering album drag-reorder MUST NOT be nested inside a plain `ScrollView` (or any other non-dnd scroll container); the reorderable album list SHALL scroll through the Sortable's own scroll container.

#### Scenario: Clean boot with the Sortable mounted

- **WHEN** a development build boots and the Albums page mounts the Sortable
- **THEN** no boot-time red-box warning about nested scroll containers is emitted
- **AND** the album list scrolls and long-press drag activates within the Sortable's own container

