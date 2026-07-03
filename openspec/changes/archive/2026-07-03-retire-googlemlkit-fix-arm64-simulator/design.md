## Context

Visara's Tier-0 literal pass runs on GoogleMLKit today: `MlKitEngine.analyze` (`src/services/ml/engines/MlKitEngine.ts:22-25`) does `Promise.all([ImageLabelingService.processImage, TextRecognitionService.extractText])`, and those two services call `@react-native-ml-kit/image-labeling` (`ImageLabelingService.ts:2,22`) and `@react-native-ml-kit/text-recognition` (`TextRecognitionService.ts:2,15`). The engine is reached only through the `AnalysisEngine` seam — `ProcessingService.processMedia` delegates via `this.engine.analyze(imageUri)` (`src/services/ml/ProcessingService.ts:43-45`), with `MlKitEngine` seeded as the Tier-0 default in `EngineRegistry` (`src/services/ml/engines/EngineRegistry.ts:22,27`).

**The blocker.** The executorch-runtime-bootstrap change (#4, in-flight) added `react-native-executorch@0.9.2`. Its pod sets `EXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64` (`ios/Pods/Target Support Files/react-native-executorch/react-native-executorch.debug.xcconfig:4`) because it ships **only** an arm64-simulator slice (confirmed by `Pods-Visara.debug.xcconfig` `OTHER_LDFLAGS[sdk=iphonesimulator*]` pointing at `.../simulator-arm64-debug/libpthreadpool.a`). Every GoogleMLKit/MLKit pod sets `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` (e.g. `GoogleMLKit.debug.xcconfig:3`, plus `MLKitCommon`, `MLKitVision`, `MLKitVisionKit`, `MLKitImageLabeling(+Common)`, `MLImage`) because GoogleMLKit has **no** arm64-sim slice. On an Apple-Silicon Mac the simulator is arm64, so MLKit refuses to build the only arch executorch supports, and vice-versa for x86_64 — **neither** arch links. The app-level empty override `"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = ""` at `project.pbxproj:423,502` (in the project-level Debug/Release configs `83CBBA20`/`83CBBA21`) does not fix it. The app's iOS floor is already `26.0` (`ios/Podfile:9`, and `IPHONEOS_DEPLOYMENT_TARGET = 26.0` at `project.pbxproj:342,369,439,511`), linking is static, and a fmt-consteval `post_install` patch is in place (`ios/Podfile:12-16,33-60`).

**The opening.** `react-native-executorch@0.9.2` ships dedicated Tier-0-shaped models that are **XNNPACK/CPU**, not MLX: OCR via `OCRModule` (built-in `OCR_ENGLISH` = CRAFT detector `.../xnnpack/craft_xnnpack_int8.pte` + CRNN recognizer `.../xnnpack/crnn_english_xnnpack_fp32.pte`, `constants/ocr/models.ts:5-8,112`) and image classification via `ClassificationModule` (`efficientnet-v2-s`, ImageNet-1k, `modelRegistry.ts:562`). Both expose imperative, non-hook module classes (`fromModelName(...)` → `forward(imageSource)`), so they fit `MlKitEngine`'s static, non-React context. `OCRModule.forward` returns `OCRDetection[]` (`{ bbox, text, score }`, `types/ocr.ts:14-18`); `ClassificationModule.forward` returns `Record<label, number>`. Apple Vision (`VNRecognizeTextRequest`) is available as an iOS OCR fallback and can be wrapped with the same native-module pattern already used by `ios/Visara/MediaObserver/MediaObserverModule.{swift,m}`.

## Goals / Non-Goals

**Goals:**
- Unblock the arm64 iOS/iPadOS 26 Simulator by removing GoogleMLKit, and prove it with a build/install/launch smoke.
- Move the Tier-0 OCR + labeling backend onto executorch (with an iOS Apple-Vision OCR fallback) **without** touching the #2 `AnalysisEngine` seam or the #3 orchestrator.
- Keep `descriptor.id = "mlkit"` so provenance, schema, migrations, and search are untouched.
- Gate the OCR swap on a parity check against a captured ML Kit baseline, and design the Vision fallback branch it selects.

**Non-Goals:**
- Wiring Gemma (Tier-1) into `ProcessingService` — that is the post-GO migration, gated by #4.
- Changing `MlKitEngine`, `EngineRegistry`, `ProcessingService`, `AnalysisEngine`, the DB schema, `OrchestratorService`, or search.
- Renaming the `mlkit` provenance token or the `mlkit-analysis-engine` capability (kept as a stable historical token).
- Adding `x86_64` simulator support (the app is arm64-simulator-only, matching executorch).
- Guaranteeing label-vocabulary parity (ImageNet-1k ≠ ML Kit labels); only OCR parity is gated.

## Decisions

### D1: Swap the two services' internals; keep `MlKitEngine` + `descriptor.id="mlkit"` byte-identical

The #2 `mlkit-analysis-engine` spec already requires the engine to *compose* `ImageLabelingService` + `TextRecognitionService`. So the smallest-blast-radius move is to rewrite only those two services' internals and leave `MlKitEngine`, `EngineRegistry`, `ProcessingService`, and `AnalysisEngine` **unmodified**. The class names stay (they were never `MlKit*`-named), and `descriptor.id` stays `"mlkit"`.

**Alternatives:** (a) Call executorch directly from `MlKitEngine`, deleting the two services — rejected: violates the #2 "engine reuses the two services" requirement and churns the engine. (b) Add a brand-new `Tier0ExecutorchEngine` and swap the registry default — rejected: touches `EngineRegistry`/`ProcessingService` (the #2/#3 seam) and duplicates the `Promise.all` logic for no gain.

### D2: Use the imperative `OCRModule` / `ClassificationModule`, NOT the `useOCR` / `useClassification` hooks

`MlKitEngine.analyze` runs inside a static service invoked from `OrchestratorService`, not a React render tree, so the hooks are unusable. `react-native-executorch` exports imperative module classes for exactly this (`modules/computer_vision/OCRModule.ts`, `ClassificationModule.ts`): `await OCRModule.fromModelName(OCR_ENGLISH)` then `forward(imageUri)`, and `await ClassificationModule.fromModelName(models.classification.efficientnet_v2_s(...))` then `forward(imageUri)`.

**Alternatives:** wrapping the hooks in a headless component — rejected as an anti-pattern for a background pipeline.

### D3: Lazily load each module once and memoize it

Unlike ML Kit (always-ready, bundled), the executorch modules require an async one-time load: a first-run model download (CRAFT + CRNN + EfficientNet `.pte`s, tens of MB) plus native init, and they hold native memory. Each service holds a `private static modulePromise` memo: first `processImage`/`extractText` call kicks off `fromModelName(...)`; concurrent calls await the same promise; a rejected load clears the memo so a later call can retry (rather than permanently poisoning the service). Modules are long-lived (not `delete()`-d per call).

**Alternatives:** load-per-call — rejected: re-downloads/re-inits every image. Eager load at boot — rejected: pays the download cost even for users who never trigger Tier-0; lazy-on-first-use matches the queue-driven pipeline.

### D4: Adapt executorch outputs into the existing `ProcessingResult` sub-shapes (POC-gated)

`TextRecognitionResult` stays `{ text, blocks, processingTime }`: `text` = the `OCRDetection[]` strings joined in reading order (top-to-bottom, left-to-right by `bbox`), `blocks` = a JSON string derived from the detections (a stand-in for ML Kit's block JSON). `ImageLabelingResult` stays `{ labels, processingTime }`: map `Record<label, number>` → `{ text, confidence, index }[]`, keep the existing `MIN_CONFIDENCE = 0.5` filter (and `setMinConfidence`), assign `index` by rank. **POC-gated:** the exact reading-order join, the `blocks` schema, the confidence threshold / top-k cap, and `index` semantics are finalized against the real on-device `OCRDetection[]` / classification output during the #4 POC run.

**Alternatives:** changing `ProcessingResult` to a richer OCR/label shape — rejected: would ripple into `MediaFileRepository` and search (the #2/#3 contract). Additive evolution is deferred to the post-GO Gemma work.

### D5: Apple Vision iOS OCR fallback as a source-compiled native module

Add `ios/Visara/VisionOCR/VisionTextRecognizerModule.{swift,m}` mirroring `MediaObserverModule` (`@objc(...)` Swift + `RCT_EXTERN_MODULE` ObjC), exposing one promise method `recognizeText(imagePath) -> { text, blocks }` built on `VNRecognizeTextRequest`. JS reaches it via `src/native-modules/NativeVisionTextRecognizer.ts` (the `@native-modules` alias, as `NativeMediaObserver.ts` does). It is **source-compiled** (no vendored binary, no `EXCLUDED_ARCHS`), so it builds for every iOS arch including the arm64 simulator and cannot reintroduce the link conflict. `TextRecognitionService` uses it on iOS when executorch OCR is unavailable or when the parity gate (D6) selected Vision.

**Alternatives:** a third-party Vision wrapper package — rejected: adds a dependency and possibly its own pod/arch constraints; a hand-rolled module is ~40 lines and arch-neutral. Using `VNClassifyImageRequest` as a labeling fallback too — deferred (Open Question); the gated requirement is OCR.

### D6: OCR parity gate — capture ML Kit baseline BEFORE removal, score after

The parity check compares executorch OCR to ML Kit, but this change removes ML Kit — so ordering matters. First, while `@react-native-ml-kit/text-recognition` is still installed, run the fixed corpus (bundled images + ground-truth strings) through ML Kit and snapshot outputs to a committed JSON fixture. Then, after the service swap, a dev-only harness scores executorch OCR (and Apple Vision on iOS) against the snapshot + ground truth via a text-similarity metric (character error rate and/or token F1), reporting per-image and aggregate. The result selects the iOS OCR source (executorch if it meets the bar, else Vision); Android always uses executorch OCR. **POC-gated:** the metric choice and pass threshold are set from the real measurements and recorded in this file.

**Alternatives:** skip parity and trust executorch OCR — rejected: silent OCR-quality regressions degrade search. Compare live against ML Kit at scoring time — impossible once ML Kit is removed; hence the pre-capture snapshot.

### D7: Reconcile `EXCLUDED_ARCHS` — `pod install` does most of it; the pbxproj override is manual

`pod install` regenerates the entire Pods graph and the aggregate `Pods-Visara.{debug,release}.xcconfig`. With the ML Kit packages gone, all MLKit `EXCLUDED_ARCHS[sim]=arm64` per-pod xcconfigs disappear and every MLKit `-framework`/`-l`/header/`FRAMEWORK_SEARCH_PATHS` entry is stripped from the aggregate — automatically. The **only** manual edit is the app-level override: the aggregate carries no `EXCLUDED_ARCHS`, and the app target inherits `EXCLUDED_ARCHS[sim]` from the project-level config (`83CBBA20`/`83CBBA21`), currently `""`. Since executorch's `x86_64` exclusion is per-pod and does **not** propagate to the app target, set the project-level `"EXCLUDED_ARCHS[sdk=iphonesimulator*]"` to `x86_64` (`project.pbxproj:423,502`) so the app itself targets arm64-only simulator and matches executorch. Verify the final value against the regenerated Pods.

**Alternatives:** delete the override entirely — workable for Debug (`ONLY_ACTIVE_ARCH=YES` builds only arm64) but fragile for generic-simulator-destination/CI builds that would attempt the un-linkable x86_64; setting `x86_64` is explicit and robust. Set it in the app-target config (`13B07F94`/`95`) instead of project-level — equivalent; project-level is where the current `""` lives, so edit in place.

### D8: Backend selection — OCR is CPU everywhere; classification backend is platform-selectable (POC-gated)

OCR (CRAFT+CRNN) is XNNPACK/CPU on every platform, so it runs on device and on the arm64 simulator. Classification `efficientnet-v2-s` defaults to **CoreML on iOS, XNNPACK on Android** (`modelRegistry.ts` variant policy). CoreML on the simulator can be unreliable, so for the on-sim data point force the XNNPACK backend (`models.classification.efficientnet_v2_s("xnnpack")`); on-device iOS may keep CoreML for speed. The per-platform/per-surface backend choice is POC-gated.

**Alternatives:** always XNNPACK — simplest and sim-safe, but forgoes CoreML acceleration on iOS devices; final choice deferred to POC latency numbers.

### D9: Keep the `"mlkit"` provenance token (accepted semantic debt)

`"mlkit"` is embedded in `MediaFileRepository` (`labels.source`, `:272,337`; `ai_model_version`, `:50`), `OrchestratorService` (`TIER0_TASK_TYPE = "tier0_mlkit"`, `:22`), `ProcessingQueueRepository`, and the `migrations.ts:54` backfill, and the `label-provenance` spec pins `source = "mlkit"`. Renaming to `"tier0"` would touch all of those plus require a data migration — directly contradicting "keep #2/#3 untouched." So `descriptor.id` stays `"mlkit"` as a **stable Tier-0 provenance token** (historically ML Kit, now executorch/Vision-backed). The semantic mismatch is accepted debt (Open Question: optionally stamp the real backend via `descriptor.modelVersion` in a later change).

**Alternatives:** migrate to `"tier0"` — rejected here for blast radius; can be a standalone provenance-rename change later.

## Risks / Trade-offs

- **Label vocabulary changes (ImageNet-1k vs ML Kit generic labels)** → search results and stored tags shift. Mitigation: OCR parity is the hard gate; labeling is best-effort, `MIN_CONFIDENCE`/top-k tuned at POC; the richer Tier-1 Gemma tags supersede Tier-0 labels post-GO.
- **Tier-0 cold-start download + async load** (new vs ML Kit's bundled always-ready models) → first analyze per install downloads CRAFT+CRNN+EfficientNet. Mitigation: lazy memoized load (D3), resolve-with-`success:false` on load failure so the orchestrator retries; Wi-Fi/size measured at POC.
- **CoreML classification on the simulator may fail** → force XNNPACK on the sim (D8); OCR is CPU regardless.
- **Executorch OCR below parity on iOS** → the Apple Vision fallback (D5/D6) is the designed insurance; if Vision is also insufficient, that is a recorded NO-GO signal for Tier-0-on-executorch (escalate).
- **Transitive pod removal** (GoogleDataTransport, GoogleUtilities, GTMSessionFetcher, PromisesObjC, nanopb, Protobuf) may or may not drop depending on other pods → verify `Podfile.lock` diff after `pod install`; no action if another pod still needs them.
- **Native memory from long-lived modules** → two resident XNNPACK models; acceptable for Tier-0, monitored at POC; `delete()` is available if pressure appears.
- **Depends on #4 GO** → executorch must be proven to run in-app before this ships. But this change also *unblocks* #4's own arm64-sim smoke (task 5.x there), so they interlock: land the MLKit retirement to make #4's simulator acceptance achievable.
- **Provenance token now misleading** (`"mlkit"` for executorch output, D9) → accepted debt; documented; optional `modelVersion` stamp later.

## Migration Plan

Ordered; validate each step before the next.

1. **Capture the ML Kit OCR baseline** (D6) — while `@react-native-ml-kit/*` is still installed, run the fixed corpus through ML Kit and commit the JSON snapshot + ground-truth fixture.
2. **Rewrite the two services** (D1–D4) — `TextRecognitionService` → `OCRModule`(`OCR_ENGLISH`); `ImageLabelingService` → `ClassificationModule`(`efficientnet-v2-s`); lazy memoized loads; output adapters. `npm run typecheck` + `npm run lint` clean.
3. **Add the Apple Vision iOS module** (D5) — `ios/Visara/VisionOCR/VisionTextRecognizerModule.{swift,m}` + `src/native-modules/NativeVisionTextRecognizer.ts`; wire the iOS fallback branch in `TextRecognitionService`.
4. **Remove ML Kit** — delete the two packages from `package.json`, `npm install`, then `cd ios && bundle exec pod install`; confirm `Podfile.lock` + aggregate xcconfig drop all MLKit/RNMLKit refs, fmt patch intact, static linking preserved (D7).
5. **Reconcile the arch override** (D7) — set project-level `EXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64` (`project.pbxproj:423,502`); confirm no `= arm64` remains anywhere in resolved settings.
6. **arm64 simulator smoke** — build + install + launch the Debug app on the arm64 iOS/iPadOS 26 Simulator; confirm boot + `initExecutorch`; attempt + record a Tier-0 `forward()` (XNNPACK/CPU expected to run, D8).
7. **Parity scoring** (D6) — run the harness, record per-backend scores + the selected iOS OCR source in this file.
8. **Verify** — `npm run typecheck` (baseline 8 TS6133, zero NEW), Metro-bundle check, `npm run lint`; confirm no `@react-native-ml-kit` references remain.

**Rollback:** revert the branch — restore the two `@react-native-ml-kit` packages, `pod install`, restore the pbxproj `""` override, drop the Vision module and the service rewrites. No schema/data migration is involved (provenance token unchanged), so rollback is clean and low-blast-radius.

## Open Questions

- **Parity metric + threshold:** which metric (CER vs token F1) and what score make executorch OCR a GO vs. selecting Apple Vision on iOS? (Set from POC measurements.)
- **Classification backend on iOS device:** CoreML (fast, sim-unreliable) or XNNPACK (uniform)? Measured at POC (D8).
- **Label quality/threshold:** does ImageNet-1k at `MIN_CONFIDENCE = 0.5` (or a tuned top-k) produce useful Tier-0 tags, or should Tier-0 labeling be dropped in favor of Tier-1 Gemma tags once #4 is GO?
- **Provenance honesty:** stamp the real backend via `descriptor.modelVersion` (`"executorch-crnn+efficientnet-v2-s"` / `"apple-vision"`) in a later change, or keep the opaque `"mlkit"` token (D9)?
- **Android OCR-only fallback:** Android has no Vision equivalent — if executorch OCR underperforms on Android, is there an acceptable fallback, or is that a NO-GO for Android Tier-0 OCR?
- **First-run model delivery:** runtime-download of the CRAFT/CRNN/EfficientNet `.pte`s (as designed) vs bundling them — acceptable for production Tier-0?
