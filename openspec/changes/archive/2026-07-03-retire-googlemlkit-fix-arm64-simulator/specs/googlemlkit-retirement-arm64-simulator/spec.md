## ADDED Requirements

### Requirement: The ML Kit npm packages are removed and unreferenced

`@react-native-ml-kit/image-labeling` and `@react-native-ml-kit/text-recognition` SHALL be removed from `package.json`, and no source file SHALL import from `@react-native-ml-kit/*` after this change. `ImageLabelingService` and `TextRecognitionService` SHALL be the only former import sites, and both are rewritten onto executorch (and, on iOS, Apple Vision).

#### Scenario: No ML Kit import remains

- **WHEN** the repository is searched for `@react-native-ml-kit` after this change
- **THEN** there are no matches in `package.json` dependencies or in `src/`
- **AND** `npm run typecheck` and the app build succeed without those packages

### Requirement: pod install regenerates the Pods without GoogleMLKit

After the npm packages are removed, `pod install` SHALL regenerate the CocoaPods graph so that `GoogleMLKit`, all `MLKit*` pods, `MLImage`, and the `RNMLKitImageLabeling` / `RNMLKitTextRecognition` pods are gone from `ios/Podfile.lock`, and the aggregate `ios/Pods/Target Support Files/Pods-Visara/Pods-Visara.{debug,release}.xcconfig` no longer references any MLKit framework, library, header, or module path. Static linking SHALL be preserved (`USE_FRAMEWORKS` stays unset, `ios/Podfile:12-16`) and the fmt-consteval `post_install` patch SHALL remain applied (`ios/Podfile:33-60`).

#### Scenario: Pods graph and aggregate xcconfig drop MLKit

- **WHEN** `pod install` runs after removing the ML Kit packages
- **THEN** `ios/Podfile.lock` contains no `GoogleMLKit`, `MLKit*`, `MLImage`, or `RNMLKit*` entries
- **AND** `Pods-Visara.debug.xcconfig` / `Pods-Visara.release.xcconfig` contain no `MLKit`/`GoogleMLKit`/`RNMLKit` framework, library, or header references
- **AND** the fmt patch is still applied and `USE_FRAMEWORKS` remains unset (static linking)

### Requirement: The simulator arch settings are reconciled to arm64-only

With GoogleMLKit gone, the only remaining pod-level simulator exclusion is executorch's `EXCLUDED_ARCHS[sdk=iphonesimulator*] = x86_64` (executorch ships an arm64-simulator slice only). The app-level empty override `"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = ""` at `ios/Visara.xcodeproj/project.pbxproj:423,502` SHALL be reconciled to `x86_64` so the app target builds the simulator as arm64-only and matches executorch, with no remaining `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` anywhere in the resolved build settings. The exact final value SHALL be verified against the regenerated Pods after `pod install`.

#### Scenario: No conflicting arm64 simulator exclusion remains

- **WHEN** the resolved simulator build settings are inspected after `pod install` and the pbxproj edit
- **THEN** no `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64` exists in any pod xcconfig, the aggregate, or the app target
- **AND** the app target's `EXCLUDED_ARCHS[sdk=iphonesimulator*]` is `x86_64` (arm64-simulator only), consistent with executorch

### Requirement: The arm64 simulator builds, installs, and launches

On an Apple-Silicon Mac, the Debug app SHALL build, install, and launch on the arm64 iOS/iPadOS 26 Simulator — the acceptance that GoogleMLKit previously blocked. The launch SHALL reach a running app (`initExecutorch` succeeding, the app UI rendering) with no linker error for either the ML Kit exclusion or the executorch slice. Because the executorch OCR and classification `.pte`s are XNNPACK/CPU (unlike the MLX-only Gemma LLM), a Tier-0 `forward()` on the simulator is expected to run and SHALL be attempted and recorded as a data point; on-simulator Tier-0 inference quality/latency is POC-gated and is not itself the gate.

#### Scenario: arm64 simulator smoke passes

- **WHEN** the Debug app is built, installed, and launched on the arm64 iOS/iPadOS 26 Simulator
- **THEN** it links and boots with no MLKit/executorch arch link error
- **AND** a Tier-0 OCR/classification `forward()` is attempted on the simulator and its outcome recorded

### Requirement: No regression to the shipping pipeline or provenance

Removing GoogleMLKit SHALL NOT change the `AnalysisEngine` seam, `ProcessingService.processMedia`, the `OrchestratorService` flow, the database schema, or search. Tier-0 provenance SHALL remain `source = "mlkit"` / `task_type = "tier0_mlkit"` because `descriptor.id` is unchanged, so no migration and no repository change is required by this capability.

#### Scenario: Pipeline and provenance unchanged

- **WHEN** the app runs the Tier-0 pipeline after this change
- **THEN** `ProcessingService.processMedia` still delegates to `MlKitEngine.analyze` through the unchanged seam
- **AND** persisted Tier-0 labels still carry `source = "mlkit"` with no schema or migration change
