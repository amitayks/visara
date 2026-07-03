## Context

Visara ships on-device analysis today through ML Kit: `ProcessingService.processMedia` runs `Promise.all([ImageLabelingService.processImage, TextRecognitionService.extractText])` (`src/services/ml/ProcessingService.ts:34-37`) and assembles a `ProcessingResult` (`ProcessingService.ts:7-13`). The ML→Gemma-4 migration's entire iOS-and-Android on-device story hinges on one unproven assumption: that `react-native-executorch`'s **Gemma-4 E2B multimodal** model can actually *run* vision inference inside this app's runtime (RN 0.81.4, React 19.1.0, New Arch / Fabric / Hermes / bridgeless). This change is the **de-risking spike and GO/NO-GO gate**. It performs the *full native integration* of the Executorch runtime and ships an *isolated* POC to prove RUNNING (not just building), while leaving the shipping ML-Kit path untouched so the gate can fail safely.

**Current state (verified in-repo):**
- **iOS** is pure CocoaPods: autolinking via `use_native_modules!` (`ios/Podfile:19`); `use_frameworks!` is conditional/off unless `ENV['USE_FRAMEWORKS']` is set (`ios/Podfile:12-16`) ⇒ **static linking today**; platform floor is `platform :ios, '15.5'` (`ios/Podfile:9`); four build configs pin `IPHONEOS_DEPLOYMENT_TARGET = 15.5` (`project.pbxproj:342,369,439,511`); a `post_install` patch disables fmt's consteval for Xcode 16.3+ (`ios/Podfile:33-60`).
- **Android** autolinks via `android/settings.gradle:3` + `autolinkLibrariesWithApp()` (`android/app/build.gradle:54`); `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`, `ndkVersion = "27.1.12297006"` (`android/build.gradle:3-7`); R8 is off (`enableProguardInReleaseBuilds = false`, `android/app/build.gradle:60`); there are **no** `abiFilters`/`splits`/`packagingOptions`; `android/gradle.properties` is absent on disk and gitignored (`.gitignore:136-137`).
- **JS**: `index.js` is 5 lines and registers the component at line 5; none of the four Executorch deps are in `package.json`. App entry is `src/App.tsx` → React-Navigation `RootNavigator` → the custom `MainNavigator` (`HorizontalPageContainer` + `SettingsDrawer`).

**`react-native-executorch@0.9.2` facts that drive the design:** the podspec pins `:ios => '17.0'`, vendors a prebuilt `ExecutorchLib.xcframework` with an **arm64-simulator slice only** (no `x86_64` sim), and depends on `opencv-rne ~> 4.11.0`; the iOS getter for `gemma4_e2b_multimodal` is hard-wired to an **MLX/Metal `.pte` with no CPU fallback**; Android uses a **Vulkan `.pte`**; both are fetched at first run from Software Mansion's HuggingFace (~3.2 GB iOS / ~4.4 GB Android). RNE supports only `arm64-v8a`/`x86_64` on Android.

**Stakeholder overrides applied here (these SUPERSEDE the brief's 15.5→17.0 and its iPhone/RAM assumptions):** newest-only minimum OS (iOS **26.0**, Android **minSdk 36 / Android 16**); the on-device inference gate runs on an **M-class iPad Pro** (iPadOS — its Apple GPU runs the MLX model) **and an Android flagship 12 GB+**, with **no iPhone**; this change's scope is **full integration + arm64 iOS-Simulator build/install/launch smoke**, and the actual on-device inference proof is **executed by the human** on those two devices.

## Goals / Non-Goals

**Goals:**
- Integrate `react-native-executorch@0.9.2` (+ bare resource-fetcher + `@dr.pogodin/react-native-fs` + `@kesha-antonov/react-native-background-downloader`) into both native builds, pinned, via CocoaPods autolinking (iOS, static) and Gradle autolinking (Android, arm64-v8a only).
- Raise the OS floors to the newest-only targets: iOS **26.0** (Podfile + all four `IPHONEOS_DEPLOYMENT_TARGET`), Android **minSdk 36**.
- Wire `initExecutorch({ resourceFetcher: BareResourceFetcher })` at the top of `index.js` before `AppRegistry.registerComponent`.
- Ship an **isolated, dev-only** POC screen that loads `gemma4_e2b_multimodal` via `useLLM`, shows download/ready/error state, and runs vision inference over a **decodable local `file://` image** — runnable on the iPad Pro.
- Pass an agent-run **arm64 iOS/iPadOS 26 Simulator** build/install/launch smoke and hand the human a fully-loaded on-device inference gate (iPad Pro + Android flagship) with a metrics table and explicit GO/NO-GO criteria.
- Keep the shipping ML-Kit pipeline byte-for-byte unchanged so the app still builds and runs with RNE added.

**Non-Goals:**
- Wiring Gemma into `ProcessingService`, any `ExecutorchService`, schema writes, replacing ML Kit, embeddings/search, or audio — all post-GO.
- Touching `ProcessingService.ts:34-37` / the `ProcessingResult` contract / `ImageLabelingService`/`TextRecognitionService` / DB / native MediaObserver modules.
- Proving audio capability (vision-only gate this change) or optimizing latency/quantization.
- SPM integration, dynamic frameworks (`USE_FRAMEWORKS`), on-simulator MLX inference, or an iPhone device path.
- Production model delivery (self-host vs runtime-download) — the ~3–4.4 GB HF download is accepted for the POC only.

## Decisions

### D1: iOS integration is CocoaPods autolinking, NOT SPM; keep static linking

RNE does not ship as a Swift Package — its `.podspec` uses standard `install_modules_dependencies` and vendors `ExecutorchLib.xcframework` + `opencv-rne`. This app is already pure CocoaPods (0 SPM refs; `use_native_modules!` at `ios/Podfile:19`). So: **add nothing to Xcode / `Package.swift`; `pod install` autolinks RNE.** Keep **static linking** — do NOT set `ENV['USE_FRAMEWORKS']` (`ios/Podfile:12-16`), because dynamic frameworks would risk breaking the static xcframework linkage. Keep the existing fmt-consteval `post_install` patch (`ios/Podfile:33-60`); RNE is C++20 under New Arch — watch first pod build for interaction but no change is expected.

**Alternatives:** "SPM alongside CocoaPods" — rejected, there is no SPM artifact to add and layering it risks dragging in `use_frameworks!`. Dynamic frameworks — rejected, breaks the static slice and is unnecessary.

### D2: iOS floor → 26.0 (newest-only), applied to the Podfile AND all four pbxproj configs

The podspec's `17.0` is a *minimum*; the stakeholder newest-only override sets the app floor to **26.0** (SUPERSEDING the brief's 15.5→17.0). Edit **`ios/Podfile:9`** (`'15.5'` → `'26.0'`) and **all four** `IPHONEOS_DEPLOYMENT_TARGET = 15.5` occurrences in `ios/Visara.xcodeproj/project.pbxproj` — **lines 342, 369, 439, 511** (the brief said "three"; there are in fact **four** — two app configs Debug/Release plus two more configs). All four must move together so Debug and Release, app and its variants, share one floor and Pods inherit ≥ 26.0. iOS 26 also aligns the target with the "iOS 26 arm64 simulator" used for the smoke test (D7).

**Alternatives:** 17.0 (podspec minimum) — rejected per stakeholder newest-only. Editing only the Podfile — rejected; the pbxproj configs would still emit 15.5 and mismatch the Pods.

### D3: Android — tracked `arm64-v8a` ABI filter + minSdk 36 (newest-only); avoid untracked gradle.properties

RNE supports only `arm64-v8a`/`x86_64`. Constrain the POC to **`arm64-v8a`** via a **tracked** `ndk { abiFilters 'arm64-v8a' }` block in `defaultConfig` of `android/app/build.gradle` (rather than an untracked `reactNativeArchitectures=arm64-v8a` in the gitignored `android/gradle.properties`, `.gitignore:136-137`). This keeps the ~4.4 GB per-ABI `.so` from ballooning the build, avoids pulling an unsupported `armeabi-v7a` slice, and — critically — keeps the ABI decision in version control. Bump **minSdk 24 → 36** at `android/build.gradle:4` (newest-only); `compileSdk`/`targetSdk` are already 36 and NDK 27.1.12297006 already satisfies RNE. Autolinking needs no `MainApplication.kt` edit. Add `packagingOptions { jniLibs { pickFirsts += ['**/libc++_shared.so'] } }` **only reactively** if a duplicate-`.so` link error actually appears — do NOT add pre-emptively.

**Alternatives:** untracked `reactNativeArchitectures` in local `gradle.properties` — usable on a dev machine but untracked (must be documented); rejected as the *primary* mechanism. Adding `x86_64` too — only if an emulator build is later wanted; omitted since the gate is a physical arm64 flagship.

### D4: Pin `0.9.2` + the bare adapter + peers; init at the very top of `index.js`

Install the exact set: `react-native-executorch@0.9.2`, `react-native-executorch-bare-resource-fetcher`, `@dr.pogodin/react-native-fs`, `@kesha-antonov/react-native-background-downloader` (Podfile ⇒ **bare** adapter, not Expo). Add to `index.js` above `AppRegistry.registerComponent` (currently `index.js:5`):

```js
import { initExecutorch } from 'react-native-executorch';
import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';
initExecutorch({ resourceFetcher: BareResourceFetcher });
```

Skipping this throws `ResourceFetcherAdapterNotInitialized` at the first hook call. Pin `0.9.2` for stability: nicer multimodal ergonomics (backend-selectable getter, CoreML) live on `0.10.0`-dev/nightly but are unstable — out of scope for a gate.

**Alternatives:** `0.10.0`-nightly for iOS backend switching — rejected for the gate (instability); only revisit if on-sim/CPU inference becomes a hard requirement.

### D5: Isolation — a dev-only POC screen; the ML-Kit seam is untouched

Build the POC as a **dev-only screen** reachable only behind a `__DEV__`-gated entry point, calling `useLLM({ model: models.llm.gemma4_e2b_multimodal() })` directly (its `capabilities: ['vision','audio']` are preset on the getter). Gate UI on `llm.isReady`, surface `llm.downloadProgress`, a button calls `llm.sendMessage('What is in this image? List the main objects.', { imagePath: testImagePath })`, and render the streamed `llm.response` (plus the finalized last assistant entry in `llm.messageHistory`). The **image fed to `sendMessage` MUST be a decodable local `file://` path** — a bundled test JPEG copied to a file path via `react-native-fs`, or the `file://` output of `ThumbnailService.generateThumbnail()` (`src/services/media/ThumbnailService.ts:326`) — **never** a raw `content://` MediaStore URI. `ProcessingService.processMedia`'s `Promise.all` seam (`ProcessingService.ts:34-37`) and the `ProcessingResult` contract (`:7-13`) are **not** modified in this change; an `ExecutorchService` is slotted into that seam only *after* GO.

**Alternatives:** wiring Gemma straight into `ProcessingService` to "test in situ" — rejected; it couples the gate to the shipping path and a failed gate would destabilize the app. Passing a `content://` URI — rejected; RNE cannot decode it.

### D6: The on-device inference gate runs on an M-class iPad Pro + an Android flagship — NO iPhone

The primary on-device inference proof (see the Human-Run section) is executed on an **M-class iPad Pro** (iPadOS 26; its Apple GPU + unified memory run the MLX `.pte`) and an **Android flagship with 12 GB+ RAM** (Vulkan-capable arm64-v8a). There is **no iPhone** in the gate. The POC screen therefore must render and be operable on iPad (tablet layout / larger safe-area) as well as phone form factors. iPad's larger unified-memory budget also makes it the better first target for an E2B-class model's ~3.2 GB MLX weights.

**Alternatives:** an 8 GB iPhone gate (the brief's original assumption) — superseded by the stakeholder hardware decision; the iPad Pro both matches available hardware and reduces OOM risk.

### D7: The iOS Simulator is build/install/launch smoke ONLY — inference is expected to fail there

RNE's arm64-sim slice links on Apple-Silicon Macs, but the `0.9.2` iOS getter is hard-wired to MLX/Metal with **no CPU fallback**, and the simulator has no real Apple GPU/unified-memory path for MLX. So the **arm64 iOS/iPadOS 26 Simulator** is validated as **build + install + launch + `initExecutorch` success + POC renders + model download starts** — a required data point for day-to-day dev on the sim — and the agent will *attempt* `sendMessage` and **record** the outcome, with the expectation that inference **FAILS** on the sim. Simulator inference is a *nice-to-have, NOT a gate*. All real inference proof is on the physical devices (D6).

**Alternatives / fallback if on-sim inference is ever needed:** manually construct the model object pointing `modelSource` at the XNNPACK `.pte` (~4.69 GB), or move to `0.10.0`-nightly's backend-selectable getter — both experimental, out of scope for the gate.

### D8: Model + first-run download

The POC uses the `gemma4_e2b_multimodal` getter; on first run RNE's background downloader fetches ~3.2 GB MLX `.pte` (iOS/iPadOS) / ~4.4 GB Vulkan `.pte` (Android) + a ~32 MB tokenizer from Software Mansion's HuggingFace. Gate the POC on **Wi-Fi**, handle `llm.error` + retry, and pre-warm the download before timing inference. Production model delivery (runtime-download vs self-host/bundle) is an Open Question that affects go-forward, not the gate.

## Risks / Trade-offs

- **iOS Simulator cannot run MLX inference** (0.9.2 getter is MLX-only, no CPU fallback) → treat the sim as build/install/launch smoke; do 100% of inference proof on the iPad Pro / Android device (D7). Fallback (XNNPACK `.pte` or 0.10.0-nightly) is experimental and out of scope.
- **E2B too large / OOM on device** → the iPad Pro's larger unified memory is the primary mitigation (D6); if OOM appears, request `com.apple.developer.kernel.increased-memory-limit` (verify empirically — undocumented by the lib). Persistent OOM even so is itself a NO-GO signal for E2B-on-iOS.
- **iOS 26.0 / Android minSdk 36 floor** (newest-only) sharply narrows the install base → this is a *stakeholder-accepted* newest-only decision; quantify install-base impact for product sign-off (Open Question), but it is not a blocker for the gate.
- **3–4.4 GB first-run download stalls / cellular** → rely on the background downloader, gate on Wi-Fi, handle `llm.error` + retry, pre-warm for the POC.
- **Android duplicate `libc++_shared.so`** link error → add `packagingOptions { jniLibs { pickFirsts += ['**/libc++_shared.so'] } }` reactively (D3), not pre-emptively.
- **Pod build interaction** (existing fmt-consteval patch + `opencv-rne` + RNE C++20 under New Arch) → validate `pod install` + a clean iOS build on the spike branch *before* adding the POC screen (Migration Plan step order).
- **Autolink edge case on exactly 0.81.4** → the RNE compat table asserts 0.81 support; if a codegen/prefab edge appears, bump to the latest 0.81.x patch.
- **`android/gradle.properties` untracked** (`.gitignore:136-137`) → put the ABI filter in the *tracked* `app/build.gradle` (D3); if a local `reactNativeArchitectures` is used instead, document it.
- **Version drift** (0.10.0-nightly ergonomics) → pin 0.9.2 for the gate; only jump to nightly if iOS backend switching is required, accepting instability.
- **POC destabilizes the shipping app** → keep it isolated (dev-only screen, `ProcessingService` untouched, D5); wire `ExecutorchService` into the `Promise.all` seam only after GO.
- **Gemma licensing** (Software Mansion's HF re-export of Google Gemma) → confirm the license is cleared for POC + eventual production before shipping (Open Question).

## Migration Plan

Ordered on a throwaway spike branch (also the `tasks.md` order); each native step is validated in isolation before the next:

1. **(A)** Add the four pinned deps to `package.json`; add the `initExecutorch` block to the top of `index.js`.
2. **(B)** iOS: `ios/Podfile:9` → `'26.0'`; all four `IPHONEOS_DEPLOYMENT_TARGET` → `26.0`; `cd ios && bundle exec pod install`; confirm RNE + `opencv-rne` + `ExecutorchLib.xcframework` resolve and a clean Debug build links (fmt patch intact, no `USE_FRAMEWORKS`).
3. **(C)** Android: `android/build.gradle:4` → `minSdkVersion = 36`; add `ndk { abiFilters 'arm64-v8a' }` to `app/build.gradle` `defaultConfig`; `./gradlew :app:assembleDebug` to confirm autolink + arm64 prefab link.
4. **(D)** Add the dev-only POC screen + `__DEV__` entry + bundled test JPEG(s); wire `useLLM(gemma4_e2b_multimodal)` + decodable `file://` image.
5. **(E)** Agent-run arm64 iOS/iPadOS 26 Simulator build/install/launch smoke; record the (expected-fail) inference outcome.
6. **(F)** Hand off to the human for the on-device inference gate (iPad Pro + Android flagship); fill the results table below; record GO/NO-GO in this file.

**Rollback:** trivial and low-blast-radius. Because the shipping ML-Kit path is untouched (D5), reverting the spike branch (deps, `index.js` init, the two native-config edits, the POC screen) fully restores the prior app. No schema, no data, no migration concern. The *only* non-trivial-to-revert decisions are the newest-only OS floors (iOS 26.0 / Android 36) — but those are deliberate stakeholder product decisions, not spike scaffolding.

---

## Human-Run On-Device Inference Gate (the real GO/NO-GO — executed by the human)

> **This section is NOT agent-run.** The agent completes tasks (A)–(E) (integration + POC + arm64-sim smoke). The **human** executes the on-device inference proof below on physical hardware and records the results here. MLX has no CPU fallback, so the iOS Simulator cannot substitute for the iPad Pro.

**Devices (stakeholder-fixed):**
- **iPad Pro (M-class, iPadOS 26)** — Apple GPU + unified memory runs the MLX `.pte`. NO iPhone.
- **Android flagship, 12 GB+ RAM** — Vulkan-capable arm64-v8a.

**Procedure per device:** Wi-Fi on; launch the dev build; open the POC screen; let the first-run model download complete (record size/time); run `sendMessage` on **≥2 distinct bundled test images** (e.g. "dog on a beach", "street sign with text"); capture the metrics below; run a second distinct image to confirm the caption is not a fluke.

### Results table (fill in during the human run)

| Surface | Device / OS / RAM | Image | Caption / object-list returned | Latency (s/image, post-load) | Peak process RAM | Download size / time | Tokens/sec (if shown) | OOM / crash? | PASS / FAIL |
|---|---|---|---|---|---|---|---|---|---|
| iPad Pro (MLX) | _e.g. iPad Pro M4 / iPadOS 26 / 16 GB_ | Image 1 | _fill in_ | _fill in_ | _fill in (Xcode memory gauge)_ | _fill in_ | _fill in_ | _yes/no_ | _PASS/FAIL_ |
| iPad Pro (MLX) | _same_ | Image 2 | _fill in_ | _fill in_ | _fill in_ | _(cached)_ | _fill in_ | _yes/no_ | _PASS/FAIL_ |
| Android flagship (Vulkan) | _e.g. Pixel 9 Pro / Android 16 / 16 GB_ | Image 1 | _fill in_ | _fill in_ | _fill in (Android Studio profiler)_ | _fill in_ | _fill in_ | _yes/no_ | _PASS/FAIL_ |
| Android flagship (Vulkan) | _same_ | Image 2 | _fill in_ | _fill in_ | _fill in_ | _(cached)_ | _fill in_ | _yes/no_ | _PASS/FAIL_ |
| arm64 iOS/iPadOS 26 Simulator | _agent-run (E); reference row_ | Image 1 | _build/install/launch = PASS; inference expected FAIL (MLX no CPU)_ | n/a | n/a | _download-start observed?_ | n/a | n/a | _smoke PASS/FAIL + inference outcome_ |

### GO / NO-GO decision

**GO requires ALL of:**
- **iPad Pro (MLX):** app builds & installs; `gemma4_e2b_multimodal` loads; `sendMessage(image)` returns a **non-empty, semantically-correct** caption/object-list for **≥2 distinct images**; latency ≤ **N s/image** post-load (N set by product — placeholder ~30 s); no OOM/jetsam kill (increased-memory-limit entitlement acceptable if that is what it takes).
- **Android flagship (Vulkan):** app builds & installs; same model returns a non-empty correct caption for **≥2 images**; no OOM / native crash; latency ≤ N s/image.
- **arm64 iOS/iPadOS 26 Simulator:** **builds, installs, and launches** (Debug) with the pod linked and `initExecutorch` succeeding (inference on the sim is NOT a gate).
- **No regression:** the shipping ML-Kit `Promise.all` pipeline (`ProcessingService.ts:34-37`) and the app still build & run with RNE added.
- **iOS 26.0 / Android 36 floor** confirmed acceptable to stakeholders (install-base check).
- **Gemma license** (via Software Mansion's HF re-export) cleared for POC use.

**NO-GO / re-evaluate if any of:**
- Model OOM-kills the iPad Pro even with the increased-memory-limit entitlement → E2B too large for the target.
- Caption is empty / gibberish / not describing the image (vision not really working) on device.
- Latency wildly outside budget (minutes/image) → UX untenable.
- iOS 26.0 / Android 36 floor unacceptable for the product.
- Build fails to link on either platform with no reasonable fix.

**Decision recorded:** ___ GO ___ NO-GO — _rationale / date / who signed off:_ ______________________

---

## Open Questions

- **Latency + quality bar:** what N seconds/image and minimum caption quality make this a GO?
- **iOS 26.0 / Android 36 newest-only floor:** quantify the install-base loss and confirm acceptable for Visara's product (hard gate on the whole on-device path).
- **Memory entitlement:** is `com.apple.developer.kernel.increased-memory-limit` acceptable / already provisioned for the app's bundle ID (if the iPad Pro needs it)?
- **Gemma licensing:** is Google's Gemma license (via Software Mansion's HF re-export) cleared for Visara's POC and eventual production?
- **Version pin:** OK to pin `0.9.2` for the gate (stable; iOS = MLX/real-device only) vs `0.10.0`-nightly (backend-selectable, unstable)?
- **Production model delivery:** is runtime-download (~3–4.4 GB from HF) acceptable for production, or must we self-host / bundle? (Affects go-forward, not the gate.)
- **Scope of the gate:** vision-only (assumed here), or must the POC also prove the audio capability?
- **Post-GO topology:** does Gemma *replace* both ML-Kit services, or run as an added Tier-1 pass alongside them in `ProcessingService`?
