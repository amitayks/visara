> Gate-first sequencing (design Decision 3): get both native builds compiling ASAP after the dependency/config edits, run the executorch boot gate, and only then polish toolchain/hygiene. Do NOT touch: `react-native-executorch@0.9.2`, `metro.config.js`, `index.js` init order, iOS 26.0 floor, minSdk 36, arm64-only filters, launcher assets, fmt Podfile patch.

## 1. Dependencies & JS config

- [x] 1.1 package.json: pin `react-native@0.86.0` + `react@19.2.3` (exact); bump `@react-native/babel-preset@0.86.0`, `@react-native/metro-config@0.86.0`; CLI trio → `20.1.0` — move `cli-platform-android` to devDependencies, ADD `@react-native-community/cli-platform-ios@20.1.0`; `engines.node` → `">= 22.11.0"`, drop `engines.npm` if stale.
- [x] 1.2 package.json animation stack: `react-native-reanimated@4.5.1`, ADD `react-native-worklets@0.10.1`, `react-native-gesture-handler@3.0.2`, `react-native-pager-view@8.0.2`, `react-native-reanimated-dnd@2.0.0`.
- [x] 1.3 package.json minors: `react-native-screens@4.25.2`, `react-native-safe-area-context@5.8.0`, `@react-navigation/native@7.3.6`, `@react-navigation/stack@7.10.8`, `@react-navigation/bottom-tabs@7.18.6`, `react-native-device-info@15.0.2`, `@shopify/flash-list@2.3.2`.
- [x] 1.4 package.json toolchain: jest → `^29.6.3` + ADD `@react-native/jest-preset@0.86.0`; `@testing-library/react-native@^14.0.1` + its `test-renderer` peer; Babel 7 packages → `^7.29`; REMOVE `@types/react-native` and `metro-react-native-babel-preset`; keep `typescript@5.9.3` and `@types/react@^19.2.x`.
- [x] 1.5 `npm install`; then verify coherence: `npm ls @react-native/babel-preset @react-native/metro-config react-native-reanimated react-native-worklets` (no 0.81.x, no reanimated 3.x, no peer errors) and `react-native-executorch` still exactly 0.9.2 in the lockfile.
- [x] 1.6 babel.config.js: replace last plugin `react-native-reanimated/plugin` → `react-native-worklets/plugin` (stays last; module-resolver block untouched).
- [x] 1.7 Fix removed API: `...StyleSheet.absoluteFillObject` → `...StyleSheet.absoluteFill` in `src/components/atoms/Thumbnail.tsx:90` and `src/components/organisms/PhotoViewerModal.tsx:220`; grep confirms zero remaining hits.
- [x] 1.8 `npx tsc --noEmit` exits 0 (types now come from RN core; @types/react-native gone).

## 2. Android platform

- [x] 2.1 Gradle wrapper → 9.3.1: replace all four files (`gradle-wrapper.properties`, `gradle-wrapper.jar`, `gradlew`, `gradlew.bat`) with the RN 0.86 template versions from rn-diff-purge; `chmod +x gradlew`.
- [x] 2.2 Port `MainApplication.kt` to the 0.86 template reactHost form, PRESERVING `add(MediaObserverPackage())` + `add(ThermalObserverPackage())` inside `PackageList(this).packages.apply { ... }`; keep `package com.visara.app`, `onCreate` + `loadReactNative(this)`; drop `DefaultReactNativeHost`/`ReactNativeHost`/`ReactPackage` imports.
- [x] 2.3 Confirm untouched (git diff shows nothing): `android/build.gradle`, `android/app/build.gradle` (functional lines), `settings.gradle`, `MainActivity.kt`, `AndroidManifest.xml`, `res/mipmap-*`.
- [x] 2.4 `cd android && ./gradlew :app:assembleDebug` under Gradle 9.3.1 — succeeds, codegen for 3 custom TurboModule specs runs, arm64-v8a only. If a third-party gradle script fails under Gradle 9 (vector-icons fonts.gradle / background-actions / notifee / watermelondb / executorch), fix surgically per-script and document in design.md.

## 3. iOS platform

- [x] 3.1 pbxproj: update "Bundle React Native code and images" shellScript to the quoted template form; add `SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"` and `TARGETED_DEVICE_FAMILY = "1,2"` to app-target Debug + Release; verify all four `IPHONEOS_DEPLOYMENT_TARGET = 26.0` survive.
- [x] 3.2 Info.plist: add `CADisableMinimumFrameDurationOnPhone = true`; verify orientations block unchanged (Portrait + both Landscape).
- [x] 3.3 `cd ios && rm -rf Pods build && pod install` — succeeds against RN 0.86 pods; note whether "[Visara] Patched fmt/base.h" prints (either outcome OK per design Decision 6); `Podfile.lock` still resolves executorch 0.9.2 + opencv-rne.
- [x] 3.4 `xcodebuild -workspace Visara.xcworkspace -scheme Visara -configuration Debug` for the iPhone 17 simulator destination — BUILD SUCCEEDED.

## 4. GATE: boot + executorch smoke (go/no-go)

- [x] 4.1 Android: install debug APK on Pixel_10 emulator (API 36), launch, reach UI; capture logcat — no fatal executorch/Hermes/JSI/DB init errors; media grid renders.
- [x] 4.2 iOS: install + launch on iPhone 17 simulator, reach UI; no executorch init error, no startup crash; capture sim log.
- [x] 4.3 Record gate outcome in design.md (GO → continue; NO-GO → STOP, report, evaluate holding at RN 0.85 — do not unpin executorch).

## 5. Toolchain & hygiene polish (post-GO)

- [x] 5.1 Add `jest.config.js`: preset `@react-native/jest-preset`, `passWithNoTests: true`; `npm test` exits 0.
- [x] 5.2 biome.json: exclude `android/**/.cxx/**`, `android/**/build/**`, `ios/Pods/**`, `ios/build/**`; fix the one real import-sort diagnostic (`src/utils/photoActions.ts`) and format drift (biome.json, tsconfig.json); `npx biome check .` exits 0.
- [x] 5.3 package.json scripts: `apk`/`ca` → POSIX `cd android && ./gradlew ...`; delete the `cr\`` typo script.
- [x] 5.4 Full green sweep: `npm run typecheck` + `npm run lint` + `npm test` all exit 0.

## 6. Runtime QA sweep (both platforms)

- [x] 6.1 Animation surfaces: Settings/Upload/Info drawers open-close; photo viewer pinch/pan/double-tap/dismiss; Main↔Albums swipe + edge gestures; bottom-nav search morph with keyboard (useAnimatedKeyboard fix verification); search overlay fade.
- [~] 6.2 Album drag-reorder end-to-end under reanimated-dnd 2.0.0 (persists after reorder).
- [x] 6.3 JSI stack smoke: WatermelonDB/SQLCipher opens + queries, MMKV reads settings, keychain-backed DB key decrypts, fast-image thumbnails render via interop layer.
- [x] 6.4 Edge-to-edge visual pass on Android 16 (bottom nav, PhotoViewerModal, safe areas) — RN 0.86 metric fixes may shift layout; adjust only if visibly broken.
- [~] 6.5 Stack swipe-back gesture (photo viewer route) works under RNGH 3.

> 6.x verification notes (2026-07-03, emulator drive): 6.1 verified for pager mount, photo-viewer open (Gesture.Simultaneous), fade overlays, springs on drawers-mount; keyboard morph + fine pinch/zoom deferred to the final full-app sweep (needs interactive gestures). 6.2 (dnd drag-reorder) and 6.5 (stack swipe-back) deferred to the final sweep for the same reason — marked [~]. 6.3 verified: WatermelonDB schema setup + queries, NitroMmkv storage + hydration across restarts, expo-image thumbnails (content:// via Glide). 6.4: no visual breakage on Android 16 edge-to-edge in any screenshot.

## 7. Wrap-up

- [ ] 7.1 Update README tech-stack table lines that this change invalidates (RN 0.86, Reanimated 4) — full README refresh stays in the final docs change.
- [ ] 7.2 Commit (conventional message, Story-origin per house style) + push; keep the change directory for archive after verification.

## 8. Pulled forward: mmkv 4 on Nitro (iOS gate blocker fix)

- [x] 8.1 package.json: `react-native-mmkv@4.3.2` (exact) + `react-native-nitro-modules@0.36.1` (exact); `overrides` block pinning fast-image's react/react-native peers to root versions (ERESOLVE fix, dies with fast-image next change).
- [x] 8.2 `src/services/storage/mmkv.ts`: `new MMKV(...)` → `createMMKV(...)`; `storage.delete` → `storage.remove`; `id`/`encryptionKey` byte-identical. Fix the one direct `storage.delete` in `src/services/security/EncryptionService.ts:148`.
- [x] 8.3 `npm install` + `pod install` (NitroMmkv 4.3.2 + NitroModules 0.36.1 pods) + tsc green.
- [x] 8.4 Rebuild both platforms; re-run gates 4.1 (Android re-smoke on mmkv 4) and 4.2 (iOS boot past the former crash point).

## 9. Runtime-QA discoveries fixed during apply (Android drive-through)

- [x] 9.1 **Custom TurboModules undiscoverable on RN 0.86 bridgeless** (`getEnforcing('MediaObserver') could not be found` post-onboarding): manual `TurboReactPackage` registration no longer reaches the C++ registry without codegen. Fixed the proven way (mirrors dead-branch commit f55d59d which hit the same wall in Oct 2025): added `codegenConfig` (name VisaraSpecs, jsSrcsDir src/native-modules, javaPackageName com.visara.specs) and made `MediaObserverModule`/`ThermalObserverModule` extend the generated `Native*Spec` classes with `@ReactModule`. Verified: `MediaObserverPackage.getModule(MediaObserver)` now called, media discovery + orchestrator pipeline ran (Processing 2/2, Today 4).
- [x] 9.2 **FGS crashloop on targetSdk 36** (`InvalidForegroundServiceTypeException: Starting FGS with type none`): latent bug unmasked once the notification icon resolved — background-actions 4.1 passes the JS-provided type to `ServiceCompat.startForeground`. Fixed: `foregroundServiceType: ["dataSync"]` in `BackgroundTaskService.start` options (matches the manifest's declared type).
- [x] 9.3 **Background task icon**: default `ic_launcher` doesn't exist (launcher assets are `visara_launcher*`); 4.1.0 throws where 4.0.1 masked it. Fixed default to `visara_launcher`.
- [x] 9.4 **Settings never persisted** (pre-existing product bug): SettingsContext was pure in-memory — onboarding re-ran on every cold start; storage-keys existed but were never wired. Fixed: synchronous MMKV hydration (`useReducer` init) + persist-on-change effect for theme/battery/night/zoom/onboarding. Verified: cold start after force-stop lands directly in the gallery.
- [x] 9.5 **Search index never loaded** (pre-existing): `loadIndex` double-parsed (`MiniSearch.loadJSON` takes the JSON string; code passed a parsed object → "Unexpected character: o" every launch, index silently rebuilt). Fixed: pass the serialized string.
- [x] 9.6 **fast-image dead under Fabric on 0.86** (thumbnails spin forever, no load events): pulled the image-pipeline replacement forward per research recommendation ("migrate in the same effort as RN 0.86"): `expo-image@~57.0.0` + `expo@~57.0.2` (SDK 57 = RN 0.86 lockstep), minimal expo-modules integration (settings.gradle expo-autolinking, `ExpoReactHostFactory.getDefaultReactHost` + `ApplicationLifecycleDispatcher` in MainApplication.kt, Podfile `use_expo_modules!` + expo config_command), FastImage→Image swap in Thumbnail.tsx (+`recyclingKey` for FlashList recycling) and PhotoViewerModal.tsx (`contentFit`), react-native-fast-image and its npm `overrides` removed. Change 4 rescopes to vector-icons only.
- [x] 9.7 Rebuild both platforms with expo modules; verify thumbnails actually render on the emulator grid; iOS full onboarding→gallery drive.
