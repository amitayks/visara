## ADDED Requirements

### Requirement: SWM animation stack pinned in verified lockstep

The project SHALL pin `react-native-reanimated@4.5.1` with its mandatory peer `react-native-worklets@0.10.1` (strict 4.5.x↔0.10.x pairing), `react-native-gesture-handler@3.0.2`, `react-native-pager-view@8.0.2`, and `react-native-reanimated-dnd@2.0.0`. Reanimated 3.x MUST NOT remain anywhere in the resolution tree (it does not support RN 0.84+).

#### Scenario: Lockstep pins resolve cleanly

- **WHEN** dependencies install after the upgrade
- **THEN** `npm ls react-native-reanimated react-native-worklets` shows exactly 4.5.1 and 0.10.1 with no peer errors and no 3.x reanimated anywhere

### Requirement: Babel worklets plugin replaces the reanimated plugin in last position

`babel.config.js` SHALL replace `react-native-reanimated/plugin` with `react-native-worklets/plugin`, keeping it as the LAST plugin (after `module-resolver` and the decorator/class plugins), with the 11-alias `module-resolver` block untouched.

#### Scenario: Plugin renamed and ordered

- **WHEN** `babel.config.js` is inspected and Metro starts with a reset cache
- **THEN** `react-native-worklets/plugin` is the final plugins entry, `react-native-reanimated/plugin` appears nowhere, and the bundle builds without worklet-compilation errors

### Requirement: Existing animation surfaces remain functional under reanimated 4

All twelve reanimated-consuming component files SHALL compile unmodified (research-verified: zero removed-API usage) and their runtime behavior SHALL remain functional: drawer open/close (Settings, Upload, Info), photo-viewer pinch/pan/double-tap/dismiss (`Gesture.Simultaneous`), page swipe + edge gestures (`Gesture.Race`), bottom-nav keyboard morph (`useAnimatedKeyboard` — 4.5.1 carries the insets-crash fix), search-overlay Fade entering/exiting, button/progress springs. Spring *feel* MAY differ (v4 physics); functional breakage MAY NOT. Album drag-reorder via reanimated-dnd 2.0.0 (`DropProvider`/`Sortable` in `AlbumList.tsx`) SHALL survive the v2 internal rewrite.

#### Scenario: Gesture-driven surfaces work on device

- **WHEN** the upgraded app runs and each surface is exercised (drawers, photo viewer gestures, Main↔Albums swipe, search-bar morph with keyboard)
- **THEN** each responds without crash, freeze, or dropped gesture recognition

#### Scenario: Album drag-reorder survives dnd v2

- **WHEN** an album is long-pressed and dragged to a new position
- **THEN** the reorder completes and persists exactly as it did under dnd 1.1.0

### Requirement: Gesture-handler 3 adopted without API migration

The upgrade to RNGH 3.0.2 SHALL require zero source changes (the app exclusively uses the retained `Gesture`/`GestureDetector`/`GestureHandlerRootView`/`Gesture.Race`/`Gesture.Simultaneous` API). The new v3 hooks API MUST NOT be mixed into existing gesture configs. `@react-navigation/stack`'s internal legacy `PanGestureHandler` usage (deprecated-but-retained in v3) SHALL continue to power stack swipe-back.

#### Scenario: Stack swipe-back still works

- **WHEN** a stack screen (e.g. photo viewer route) is swiped back on iOS
- **THEN** the gesture completes normally under RNGH 3
