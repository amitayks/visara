> design.md omitted: single mechanical pattern (iOS half of the Android codegen fix), fully specified in the proposal.

## 1. Native conversion

- [x] 1.1 MediaObserver: `.m`→`.mm`, REMAP name `MediaObserver`, spec import + conformance + `getTurboModule:` (NativeMediaObserverSpecJSI).
- [x] 1.2 Thermal: `.m`→`.mm`, REMAP name `ThermalObserver`, spec wiring; Swift `@objc(getThermalState:reject:)`.
- [x] 1.3 Vision: `.m`→`.mm` (name already matches), spec wiring; Swift `@objc(recognizeText:resolve:reject:)`.
- [x] 1.4 pbxproj `.m`→`.mm` references.

## 2. Verification

- [x] 2.1 iOS build green; relaunch on the simulator (onboarding persisted → failing require fires at boot): no getEnforcing invariant, gallery renders — screenshot.
- [x] 2.2 Android regression check (untouched paths): quick boot smoke stays clean.
- [x] 2.3 Green sweep + commit + push + archive.

> Verification (2026-07-04, iPhone 17 sim): full gallery renders with all 8 library photos in date sections, "Processing 8/8", expo-image serving ph:// thumbnails; [boot] breadcrumb trail confirmed the complete pipeline (perms → initialize → initial processing done) before removal; zero getEnforcing invariants; Android regression smoke clean (alive, 0 fatals). Additional fixes folded in during apply: ExpoAppDelegate integration (global.expo missing), ReactCodegen module-map strip in Podfile, pbxproj ObjC++ file types, boot error surfacing.
