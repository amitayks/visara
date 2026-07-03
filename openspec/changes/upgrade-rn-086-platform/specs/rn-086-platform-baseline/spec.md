## ADDED Requirements

### Requirement: Platform pinned to React Native 0.86.0 with coherent scoped packages

The project SHALL pin `react-native@0.86.0` (exact) and `react@19.2.3` (exact), with `@react-native/babel-preset@0.86.0`, `@react-native/metro-config@0.86.0`, and the CLI trio `@react-native-community/cli@20.1.0`, `cli-platform-android@20.1.0` (in devDependencies), and `cli-platform-ios@20.1.0` (newly added). No `@react-native/*` scoped package MAY resolve to a 0.81.x version after install. `engines.node` SHALL be `>= 22.11.0`. `react-native-executorch` SHALL remain exactly `0.9.2`.

#### Scenario: Scoped packages are coherent

- **WHEN** `npm ls @react-native/babel-preset @react-native/metro-config` runs after install
- **THEN** every resolved `@react-native/*` version is 0.86.x with no 0.81.x stragglers and no peer-dependency errors

#### Scenario: Executorch pin untouched

- **WHEN** `package.json` and `package-lock.json` are inspected after the upgrade
- **THEN** `react-native-executorch` resolves to exactly `0.9.2`

### Requirement: Android builds under Gradle 9.3.1 with all local modifications preserved

The Android project SHALL build `:app:assembleDebug` successfully under the Gradle 9.3.1 wrapper (all four wrapper files updated together: `gradle-wrapper.properties`, `gradle-wrapper.jar`, `gradlew`, `gradlew.bat`). `MainApplication.kt` SHALL be ported to the 0.86 template's lazy `getDefaultReactHost(...)` form while continuing to register `MediaObserverPackage()` and `ThermalObserverPackage()`. The following SHALL remain unchanged: minSdk/compileSdk 36, buildTools 36.0.0, NDK 27.1.12297006, Kotlin 2.1.20, `arm64-v8a`-only abiFilters, `com.visara.app` namespace/applicationId/signing, `visara_launcher` mipmaps, `AndroidManifest.xml`, `settings.gradle`, `MainActivity.kt`, and the vector-icons `fonts.gradle` apply.

#### Scenario: Debug build succeeds on Gradle 9.3.1

- **WHEN** `./gradlew :app:assembleDebug` runs with the new wrapper
- **THEN** the build succeeds, autolinking + codegen for the three custom TurboModule specs complete, and only the `arm64-v8a` ABI is produced

#### Scenario: Custom native packages survive the reactHost port

- **WHEN** the app boots on Android and media discovery or thermal observation starts
- **THEN** `NativeMediaObserver` and `NativeThermalObserver` resolve via `TurboModuleRegistry.getEnforcing` without throwing (proof the two packages are still registered)

### Requirement: iOS builds against RN 0.86 pods with local modifications preserved

The iOS project SHALL complete `pod install` and an Xcode Debug build for the iPhone simulator under RN 0.86's pod pipeline. The pbxproj SHALL adopt the template's quoted "Bundle React Native code and images" shellScript and gain `SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"` and `TARGETED_DEVICE_FAMILY = "1,2"` on the app target's Debug and Release configs. The following SHALL remain unchanged: all four `IPHONEOS_DEPLOYMENT_TARGET = 26.0` entries, `platform :ios, '26.0'`, `PRODUCT_BUNDLE_IDENTIFIER = com.visara.app`, the simdjson pod path, `:fabric_enabled`/`:hermes_enabled`, `:mac_catalyst_enabled => false`, the entire fmt-consteval `post_install` patch block, and the existing `UISupportedInterfaceOrientations` set (iPhone Portrait + both Landscape). `Info.plist` SHALL gain `CADisableMinimumFrameDurationOnPhone = true`.

#### Scenario: Pods regenerate and the app builds

- **WHEN** `pod install` runs followed by an `xcodebuild` Debug build for an iPhone 17 simulator destination
- **THEN** both succeed, with `react-native-executorch (0.9.2)` and `opencv-rne` still resolved in `Podfile.lock`

#### Scenario: Photo-viewer orientations preserved

- **WHEN** `Info.plist` is inspected after the upgrade
- **THEN** iPhone `UISupportedInterfaceOrientations` still lists Portrait, LandscapeLeft, and LandscapeRight (the template's portrait-only split is NOT adopted)

### Requirement: Removed-API fixes limited to the two known call sites

`...StyleSheet.absoluteFillObject` (removed in RN 0.85) SHALL be replaced with `...StyleSheet.absoluteFill` in `src/components/atoms/Thumbnail.tsx` and `src/components/organisms/PhotoViewerModal.tsx`; no other JS source changes are required by the platform jump, and `index.js` SHALL keep `initExecutorch({ resourceFetcher: BareResourceFetcher })` above `AppRegistry.registerComponent`.

#### Scenario: No stale absoluteFillObject remains

- **WHEN** the repo is grepped for `absoluteFillObject` after the fix
- **THEN** there are zero hits in `src/`, and `tsc --noEmit` exits 0

### Requirement: App boots with executorch runtime initialized on both platforms (GATE)

The upgraded app SHALL install and boot to the UI on an iPhone 17 simulator (iOS 26) and a Pixel_10 emulator (API 36), with `initExecutorch` completing without `ResourceFetcherAdapterNotInitialized` or Hermes-V1-related startup crashes, and the JSI-heavy boot path intact (WatermelonDB/SQLCipher opens, MMKV reads, media grid renders).

#### Scenario: Android boot smoke

- **WHEN** the debug APK installs and launches on the Pixel_10 emulator
- **THEN** the app reaches the UI with no crash, and logcat shows no fatal executorch/Hermes/JSI initialization errors

#### Scenario: iOS boot smoke

- **WHEN** the app installs and launches on the iPhone 17 simulator
- **THEN** the app reaches the UI with no crash and no executorch initialization error in the simulator log
