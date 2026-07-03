> Ordered; validate each group before the next. Groups tagged **(agent)** are code/config; **(Mac)** require an Apple-Silicon Mac + Xcode/CocoaPods; **(POC)** are re-tuned once the #4 executorch POC reports real latency/quality/output shapes. Baseline: `npm run typecheck` has **8 pre-existing TS6133** warnings — this change must add **zero NEW** TS errors. Depends on #2 (`ml-engine-interface-seam`, archived) and #4 (`executorch-runtime-bootstrap`, in-flight GO).

## 1. OCR parity baseline — capture BEFORE removing ML Kit — (agent, POC)

- [ ] 1.1 Assemble a fixed dev-only OCR corpus: bundle ≥3 text-bearing test JPEGs (e.g. a street sign, a document snippet, a screenshot) plus a committed ground-truth string per image.
- [ ] 1.2 While `@react-native-ml-kit/text-recognition` is still installed, run each corpus image through the current `TextRecognitionService.extractText` and snapshot the outputs to a committed JSON fixture (the ML Kit OCR baseline).
- [ ] 1.3 Commit the corpus + ground-truth + baseline snapshot so later parity scoring never needs ML Kit present.

## 2. Rewrite TextRecognitionService onto executorch OCR — (agent, POC)

- [ ] 2.1 In `src/services/ml/TextRecognitionService.ts`, remove the `@react-native-ml-kit/text-recognition` import; add a lazy, memoized `OCRModule.fromModelName(OCR_ENGLISH)` load (`private static modulePromise`) that concurrent calls await and that clears on load failure so a later call can retry.
- [ ] 2.2 Implement `extractText(imageUri)` to call `OCRModule.forward(imageUri)` → `OCRDetection[]`, adapt to `{ text, blocks, processingTime }`: join detection `text` in reading order (top-to-bottom, left-to-right by `bbox`) and serialize the detections into the `blocks` JSON string. (POC: finalize the join + `blocks` schema against real on-device `OCRDetection[]`.)
- [ ] 2.3 Preserve the resolve-not-reject contract: on `isAvailable === false` or a thrown error (and no iOS Vision fallback), let the caller fall through to `MlKitEngine`'s existing `success:false` fallback (`textRecognition: { text: "", blocks: "[]", processingTime: 0 }`); keep `hasText` behavior intact.
- [ ] 2.4 Confirm `MlKitEngine`, `EngineRegistry`, `ProcessingService`, and `AnalysisEngine` are NOT modified (the `Promise.all` seam and `ProcessingResult` are untouched).

## 3. Rewrite ImageLabelingService onto executorch classification — (agent, POC)

- [ ] 3.1 In `src/services/ml/ImageLabelingService.ts`, remove the `@react-native-ml-kit/image-labeling` import; add a lazy, memoized `ClassificationModule.fromModelName(models.classification.efficientnet_v2_s(...))` load with the same concurrency/retry memo as 2.1. (POC: pick the backend per platform/surface — XNNPACK for sim-safe CPU, CoreML on iOS device for speed.)
- [ ] 3.2 Implement `processImage(imageUri)` to call `ClassificationModule.forward(imageUri)` → `Record<label, number>`, keep labels `>= MIN_CONFIDENCE` (default `0.5`, keep `setMinConfidence`), map survivors to `{ text, confidence, index }` (index by rank), return `{ labels, processingTime }`. (POC: threshold / top-k cap / index semantics tuned from real output; note ImageNet-1k vocabulary.)
- [ ] 3.3 Preserve resolve-not-reject: on `isAvailable === false` or a thrown error, surface via the engine's existing `success:false` fallback (`imageLabeling: { labels: [], processingTime: 0 }`).

## 4. Apple Vision iOS OCR fallback — (agent + Mac, POC)

- [ ] 4.1 Add `ios/Visara/VisionOCR/VisionTextRecognizerModule.swift` (`@objc(VisionTextRecognizerModule)`) and `VisionTextRecognizerModule.m` (`RCT_EXTERN_MODULE` + one promise method `recognizeText(imagePath, resolver, rejecter)`), mirroring `ios/Visara/MediaObserver/MediaObserverModule.{swift,m}`; implement OCR with `VNRecognizeTextRequest` returning `{ text, blocks }`. Source-compiled only: NO vendored binary and NO `EXCLUDED_ARCHS` (must build for the arm64 simulator).
- [ ] 4.2 Add `src/native-modules/NativeVisionTextRecognizer.ts` (via the `@native-modules` alias, following `NativeMediaObserver.ts`) exposing a typed `recognizeText(imagePath): Promise<{ text: string; blocks: string }>`; no `any` (Biome `noExplicitAny: error`).
- [ ] 4.3 In `TextRecognitionService`, add the iOS branch: when `Platform.OS === "ios"` and executorch OCR is unavailable OR the parity gate selected Vision, route OCR through the native module and adapt to the same `TextRecognitionResult` shape. Android never references the module.

## 5. Remove ML Kit dependencies and regenerate Pods — (agent + Mac)

- [ ] 5.1 Remove `@react-native-ml-kit/image-labeling` and `@react-native-ml-kit/text-recognition` from `package.json`; run `npm install`; grep the repo to confirm zero `@react-native-ml-kit` references remain in `src/` and `package.json`.
- [ ] 5.2 Run `cd ios && bundle exec pod install`; confirm `ios/Podfile.lock` no longer lists `GoogleMLKit`, any `MLKit*`, `MLImage`, or `RNMLKit*`, and review the transitive drop of `GoogleDataTransport`/`GoogleUtilities`/`GTMSessionFetcher`/`PromisesObjC`/`nanopb`/`Protobuf` (leave any still needed by other pods).
- [ ] 5.3 Confirm the aggregate `ios/Pods/Target Support Files/Pods-Visara/Pods-Visara.{debug,release}.xcconfig` contain no `MLKit`/`GoogleMLKit`/`RNMLKit` framework, library, header, or module references after regeneration.
- [ ] 5.4 Confirm static linking is preserved (`USE_FRAMEWORKS` unset, `ios/Podfile:12-16`) and the fmt-consteval `post_install` patch is still applied (`ios/Podfile:33-60`; `#undef FMT_USE_CONSTEVAL` in `ios/Pods/fmt/include/fmt/base.h`).

## 6. Reconcile the simulator arch settings — (agent + Mac)

- [ ] 6.1 In `ios/Visara.xcodeproj/project.pbxproj`, change both `"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = "";` occurrences (currently `:423,:502`, project-level Debug/Release) to `"x86_64"` so the app target builds the simulator as arm64-only, matching executorch.
- [ ] 6.2 Verify against the regenerated Pods that no `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` remains in any pod xcconfig, the aggregate, or the app target (only executorch's `= x86_64` and the app's new `= x86_64`).

## 7. arm64 simulator build/install/launch smoke — ACCEPTANCE — (Mac)

- [ ] 7.1 On an Apple-Silicon Mac, build + install + launch the Debug app on the arm64 iOS/iPadOS 26 Simulator; confirm it links (no MLKit/executorch arch error), boots, and `initExecutorch` succeeds.
- [ ] 7.2 Attempt a Tier-0 `forward()` on the simulator (executorch OCR + classification are XNNPACK/CPU); RECORD the outcome — expected to run, unlike the MLX-only Gemma LLM. (POC: on-sim latency/quality is a data point, not the gate.)
- [ ] 7.3 Verify NO REGRESSION: `ProcessingService.processMedia` still delegates to `MlKitEngine.analyze`; a processed image still persists labels with `source = "mlkit"` (no schema/migration change).

## 8. OCR parity scoring + iOS-source decision — (agent + device/Mac, POC)

- [ ] 8.1 Run the dev-only parity harness over the corpus: score executorch OCR (and, on iOS, Apple Vision) against the ML Kit baseline snapshot (1.2) and ground truth (1.1) with a text-similarity metric (CER and/or token F1); report per-image + aggregate.
- [ ] 8.2 Decide and record in `design.md`: the metric + pass threshold, the per-backend scores, and the selected iOS Tier-0 OCR source (executorch if it meets the bar, else Apple Vision); Android stays executorch OCR.

## 9. Verification — (agent)

- [ ] 9.1 `npm run typecheck` — confirm exactly the 8 pre-existing TS6133 warnings and ZERO NEW TS errors.
- [ ] 9.2 Metro-bundle check: `npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output /dev/null --reset-cache` (and `--platform android`) completes with no resolution error (confirms no dangling `@react-native-ml-kit` import).
- [ ] 9.3 `npm run lint` — Biome clean (tabs, double quotes, `noExplicitAny: error`) on all touched/new files.
