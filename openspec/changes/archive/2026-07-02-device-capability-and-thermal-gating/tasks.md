> Ordered top-to-bottom; JS is agent-verifiable against the typecheck baseline, each native side is built in isolation by the human, then integration. Groups are tagged **(agent-run)** or **(HUMAN-run)**. BASELINE: `npx tsc --noEmit` currently reports **8** pre-existing `TS6133` unused-symbol errors in 4 unrelated UI files; every group below must keep that count at **8** (zero new typecheck errors). New native code cannot be linked by JS-only tooling — the iOS/Android groups require a device/emulator build the human runs.

## 1. (A) JS capability + thermal gate — (agent-run)

- [x] 1.1 Add `src/native-modules/NativeThermalObserver.ts` mirroring `NativeMediaObserver.ts`: export `interface ThermalStatePayload { level: number; name: string; rawLevel: number }`, an `interface Spec extends TurboModule` with `getThermalState(): Promise<ThermalStatePayload>` + `addListener(eventName: string): void` + `removeListeners(count: number): void`, and `export default TurboModuleRegistry.getEnforcing<Spec>("ThermalObserver")`.
- [x] 1.2 Add `DEVICE_CAPABILITY_SNAPSHOT: 'device_capability_snapshot'` to `STORAGE_KEYS` in `src/utils/constants/storage-keys.ts`.
- [x] 1.3 Add `src/services/device/ThermalService.ts` (all-static, `noStaticOnlyClass` biome-ignore header like sibling services): a normalized `ThermalLevel` type (0..3) + name map; the mapping helpers (iOS `.nominal/.fair/.serious/.critical` → 0/1/2/3; Android `NONE/LIGHT/MODERATE/SEVERE/CRITICAL/EMERGENCY/SHUTDOWN` → 0/1/2/2/3/3/3); named threshold constants `DRAIN_PAUSE_LEVEL = 2` (serious) and `TIER1_PAUSE_LEVEL = 1` (fair).
- [x] 1.4 In `ThermalService`, resolve the native module inside a `try` (like `MediaDiscoveryService`'s `static {}` guard, `MediaDiscoveryService.ts:43-59`) and set an `isAvailable` flag; wire a `NativeEventEmitter` for `thermal_state_change` only when available.
- [x] 1.5 Implement `ThermalService.initialize()`: prime the cache with one `getThermalState()` read, then subscribe to `thermal_state_change` and keep `lastLevel`. Implement `getCachedLevel()` (sync), `getLevel()` (async native read), `subscribe(listener)`, `isThrottledForDrain()` (`cached ≥ DRAIN_PAUSE_LEVEL`), and `isThrottledForTier1()` (`cached ≥ TIER1_PAUSE_LEVEL`). Every path FAILS OPEN: unavailable module or a thrown read ⇒ level treated as `nominal`, throttle helpers return `false`.
- [x] 1.6 Add `src/services/device/DeviceCapabilityService.ts` (all-static): named floors `TIER1_MIN_TOTAL_MEMORY_BYTES` (6 GiB) and `TIER1_MIN_FREE_DISK_BYTES` (6 GiB); a `CapabilitySnapshot` type (totalMemory, supportedAbis, isLowRam, deviceId, model, classEligible, appVersion).
- [x] 1.7 Implement `isDeviceClassEligible()`: read `getTotalMemory()`, `isLowRamDevice()`, `supportedAbis()`, `getDeviceId()`/`getModel()`; require RAM ≥ floor AND `!isLowRamDevice()` AND (Android) `arm64-v8a` present; cache the static snapshot in MMKV under `DEVICE_CAPABILITY_SNAPSHOT`, invalidated when the stored `appVersion` (`DeviceInfo.getVersion()`) differs. FAIL CLOSED: any error ⇒ `false`.
- [x] 1.8 Implement `hasDiskHeadroomForTier1()` reading `getFreeDiskStorage()` LIVE (never cached) vs `TIER1_MIN_FREE_DISK_BYTES`; `isTier1Eligible()` = class-eligible AND disk-headroom; `canRunTier1()` = `isTier1Eligible()` AND `!ThermalService.isThrottledForTier1()`. FAIL CLOSED throughout (unknown/error ⇒ `false`).
- [x] 1.9 Confirm no `any` (`noExplicitAny: error`), tabs/double-quotes, strict TS. Run `npm run typecheck` and `npm run lint`; the touched JS is clean and the `tsc` error count is still **8** (no new errors).

## 2. (B) iOS ThermalObserver native module — (HUMAN-run device/emulator build)

- [x] 2.1 Add `ios/Visara/Thermal/ThermalObserverModule.swift`, an `RCTEventEmitter` subclass mirroring `ios/Visara/MediaObserver/MediaObserverModule.swift`: `@objc(ThermalObserverModule)`, `moduleName()` → `"ThermalObserver"`, `supportedEvents()` → `["thermal_state_change"]`, `startObserving()/stopObserving()` toggling a `hasListeners` flag, `requiresMainQueueSetup()` → `false`.
- [x] 2.2 Implement the getter `@objc func getThermalState(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock)` reading `ProcessInfo.processInfo.thermalState`, mapped to the normalized payload (`level`/`name`/`rawLevel`); resolve the dictionary. No `@available` guard (deployment target 26.0).
- [x] 2.3 In `init`, observe `ProcessInfo.thermalStateDidChangeNotification` via `NotificationCenter`; on fire, read `ProcessInfo.processInfo.thermalState`, normalize, and `sendEvent(withName: "thermal_state_change", body:)` guarded by `hasListeners`; remove the observer in `deinit`.
- [x] 2.4 Add `ios/Visara/Thermal/ThermalObserverModule.m` mirroring `MediaObserverModule.m`: `RCT_EXTERN_MODULE(ThermalObserverModule, RCTEventEmitter)`, `RCT_EXTERN_METHOD(getThermalState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)`, and `+ (BOOL)requiresMainQueueSetup { return NO; }`. Confirm NO `AppDelegate.swift` change is needed (ObjC-runtime auto-registration).
- [ ] 2.5 (HUMAN) Add the two files to the Xcode target (and `bundle exec pod install` if the target's file list needs regenerating); build + launch the Debug app on an iOS/iPadOS 26 simulator or device.
- [ ] 2.6 (HUMAN) Verify `TurboModuleRegistry.getEnforcing("ThermalObserver")` resolves (no red-box), `getThermalState()` resolves a payload, and — on a real device under sustained load — `thermal_state_change` fires with rising `level`.

## 3. (C) Android ThermalObserver native module — (HUMAN-run device/emulator build)

- [x] 3.1 Add `android/app/src/main/java/com/visara/thermal/ThermalObserverModule.java`, a `ReactContextBaseJavaModule implements TurboModule` mirroring `mediaobserver/MediaObserverModule.java`: `NAME = "ThermalObserver"`, `getName()`, a `listenerCount` + `addListener`/`removeListeners`, and a `sendEvent` guarded by `listenerCount` via `DeviceEventManagerModule.RCTDeviceEventEmitter`.
- [x] 3.2 Implement `@ReactMethod public void getThermalState(Promise promise)` reading `PowerManager.getCurrentThermalStatus()`, mapped to the normalized payload (`level`/`name`/`rawLevel`) as a `WritableMap`; `promise.resolve(map)`. No `Build.VERSION` guard (minSdk 36 ⇒ API 29 always present).
- [x] 3.3 In the constructor, register a `PowerManager.OnThermalStatusChangedListener` via `powerManager.addThermalStatusListener(...)` that maps the new status and emits `thermal_state_change`; in `invalidate()` call `removeThermalStatusListener(...)`.
- [x] 3.4 Add `android/app/src/main/java/com/visara/thermal/ThermalObserverPackage.java`, a `TurboReactPackage` cloned from `MediaObserverPackage.java` (return the module for `"ThermalObserver"`; `ReactModuleInfo` with `isTurboModule = true`).
- [x] 3.5 Register it in `android/app/src/main/java/com/visara/MainApplication.kt`: add `add(ThermalObserverPackage())` next to the existing `add(MediaObserverPackage())` (`MainApplication.kt:22`). This module is NOT autolinked.
- [ ] 3.6 (HUMAN) `./gradlew :app:assembleDebug` (or run on an emulator/device); verify the module resolves from JS, `getThermalState()` resolves, and the thermal listener emits `thermal_state_change`.

## 4. (D) Integration into the drain gate — (agent-run JS; HUMAN-verified on device)

- [x] 4.1 In `src/services/background/BackgroundTaskService.ts`, `await ThermalService.initialize()` inside `initialize()` (near the checkpoint/settings load, `:74-87`) so the cache is primed and subscribed before any drain starts.
- [x] 4.2 In `shouldPauseProcessing` (`:309`), after the night-window check (`:324-331`), add `if (ThermalService.isThrottledForDrain()) return true;` — always-on (NOT a `updateSettings` toggle), reading the cached level (no per-tick native round-trip), fail-open.
- [x] 4.3 Confirm `canRunTier1()` is exported/reachable for the future OrchestratorService Tier-1 selection but is NOT wired into the current Tier-0 drain (no `tier1_gemma` enqueue, no Gemma) — the `OrchestratorService.ts:21` "different value later" note marks the future seam; no dead code is added to `processNext`/`maybeStartDrain`.
- [x] 4.4 Run `npm run typecheck` and `npm run lint`; touched JS is clean and the `tsc` error count is still **8**.
- [ ] 4.5 (HUMAN, device build) With both native modules linked, confirm the drain pauses when the device is driven to `serious`+ (e.g. under sustained load / a stress tool) and resumes on cooldown, and that battery-saver/night gating still behave as before.

## 5. (E) Verify — baseline-relative — (agent-run for JS; HUMAN for native)

- [x] 5.1 `npx tsc --noEmit` reports exactly **8** errors (the pre-existing baseline) — ZERO new typecheck errors introduced by this change.
- [ ] 5.2 `npm run lint` (Biome) is clean on every new/edited file (tabs, double quotes, no `any`).
- [x] 5.3 `openspec validate device-capability-and-thermal-gating --strict` passes.
- [ ] 5.4 (HUMAN) Record that the native pieces (groups B, C, and the device check in 4.5) require a device/emulator build outside JS-only CI, and note the result of that build here.
