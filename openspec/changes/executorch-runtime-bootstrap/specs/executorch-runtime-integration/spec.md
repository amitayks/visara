## ADDED Requirements

### Requirement: Pinned Executorch dependency set

The project SHALL add the Executorch runtime dependencies at exact pinned versions: `react-native-executorch@0.9.2`, `react-native-executorch-bare-resource-fetcher`, `@dr.pogodin/react-native-fs`, and `@kesha-antonov/react-native-background-downloader`. The bare (non-Expo) resource-fetcher adapter MUST be used because the app has a CocoaPods Podfile. No other Executorch version (e.g. `0.10.0`-nightly) SHALL be introduced for this gate.

#### Scenario: Dependencies installed at pinned versions

- **WHEN** the four dependencies are installed and `package.json` is inspected
- **THEN** `react-native-executorch` resolves to exactly `0.9.2`, and `react-native-executorch-bare-resource-fetcher`, `@dr.pogodin/react-native-fs`, and `@kesha-antonov/react-native-background-downloader` are present as dependencies

#### Scenario: Expo resource-fetcher adapter is not used

- **WHEN** the runtime resource fetcher is selected
- **THEN** the bare `BareResourceFetcher` adapter is used and no Expo-specific adapter is added

### Requirement: Global runtime initialization before component registration

The application SHALL call `initExecutorch({ resourceFetcher: BareResourceFetcher })` at the very top of `index.js`, before `AppRegistry.registerComponent`. Failing to initialize before the first `useLLM` hook call MUST be avoided because it throws `ResourceFetcherAdapterNotInitialized`.

#### Scenario: Init runs ahead of registration

- **WHEN** `index.js` executes on app start
- **THEN** `initExecutorch` with the `BareResourceFetcher` runs before `AppRegistry.registerComponent(appName, ...)`

#### Scenario: First hook call does not throw the adapter error

- **WHEN** the POC screen mounts and first invokes `useLLM`
- **THEN** no `ResourceFetcherAdapterNotInitialized` error is thrown

### Requirement: iOS CocoaPods static autolink at the 26.0 floor

iOS integration SHALL use CocoaPods autolinking (NOT Swift Package Manager) with static linking preserved. The iOS deployment floor SHALL be raised to `26.0` in both `ios/Podfile` (`platform :ios`) and all four `IPHONEOS_DEPLOYMENT_TARGET` build settings in `ios/Visara.xcodeproj/project.pbxproj`. `USE_FRAMEWORKS` MUST NOT be set (linking stays static), and the existing `post_install` fmt-consteval patch MUST be retained.

#### Scenario: Pods resolve via autolink

- **WHEN** `bundle exec pod install` runs after the deps are added
- **THEN** `react-native-executorch`, the `opencv-rne` pod, and the prebuilt `ExecutorchLib.xcframework` resolve with no Xcode/`Package.swift` change

#### Scenario: Deployment floor is 26.0 everywhere

- **WHEN** `ios/Podfile` and `ios/Visara.xcodeproj/project.pbxproj` are inspected
- **THEN** the Podfile declares `platform :ios, '26.0'` and every `IPHONEOS_DEPLOYMENT_TARGET` value is `26.0`, with none left at `15.5`

#### Scenario: Static linking and the fmt patch are preserved

- **WHEN** `pod install` completes
- **THEN** `USE_FRAMEWORKS` is unset (static linkage), and the `post_install` patch that disables fmt consteval is still applied

### Requirement: Android gradle autolink constrained to arm64-v8a at minSdk 36

Android integration SHALL rely on Gradle autolinking (no `MainApplication.kt` edit) and MUST constrain the built ABI to `arm64-v8a` via a tracked `ndk { abiFilters 'arm64-v8a' }` block in `android/app/build.gradle` `defaultConfig`. The Android `minSdkVersion` SHALL be raised to `36`. Unsupported ABIs (`armeabi-v7a`) MUST NOT be produced. A `pickFirsts` `libc++_shared.so` packaging rule SHALL be added only reactively if a duplicate-`.so` link error occurs.

#### Scenario: Debug build autolinks and links arm64 only

- **WHEN** `./gradlew :app:assembleDebug` runs after the config changes
- **THEN** `react-native-executorch` is autolinked, the prebuilt arm64-v8a `.so` link, and no `armeabi-v7a` slice is produced

#### Scenario: minSdk is 36

- **WHEN** `android/build.gradle` is inspected
- **THEN** `minSdkVersion` is `36` and `compileSdkVersion`/`targetSdkVersion` remain `36`

#### Scenario: Duplicate-so rule is not added pre-emptively

- **WHEN** the arm64 Debug build links without a duplicate-`.so` error
- **THEN** no `packagingOptions { jniLibs { pickFirsts ... } }` block is present

### Requirement: Shipping ML-Kit path preserved

The shipping ML-Kit analysis path SHALL remain byte-for-byte unchanged. `ProcessingService.processMedia`'s `Promise.all([ImageLabelingService.processImage, TextRecognitionService.extractText])` seam and the `ProcessingResult` contract MUST NOT be modified by this change, so the gate can fail without destabilizing the app.

#### Scenario: ProcessingService seam untouched

- **WHEN** the diff for this change is reviewed
- **THEN** `src/services/ml/ProcessingService.ts` (the `Promise.all` seam and the `ProcessingResult` interface) is unmodified, and no `ExecutorchService` is wired into the pipeline

#### Scenario: App still builds and runs with the runtime added

- **WHEN** the app is built and launched with the Executorch deps integrated
- **THEN** the existing ML-Kit pipeline still builds and runs unchanged
