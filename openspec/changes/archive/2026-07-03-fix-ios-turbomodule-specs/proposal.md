## Why

Post-onboarding on the iOS simulator throws `TurboModuleRegistry.getEnforcing(...): 'MediaObserver' could not be found` (user-reported, reproduced). The Android half of the TurboModule codegen fix shipped in `upgrade-rn-086-platform`; the iOS modules stayed legacy `RCT_EXTERN_MODULE` bridges, which bridgeless RN 0.86 does not serve to `getEnforcing`. Two are additionally exported under the wrong JS names (`MediaObserverModule`/`ThermalObserverModule` vs the specs' `MediaObserver`/`ThermalObserver`), and both promise methods use selectors (`rejecter:`, `resolver:`) that mismatch the codegen-generated spec selectors (`reject:`, `resolve:`) — so this path could never have worked on iOS. The earlier iOS gate (boot-to-Welcome) did not exercise the post-onboarding require; this closes that gap.

## What Changes

- Convert the three iOS bridge files to ObjC++ (`.m` → `.mm`) and make each module a spec-conforming TurboModule: import `<VisaraSpecs/VisaraSpecs.h>`, implement `getTurboModule:` returning the generated `Native*SpecJSI`, and declare conformance to the generated protocol.
- Export under the spec JS names via `RCT_EXTERN_REMAP_MODULE`: `MediaObserver` (was MediaObserverModule), `ThermalObserver` (was ThermalObserverModule); `VisionTextRecognizerModule` already matches.
- Align promise selectors with codegen: Thermal Swift gains `@objc(getThermalState:reject:)`; Vision Swift's `@objc(recognizeText:resolver:rejecter:)` becomes `@objc(recognizeText:resolve:reject:)`; the extern-method declarations follow.
- pbxproj references updated `.m` → `.mm`.

- **DISCOVERED DURING APPLY — ExpoAppDelegate integration was missing on iOS**: once the TurboModule fix let the app reach the gallery, expo-image crashed at import ("Cannot read property 'EventEmitter' of undefined") because `global.expo` was never installed — the platform change's minimal iOS expo integration wired pods only. Fixed per the SDK 57 bare template: `AppDelegate` now extends `ExpoAppDelegate` with `ExpoReactNativeFactory`/`ExpoReactNativeFactoryDelegate` (keeping module name "Visara" and the `index` Metro root), `internal import Expo` to match the generated provider's access-level import. Also hardened `OrchestratorBridge.boot` with a catch (failures previously rejected silently).
- **Podfile patch**: the expo integration injects `-fmodule-map-file` for ReactCodegen into app-target C flags, forcing a doomed module build of the C++ spec headers; the post_install now strips that flag (Xcode compiles them textually in our ObjC++ files). pbxproj file types corrected to `sourcecode.cpp.objcpp`.

## Capabilities

### New Capabilities
- `ios-turbomodule-conformance`: the three custom iOS native modules resolve through `TurboModuleRegistry.getEnforcing` under bridgeless RN 0.86 with spec-matching names and selectors.

### Modified Capabilities
<!-- None. -->

## Impact

- `ios/Visara/{MediaObserver,Thermal,VisionOCR}/*.{m→mm,swift}`, `project.pbxproj`. No JS/Android changes. Verified by relaunching on the simulator where onboarding is already complete (the failing require now fires at boot).
