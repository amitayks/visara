## Context

Visara's processing pipeline drains a durable SQLite queue through `BackgroundTaskService.start` one item per tick, evaluating gating between items. Foundation #3 left the gating authority as a single seam — `BackgroundTaskService.shouldPauseProcessing` (`src/services/background/BackgroundTaskService.ts:309`, called at `:126`/`:143`) — which today checks exactly two axes: **battery-saver** (`shouldAllowProcessing` in `src/utils/device/battery.ts`, pause unless charging) and a **night window** (pause outside 00:00–06:00, `:324-331`). Settings flow in via `updateSettings` (`:413`) kept in sync from `OrchestratorBridge.tsx:130-135`. The drain currently pulls only Tier-0 (`TIER0_TASK_TYPE = "tier0_mlkit"`, `OrchestratorService.ts:22`); the service already documents that "Tier-1 (Gemma) enqueues a different value later" (`:21`).

Foundation #4 adds that Tier-1: an on-device **Gemma-4 E2B multimodal** pass via `react-native-executorch`, a ~3.2 GB (iOS MLX/Metal) / ~4.4 GB (Android Vulkan) model doing sustained GPU inference, arm64-v8a-only on Android. Two device facts must gate it that battery+night do not:

1. **Eligibility** — a low-RAM / low-disk / non-arm64 device cannot run an E2B-class model without OOM/jetsam/thrash. It must **silently** stay Tier-0-only.
2. **Thermal pressure** — sustained inference heats the SoC; the OS then throttles the GPU or kills the process. A capable device must **back off while hot**, and this protection is useful for **any** heavy pass, Tier-0 included.

`react-native-device-info@^14.1.1` is already a dependency (`package.json:40`, used in `battery.ts`) and exposes RAM/disk/ABI — enough for a coarse **capability** gate with zero new native work. It exposes **no** thermal API, so the **thermal** gate needs a small native module. The proven in-repo template is the `MediaObserver` TurboModule: JS spec `src/native-modules/NativeMediaObserver.ts`, Android `android/app/src/main/java/com/visara/mediaobserver/{MediaObserverModule,MediaObserverPackage}.java`, iOS `ios/Visara/MediaObserver/{MediaObserverModule.swift,MediaObserverModule.m}`, consumed in JS via `NativeEventEmitter` (`MediaDiscoveryService.ts:38-95`). #4 also raised the OS floors — Android **minSdk 36** (`android/build.gradle:4`), iOS **26.0** (`ios/Podfile:9`) — which, as shown below, removes all thermal-API availability guards.

**Constraints:** Biome (tabs, double quotes, `noExplicitAny: error`), strict TS, all-static services, legacy decorators. No Gemma, no Tier-1 drain, no `content://` decoding is wired here — this change ships only the gate infrastructure Tier-1 will consult. New native code requires a device/emulator build a human runs; JS-only CI cannot link it.

## Goals / Non-Goals

**Goals:**
- A JS-only **capability gate** (`DeviceCapabilityService`, all-static) over `react-native-device-info` computing a coarse Tier-1 eligibility verdict (RAM/disk/ABI/low-RAM), cached for the static signals and live for free disk, exposing `canRunTier1()`.
- A **thermal gate**: a new `ThermalObserver` TurboModule (iOS `ProcessInfo.thermalState` + notification; Android `PowerManager.getCurrentThermalStatus()` + listener) with a **getter + change event** on both platforms, normalized to a shared 0..3 scale, wrapped by an all-static `ThermalService` (event-cached, fail-open, threshold helpers).
- Extend the seam #3 left: `shouldPauseProcessing` gains **thermal pressure** as a third pause axis (always-on, cached read), protecting any heavy pass incl. Tier-0.
- Expose `canRunTier1()` (capability AND thermal) as the single check the OrchestratorService / Tier-1 selection will consult when #4+ adds a `tier1_gemma` drain.

**Non-Goals:**
- Implementing Gemma, an `ExecutorchService`, or a Tier-1 drain / `tier1_gemma` enqueue — that is #4+. This change wires **no** consumer of `canRunTier1()` into an active drain.
- Any Tier-0 behavior change, DB/schema change, or new dependency.
- A precise SoC/GPU capability database or `getThermalHeadroom()` numeric budgeting — coarse RAM is the reliable proxy; headroom is an Open Question.
- A user-facing thermal toggle or thermal UI — thermal protection is always-on safety.

## Decisions

### D1: Two orthogonal gates — a static CAPABILITY gate and a dynamic THERMAL gate — layered onto battery+night, not a rewrite

Model the problem as two independent questions: **"may Tier-1 ever run on this hardware?"** (capability — static, device-lifetime) and **"may a heavy pass run right now?"** (thermal — dynamic, second-to-second). They compose but are computed and consumed separately: capability decides *tier admission*; thermal decides *pause/resume* and also feeds Tier-1 admission. Neither replaces the existing battery-saver/night logic — both are **added axes**, so `shouldPauseProcessing` stays the single gating authority and the change is additive.

**Alternatives:** one merged "should-I-process" predicate mixing RAM/disk/thermal/battery — rejected; conflates a device-lifetime verdict with a moment-to-moment one and would force a native round-trip into the RAM check. A full capability *scoring* system — rejected as over-engineering for a coarse GO/NO-GO.

### D2: Capability policy — coarse RAM/ABI/low-RAM floors (cached) + a LIVE free-disk check; fail closed

`DeviceCapabilityService.isDeviceClassEligible()` requires: `getTotalMemory() ≥ TIER1_MIN_TOTAL_MEMORY_BYTES` (default **6 GiB** — E2B is ~3.2–4.4 GB resident, 6 GiB leaves OS+app headroom), `isLowRamDevice() === false`, and on Android `supportedAbis()` includes `arm64-v8a` (the RNE runtime ships arm64-v8a only). Free disk is **not** part of this static verdict — `hasDiskHeadroomForTier1()` reads `getFreeDiskStorage()` **live** (default floor **6 GiB**) because storage fills and empties. `isTier1Eligible() = isDeviceClassEligible() && hasDiskHeadroomForTier1()`. All floors are named constants.

`getDeviceId()`/`getModel()` are captured for diagnostics and as a coarse SoC hint, but RAM is the primary proxy: `react-native-device-info` has no reliable SoC/GPU-class API, and maintaining a per-chip allow/deny list is out of scope (Open Question). **Fail closed:** any thrown error or unknown-value path yields *ineligible*, never a guess — running a 4 GB model on a misread device is the dangerous direction.

**Alternatives:** 8 GiB floor — stricter, fewer eligible devices; kept as a tunable (constant) with 6 GiB the default. An SoC allow-list as the primary gate — rejected (no dependable API, high maintenance); RAM+low-RAM is the robust coarse proxy.

### D3: Thermal native surface — a `ThermalObserver` TurboModule mirroring `MediaObserver`, getter + event on both platforms

Add a first-party TurboModule (no new dependency). The JS spec `src/native-modules/NativeThermalObserver.ts` mirrors `NativeMediaObserver.ts`:

```ts
import { TurboModule, TurboModuleRegistry } from "react-native";

export interface ThermalStatePayload {
	level: number;    // normalized 0..3
	name: string;     // "nominal" | "fair" | "serious" | "critical"
	rawLevel: number; // platform ordinal (iOS 0..3, Android 0..6)
}

export interface Spec extends TurboModule {
	getThermalState(): Promise<ThermalStatePayload>;
	addListener(eventName: string): void;
	removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("ThermalObserver");
```

Event name **`thermal_state_change`**, body = `ThermalStatePayload`. This is the minimal surface the brief asks for — **a getter + an event** — on **both** platforms. Codegen constraints are satisfied (payload is numbers/strings only). The event carries the same normalized payload the getter returns so JS has one shape.

- **iOS** (`ios/Visara/Thermal/ThermalObserverModule.swift` + `.m`): an `RCTEventEmitter` subclass, exactly like `MediaObserverModule.swift`. `moduleName()` returns `"ThermalObserver"`; `supportedEvents()` returns `["thermal_state_change"]`; the getter is `@objc func getThermalState(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock)` reading `ProcessInfo.processInfo.thermalState`; init observes `ProcessInfo.thermalStateDidChangeNotification` via `NotificationCenter` and `sendEvent(withName:body:)` (guarded by `hasListeners`, mirroring the template). The `.m` uses `RCT_EXTERN_MODULE(ThermalObserverModule, RCTEventEmitter)` + `RCT_EXTERN_METHOD(getThermalState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)` — it **auto-registers through the ObjC runtime, no `AppDelegate.swift` edit** (the same mechanism that makes `MediaObserver` resolve today). Naming mirrors `MediaObserver` precisely so the class-name/`moduleName()` registration behaves identically.
- **Android** (`android/app/src/main/java/com/visara/thermal/ThermalObserverModule.java` + `ThermalObserverPackage.java`): a `ReactContextBaseJavaModule implements TurboModule`, `NAME = "ThermalObserver"`, exactly like `MediaObserverModule.java`. The getter is `@ReactMethod public void getThermalState(Promise promise)` reading `PowerManager.getCurrentThermalStatus()`; the constructor registers a `PowerManager.OnThermalStatusChangedListener` via `addThermalStatusListener(...)` that emits `thermal_state_change` (guarded by `listenerCount`, mirroring the template's `sendEvent`); `invalidate()` calls `removeThermalStatusListener`. `ThermalObserverPackage` is a `TurboReactPackage` cloned from `MediaObserverPackage`, and is **manually registered** in `MainApplication.kt` — `add(ThermalObserverPackage())` next to the existing `add(MediaObserverPackage())` at `:22` (this module is not autolinked). This iOS-auto / Android-manual asymmetry is inherited from the template, not new.

**Alternatives:** a third-party thermal library — rejected; adds a dependency for a ~1-getter+1-event surface we can mirror from an in-repo, proven module. Polling `getThermalState()` on a timer instead of an event — rejected; the OS notification is push-based, cheaper, and race-free.

### D4: Normalize both platforms onto a shared 0..3 scale with an explicit mapping table

iOS `ProcessInfo.ThermalState` has 4 cases; Android `PowerManager` thermal status has 7. Normalize to **0 `nominal`, 1 `fair`, 2 `serious`, 3 `critical`** so JS gating is platform-agnostic; keep the platform ordinal as `rawLevel` for diagnostics.

| Normalized | Name | iOS `ThermalState` (raw) | Android `PowerManager` status (raw) |
|---|---|---|---|
| 0 | nominal | `.nominal` (0) | `THERMAL_STATUS_NONE` (0) |
| 1 | fair | `.fair` (1) | `THERMAL_STATUS_LIGHT` (1) |
| 2 | serious | `.serious` (2) | `THERMAL_STATUS_MODERATE` (2), `THERMAL_STATUS_SEVERE` (3) |
| 3 | critical | `.critical` (3) | `THERMAL_STATUS_CRITICAL` (4), `THERMAL_STATUS_EMERGENCY` (5), `THERMAL_STATUS_SHUTDOWN` (6) |

Android's extra severe/emergency/shutdown steps collapse into `serious`/`critical` because our gate only needs "throttle now" vs "stop now" resolution, and both platforms agree at the top and bottom of the scale.

**Alternatives:** expose raw platform values to JS and branch per-platform in the service — rejected; leaks platform detail into every gating call site. A finer 0..6 scale — rejected; iOS cannot populate the middle, so it buys nothing for the gate.

### D5: Two thresholds — the drain pauses at `serious`, Tier-1 backs off earlier at `fair`

`ThermalService` owns two named constants: `DRAIN_PAUSE_LEVEL = serious (2)` and `TIER1_PAUSE_LEVEL = fair (1)`.
- `isThrottledForDrain()` (`level ≥ DRAIN_PAUSE_LEVEL`) feeds `shouldPauseProcessing` — it pauses **whatever** drain is running (Tier-0 today) once the device is genuinely throttling.
- `isThrottledForTier1()` (`level ≥ TIER1_PAUSE_LEVEL`) feeds `canRunTier1()` — **stricter/earlier**, because Tier-1 is both the heaviest consumer *and* a primary heat **source**: it must yield before the light Tier-0 pass does, so a merely-warm (`fair`) device is not pushed into `serious` by starting Gemma.

Both are tunable constants; the exact defaults are an Open Question to confirm on real hardware.

**Alternatives:** one shared threshold — rejected; it would either let Gemma run too hot or pause light Tier-0 too eagerly. Hysteresis (separate pause/resume levels) — deferred; the OS thermal notification already debounces, and the cached-level design makes adding hysteresis later trivial.

### D6: Integration — thermal is an always-on third axis in `shouldPauseProcessing`, read from cache, fail-open

Insert, after the night check in `shouldPauseProcessing` (`BackgroundTaskService.ts:324-331`), `if (ThermalService.isThrottledForDrain()) return true;`. It is **always-on** (not a `updateSettings` toggle) because it is device-safety, not a preference. It reads `ThermalService.getCachedLevel()` **synchronously** — no per-tick native round-trip — because `ThermalService.initialize()` primed the cache with one `getThermalState()` and now updates it from the `thermal_state_change` stream. `ThermalService.initialize()` is awaited inside `BackgroundTaskService.initialize()` (`:74`). **Fail open:** if the module is absent (JS-only build) or a read throws, the cached level stays `nominal`, so thermal never pauses — matching the fail-open philosophy of `battery.ts` and guaranteeing a broken thermal source cannot permanently wedge the pipeline.

**Alternatives:** an async native read each tick — rejected; needless bridge traffic on every item and it makes `shouldPauseProcessing` slower. Fail-closed (pause when thermal unknown) — rejected; a flaky OEM thermal HAL would then freeze all processing. The residual "device overheats while the module is silently broken" risk is accepted and listed below.

### D7: `canRunTier1()` composition, fail-closed — the single check Tier-1 selection consults (but no Tier-1 drain is wired here)

`DeviceCapabilityService.canRunTier1()` resolves `true` **iff** `isDeviceClassEligible()` AND `hasDiskHeadroomForTier1()` AND `!ThermalService.isThrottledForTier1()`. Note the deliberate **failure asymmetry** vs D6: the thermal *pause* fails open (don't wedge the pipeline), but Tier-1 *admission* fails **closed** (unknown ⇒ off) — never OOM a weak device on a guess. This is the one method the future `OrchestratorService` Tier-1 selection / `tier1_gemma` drain (change #4+) will call before starting a heavy pass; the `OrchestratorService.ts:21` "different value later" note marks where. This change **exposes** the method and specifies its decisions but wires **no** active consumer — there is no Gemma and no `tier1_gemma` enqueue here, so no dead code is added to the Tier-0 drain.

**Alternatives:** putting the composition inside `OrchestratorService` now — rejected; there is no Tier-1 drain to guard yet, so it would be untested dead code. Splitting thermal-for-Tier-1 into its own service — rejected; `canRunTier1()` is the natural single seam and keeps the thermal threshold logic in `ThermalService`.

### D8: Availability — minSdk 36 and iOS 26.0 remove every thermal-API version guard

`PowerManager.getCurrentThermalStatus()`, `addThermalStatusListener()`, and `OnThermalStatusChangedListener` are **API 29+ (Android 10)**; #4's **minSdk 36** means they are **unconditionally available** — no `Build.VERSION.SDK_INT` guard. `ProcessInfo.thermalState` and `thermalStateDidChangeNotification` are **iOS 11.0+**; #4's **deployment target 26.0** means they are **unconditionally available** — no `@available`/`if #available` guard. (Android's optional `getThermalHeadroom(int)` is API 30+ and OEM-flaky; omitted — see Open Questions.) This is a direct dividend of the newest-only floors: the native modules are simpler than they would have been on the old minSdk 24 / iOS 15.5 floors, which would have required runtime guards and a graceful-degradation path.

**Alternatives:** guarding anyway "for safety" — rejected as dead branches that can never execute given the enforced floors; the module still fails open at the JS layer (D6) for the JS-only-build case.

## Risks / Trade-offs

- **OEM thermal HAL not implemented (Android) → status is always `NONE`.** Some devices never report throttling. → The gate degrades to a thermal no-op (fail-open); battery+night still protect the device. Documented, not fixable from JS.
- **Fail-open thermal means a silently-broken module won't pause a genuinely hot device (D6).** → Accepted for availability (a wedged pipeline is worse); mitigated because the module mirrors a proven template and `initialize()`'s priming read surfaces a hard failure early. Revisit if field data shows silent breakage.
- **Simulator/emulator always report `nominal`.** The hot path cannot be exercised in JS-only CI or on a simulator. → The `thermal_state_change` mapping and threshold logic are unit-testable in JS with injected payloads; the true device path is a human device/emulator build task (see Migration Plan / tasks).
- **Coarse RAM cutoff false-negatives a capable device.** A 5.9 GiB device (or one under-reporting RAM) is flagged ineligible. → It simply runs Tier-0 (safe default); the floor is a tunable constant and an Open Question for on-device tuning.
- **`getFreeDiskStorage()` semantics vary (Android scoped storage / transient values).** → Checked live at admission with generous slack; a spurious low reading only *defers* Tier-1, never corrupts anything.
- **New native module ⇒ device/emulator build required.** JS-only `tsc`/Biome cannot link Java/Swift. → Tasks split JS (agent-verifiable) from native (human device/emulator build); the JS wrapper fails open so the app still builds and runs without the native side linked.
- **iOS notification delivery thread.** `thermalStateDidChangeNotification` may post off the main thread; `sendEvent` must be marshaled safely as in the `MediaObserver` template. → Mirror the template's emitter guarding.
- **`getEnforcing("ThermalObserver")` throws if the native module is absent.** → `ThermalService` wraps resolution in try/catch and flips to the fail-open path (matching `MediaDiscoveryService`'s `static {}` guard at `MediaDiscoveryService.ts:43-59`).

## Migration Plan

Ordered; JS first (agent-verifiable against the typecheck baseline), then each native side in isolation, then integration. Matches `tasks.md`.

1. **JS gate (agent-run):** add `NativeThermalObserver.ts` spec; `ThermalService.ts` (fail-open wrapper, cache, thresholds); `DeviceCapabilityService.ts` (policy, cache, `canRunTier1()`); the `DEVICE_CAPABILITY_SNAPSHOT` storage key. `tsc`/Biome clean; `ThermalService` fails open so the app builds with no native side yet.
2. **Native iOS (human build):** `ThermalObserverModule.swift` + `.m` under `ios/Visara/Thermal/`; `pod install` if needed; build/run on an iOS 26 simulator/device; confirm `getThermalState()` resolves and (on a real device) `thermal_state_change` fires under load.
3. **Native Android (human build):** `ThermalObserverModule.java` + `ThermalObserverPackage.java` under `com/visara/thermal/`; register `add(ThermalObserverPackage())` in `MainApplication.kt`; `assembleDebug`; confirm the getter resolves and the listener emits.
4. **Integration (agent-run JS, human-verified on device):** wire the thermal axis into `shouldPauseProcessing` and prime `ThermalService.initialize()` from `BackgroundTaskService.initialize()`; leave `canRunTier1()` exposed but unconsumed. `tsc`/Biome clean.

**Rollback:** trivial and additive. Deleting the two native module dirs + the `MainApplication.kt` line, the three JS files + the storage key, and reverting the two `BackgroundTaskService` edits fully restores the prior app. No schema, no data, no dependency change. `ThermalService`'s fail-open path means even a *partial* rollback (JS present, native removed) leaves a working app on Tier-0.

## Open Questions

- **Thresholds:** are `TIER1_MIN_TOTAL_MEMORY_BYTES = 6 GiB`, disk headroom `6 GiB`, `DRAIN_PAUSE_LEVEL = serious`, and `TIER1_PAUSE_LEVEL = fair` the right defaults, or should they be tuned on the #4 target devices (M-class iPad Pro, Android flagship 12 GB+)?
- **SoC/GPU class:** is coarse RAM a sufficient proxy for the eligibility gate, or do we need a per-chip allow/deny list (and where would it be sourced/maintained)?
- **`getThermalHeadroom()` (Android API 30+):** worth exposing a numeric headroom signal for finer Tier-1 admission, given its known OEM flakiness?
- **User visibility:** should a "paused — device is hot" state surface in the processing UI (like the existing paused notification), or stay silent?
- **Consumption timing:** does #4 wire `canRunTier1()` into a `tier1_gemma` `maybeStartDrain` guard, and should Tier-1 additionally require *charging* (battery-saver already gates the drain, but Tier-1's heat/energy cost may warrant a charging precondition of its own)?
