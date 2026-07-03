> Do this on a throwaway spike branch. Groups run top-to-bottom; validate each native step in isolation before the next. Each group is tagged **(agent-run)** or **(HUMAN-run)**. Group (F) is the real GO/NO-GO and is executed by the human on physical hardware.

## 1. (A) JS dependencies + runtime init — (agent-run)

- [x] 1.1 Install the pinned deps: `npm i react-native-executorch@0.9.2 react-native-executorch-bare-resource-fetcher @dr.pogodin/react-native-fs @kesha-antonov/react-native-background-downloader`.
- [x] 1.2 Confirm `package.json` pins `react-native-executorch` to exactly `0.9.2` and lists the bare fetcher + the two peers (no `0.10.0`-nightly, no Expo adapter).
- [x] 1.3 Edit `index.js`: add, at the very top (above `AppRegistry.registerComponent`, currently `index.js:5`), `import { initExecutorch } from 'react-native-executorch';`, `import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';`, then `initExecutorch({ resourceFetcher: BareResourceFetcher });`.
- [x] 1.4 Confirm the init statement executes strictly before `AppRegistry.registerComponent(appName, () => App)` so the first `useLLM` call cannot throw `ResourceFetcherAdapterNotInitialized`.
- [x] 1.5 Run `npm run typecheck` and `npm run lint`; confirm the touched JS stays clean (Biome tabs/double-quotes, no `any`).

## 2. (B) iOS config + pod install — (agent-run)

- [x] 2.1 Edit `ios/Podfile:9`: `platform :ios, '15.5'` → `platform :ios, '26.0'`.
- [x] 2.2 Edit all FOUR `IPHONEOS_DEPLOYMENT_TARGET = 15.5;` occurrences in `ios/Visara.xcodeproj/project.pbxproj` (lines 342, 369, 439, 511) → `26.0`; confirm none remain at `15.5` (`grep -n IPHONEOS_DEPLOYMENT_TARGET`).
- [x] 2.3 Do NOT set `USE_FRAMEWORKS` (keep the conditional block at `ios/Podfile:12-16` off) so linking stays static; leave the `post_install` fmt-consteval patch (`ios/Podfile:33-60`) intact.
- [ ] 2.4 Run `cd ios && bundle exec pod install`; confirm `react-native-executorch`, `opencv-rne`, and the prebuilt `ExecutorchLib.xcframework` resolve via autolink (`use_native_modules!`, `ios/Podfile:19`) with no Xcode/`Package.swift` edit.
- [ ] 2.5 Confirm the `post_install` fmt patch still applied (look for the "[Visara] Patched fmt/base.h" line, or `#undef FMT_USE_CONSTEVAL` in `ios/Pods/fmt/include/fmt/base.h`).
- [ ] 2.6 Build a clean Debug scheme for a device destination (before adding the POC screen) to confirm the pods link under New Arch / C++20; resolve any fmt/opencv-rne interaction here in isolation.

## 3. (C) Android config — (agent-run)

- [x] 3.1 Edit `android/build.gradle:4`: `minSdkVersion = 24` → `minSdkVersion = 36`; confirm `compileSdkVersion`/`targetSdkVersion` remain `36` (`android/build.gradle:5-6`) and NDK stays `27.1.12297006` (`:7`).
- [x] 3.2 Add a tracked `ndk { abiFilters 'arm64-v8a' }` block inside `defaultConfig` in `android/app/build.gradle` (the `defaultConfig` at `:81-87`) to constrain the ABI; do NOT rely on the untracked/gitignored `android/gradle.properties` (`.gitignore:136-137`) for this.
- [ ] 3.3 Run `./gradlew :app:assembleDebug`; confirm `react-native-executorch` autolinks (via `android/settings.gradle:3` + `autolinkLibrariesWithApp()`, `android/app/build.gradle:54`) and the arm64-v8a prefab `.so` link, with no `armeabi-v7a` slice produced.
- [ ] 3.4 Only if a duplicate `libc++_shared.so` link error appears, add `packagingOptions { jniLibs { pickFirsts += ['**/libc++_shared.so'] } }` — do NOT add it pre-emptively.
- [x] 3.5 Confirm `MainApplication.kt` is unchanged (autolink requires no manual package registration).

## 4. (D) POC screen — (agent-run)

- [x] 4.1 Bundle at least two known test JPEGs (e.g. "dog on a beach", "street sign with text") as app assets.
- [x] 4.2 Add a dev-only POC screen component that copies a bundled test JPEG to a local `file://` path via `@dr.pogodin/react-native-fs` at runtime (or uses the `file://` output of `ThumbnailService.generateThumbnail()`, `src/services/media/ThumbnailService.ts:326`); NEVER pass a raw `content://` URI.
- [x] 4.3 In the screen, call `const llm = useLLM({ model: models.llm.gemma4_e2b_multimodal() });` gate the inference control on `llm.isReady`, and render `llm.downloadProgress` during the first-run download.
- [x] 4.4 Add a button that calls `llm.sendMessage('What is in this image? List the main objects.', { imagePath: testImagePath })`; render the streamed `llm.response` and the finalized last assistant entry in `llm.messageHistory`; surface and allow retry on `llm.error`.
- [x] 4.5 Add a `__DEV__`-gated entry point to reach the screen (e.g. a debug-only affordance); ensure it is NOT reachable from the normal production flow.
- [x] 4.6 Ensure the screen renders and is operable on iPad form factor (tablet layout / larger safe-area), since the on-device gate device is an iPad Pro.
- [x] 4.7 Confirm ISOLATION: the POC does not import or modify `ProcessingService`, does not touch the `Promise.all` seam (`src/services/ml/ProcessingService.ts:34-37`) or `ProcessingResult` (`:7-13`), and performs no DB writes; run `npm run typecheck` + `npm run lint` clean.

## 5. (E) arm64 iOS-Simulator build/install/launch smoke — (agent-run)

- [ ] 5.1 On an Apple-Silicon Mac, build + install + launch the Debug app on the arm64 iOS/iPadOS 26 Simulator (the RNE podspec ships an arm64-sim slice only, no `x86_64`).
- [ ] 5.2 Verify: the pod links, the app boots, `initExecutorch` succeeds (no `ResourceFetcherAdapterNotInitialized`), the POC screen renders, and the model download starts.
- [ ] 5.3 Attempt `sendMessage` on the simulator and RECORD the outcome; expectation is inference FAILS (MLX has no CPU fallback). This is a required data point, NOT a gate.
- [ ] 5.4 Record the simulator result in the `design.md` results-table reference row (build/install/launch = expected PASS; inference outcome as observed).
- [ ] 5.5 Verify NO REGRESSION: the shipping ML-Kit `Promise.all` pipeline (`ProcessingService.ts:34-37`) and the app still build and launch with RNE added.

## 6. (F) HUMAN on-device inference gate — (HUMAN-run — the real GO/NO-GO)

- [ ] 6.1 (HUMAN) On the M-class iPad Pro (iPadOS 26, MLX), on Wi-Fi: launch the dev build, open the POC screen, let the ~3.2 GB MLX model download complete (record size/time).
- [ ] 6.2 (HUMAN) On the iPad Pro, run `sendMessage` on ≥2 distinct test images; capture caption text, post-load latency/image, peak process RAM (Xcode memory gauge), tokens/sec if shown, and any OOM/jetsam kill.
- [ ] 6.3 (HUMAN) On the Android flagship (12 GB+, Vulkan, arm64-v8a), on Wi-Fi: install + launch, let the ~4.4 GB Vulkan model download complete (record size/time).
- [ ] 6.4 (HUMAN) On the Android flagship, run `sendMessage` on the same ≥2 images; capture caption text, post-load latency/image, peak RAM (Android Studio profiler), tokens/sec if shown, and any native crash/OOM.
- [ ] 6.5 (HUMAN) Fill in the results table in `design.md` (one row per device × image) with all captured metrics.
- [ ] 6.6 (HUMAN) If the iPad Pro OOM-kills, retry with the `com.apple.developer.kernel.increased-memory-limit` entitlement (verify empirically) and re-record.
- [ ] 6.7 (HUMAN) Evaluate against the GO criteria (correct non-empty captions for ≥2 images on BOTH devices within the latency budget, no OOM/crash; simulator smoke passed in (E); no ML-Kit regression; OS-floor + Gemma-license sign-off) and the NO-GO triggers.
- [ ] 6.8 (HUMAN) Record the explicit GO / NO-GO decision (with rationale, date, sign-off) in the `design.md` "Decision recorded" line.
