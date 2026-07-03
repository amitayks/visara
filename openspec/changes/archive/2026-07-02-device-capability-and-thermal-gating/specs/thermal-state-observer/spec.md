## ADDED Requirements

### Requirement: A ThermalObserver TurboModule exposes a getter and a change event on both platforms

The system SHALL add a native TurboModule named `ThermalObserver`, mirroring the existing `MediaObserver` module structure. Its JS spec (`src/native-modules/NativeThermalObserver.ts`) SHALL declare a `getThermalState()` getter returning a promise of a normalized payload and the `addListener(eventName)` / `removeListeners(count)` methods required for RCTEventEmitter compatibility, and SHALL be resolved with `TurboModuleRegistry.getEnforcing<Spec>("ThermalObserver")`. The module SHALL emit a `thermal_state_change` event carrying the same normalized payload whenever the OS thermal state changes. Both a getter AND an event SHALL be provided on BOTH iOS and Android.

#### Scenario: The getter resolves the current normalized thermal state

- **WHEN** `getThermalState()` is called
- **THEN** it resolves a payload containing the normalized `level` (0..3), its `name`, and the platform `rawLevel`

#### Scenario: A thermal change emits an event

- **WHEN** the OS reports a thermal-state transition and at least one JS listener is registered
- **THEN** a `thermal_state_change` event is emitted with the new normalized payload

### Requirement: Platform thermal ordinals are normalized to a shared 0..3 scale

Both platforms' native thermal values SHALL be mapped onto one normalized scale — `0 nominal`, `1 fair`, `2 serious`, `3 critical` — so JS consumers are platform-agnostic. iOS `ProcessInfo.ThermalState` SHALL map `nominal→0, fair→1, serious→2, critical→3`. Android `PowerManager` thermal status SHALL map `NONE→0, LIGHT→1, MODERATE→2, SEVERE→2, CRITICAL→3, EMERGENCY→3, SHUTDOWN→3`. The payload SHALL also carry the untranslated platform `rawLevel` for diagnostics.

#### Scenario: iOS serious maps to normalized 2

- **WHEN** iOS reports `ProcessInfo.thermalState == .serious`
- **THEN** the payload has `level = 2`, `name = "serious"`, and `rawLevel = 2`

#### Scenario: Android SEVERE maps to normalized 2

- **WHEN** Android reports `THERMAL_STATUS_SEVERE` (raw 3)
- **THEN** the payload has `level = 2`, `name = "serious"`, and `rawLevel = 3`

#### Scenario: Android CRITICAL-and-above collapse to normalized 3

- **WHEN** Android reports `THERMAL_STATUS_CRITICAL`, `THERMAL_STATUS_EMERGENCY`, or `THERMAL_STATUS_SHUTDOWN`
- **THEN** the payload has `level = 3` and `name = "critical"`

### Requirement: iOS reads ProcessInfo.thermalState and its change notification

The iOS module SHALL be an `RCTEventEmitter` subclass registered via `RCT_EXTERN_MODULE(ThermalObserverModule, RCTEventEmitter)` (auto-registered through the Objective-C runtime — NO `AppDelegate` edit), matching the `MediaObserver` iOS pattern. It SHALL read `ProcessInfo.processInfo.thermalState` for the getter and observe `ProcessInfo.thermalStateDidChangeNotification` to emit `thermal_state_change`. Because the app's iOS deployment target is 26.0, these APIs (available since iOS 11) SHALL be used without an `@available` guard.

#### Scenario: iOS module auto-registers without an AppDelegate change

- **WHEN** the iOS app boots with the `RCT_EXTERN_MODULE` declaration present
- **THEN** `TurboModuleRegistry.getEnforcing("ThermalObserver")` resolves the module and no `AppDelegate.swift` registration line is required

#### Scenario: iOS emits on the thermal notification

- **WHEN** iOS posts `thermalStateDidChangeNotification`
- **THEN** the module reads the new `ProcessInfo.thermalState`, normalizes it, and emits `thermal_state_change`

### Requirement: Android reads PowerManager thermal status and is manually registered

The Android module SHALL read `PowerManager.getCurrentThermalStatus()` for the getter and register a `PowerManager.OnThermalStatusChangedListener` (via `addThermalStatusListener`) to emit `thermal_state_change`, mirroring the `MediaObserver` Java module. Its `ThermalObserverPackage` (a `TurboReactPackage`) SHALL be manually added in `MainApplication.kt` alongside `MediaObserverPackage()` (this module is not autolinked). Because minSdk is 36, these APIs (available since API 29) SHALL be used without a `Build.VERSION` guard. The listener SHALL be unregistered when the module is invalidated.

#### Scenario: Android module is registered in MainApplication

- **WHEN** `MainApplication.getPackages()` is inspected
- **THEN** it adds `ThermalObserverPackage()` in addition to `MediaObserverPackage()`, and `getThermalState()` resolves from JS

#### Scenario: Android emits on a thermal-status change

- **WHEN** the registered `OnThermalStatusChangedListener` fires
- **THEN** the module maps `getCurrentThermalStatus()` to the normalized payload and emits `thermal_state_change`

#### Scenario: The thermal listener is released on teardown

- **WHEN** the module is invalidated
- **THEN** the `OnThermalStatusChangedListener` is removed via `removeThermalStatusListener`

### Requirement: ThermalService wraps the module, caches the level, and fails open

The system SHALL provide an all-static `ThermalService` that wraps `ThermalObserver` via a `NativeEventEmitter`. `initialize()` SHALL prime the cache with one `getThermalState()` read and subscribe to `thermal_state_change`, keeping the latest normalized level so gating callers read it synchronously without a per-call native round-trip. It SHALL expose `getCachedLevel()`, threshold helpers `isThrottledForDrain()` and `isThrottledForTier1()` (named threshold constants, Tier-1 stricter than drain), and `subscribe(listener)`. If the native module is unavailable or a read throws, the service SHALL treat the level as `nominal` (fail open) so gating never wedges the pipeline.

#### Scenario: Cached level is served without a native round-trip

- **WHEN** `initialize()` has primed the cache and a `thermal_state_change` event later updates it
- **THEN** `getCachedLevel()` returns the last observed level synchronously, without calling `getThermalState()` again

#### Scenario: Drain and Tier-1 thresholds differ

- **WHEN** the cached level equals the drain threshold but is below where Tier-1 is allowed, per the configured constants
- **THEN** `isThrottledForDrain()` and `isThrottledForTier1()` reflect their independent thresholds (Tier-1 stricter/earlier than the drain)

#### Scenario: Missing native module fails open to nominal

- **WHEN** the `ThermalObserver` native module cannot be resolved (e.g. a JS-only build) or a read throws
- **THEN** `ThermalService` reports `nominal`, `isThrottledForDrain()`/`isThrottledForTier1()` return `false`, and no error propagates to callers
