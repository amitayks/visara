## REMOVED Requirements

### Requirement: MlKitEngine reproduces the current pass byte-for-byte

**Reason**: The Tier-0 literal pass no longer runs on GoogleMLKit. `MlKitEngine` keeps its `descriptor.id = "mlkit"` and its `Promise.all` two-producer structure, but its sub-producers (`ImageLabelingService`, `TextRecognitionService`) are rewritten onto `react-native-executorch` (`ClassificationModule` / `OCRModule`) with an Apple Vision iOS OCR fallback, so `ProcessingResult` values are no longer required to be byte-for-byte identical to the pre-change ML Kit outputs. The label vocabulary changes from ML Kit's generic labels to EfficientNet-V2-S ImageNet-1k classes, and OCR text is assembled from `OCRDetection[]` rather than ML Kit blocks.

**Migration**: The pass-structure and result-contract guarantees are re-homed to the new `tier0-executorch-engine` capability, which requires the same parallel two-producer pass, single `totalProcessingTime`, and resolve-with-`success:true` contract while sourcing sub-results from executorch. The `MlKitEngine is the default Tier-0 engine` (descriptor) and `MlKitEngine preserves the failure fallback` requirements in this spec are unchanged and remain in force.

### Requirement: MlKitEngine adds no dependency and no native code

**Reason**: Retiring GoogleMLKit requires the Tier-0 backend to move onto `react-native-executorch`, which is a native runtime, plus an iOS-only Apple Vision (`VNRecognizeTextRequest`) native module for the OCR fallback. `ImageLabelingService` and `TextRecognitionService` therefore now import executorch modules (and, on iOS, the Vision native module) instead of `@react-native-ml-kit/*`. The engine itself still does not import any analysis runtime directly — it composes the two services — but the "no dependency, no native code" guarantee no longer holds at the service layer.

**Migration**: The new dependency/native-code footprint and the "engine stays a thin `Promise.all` with no direct runtime import" guarantee are specified by the `tier0-executorch-engine` and `apple-vision-ocr-fallback` capabilities. The `@react-native-ml-kit/image-labeling` and `@react-native-ml-kit/text-recognition` packages and the GoogleMLKit pods are removed by the `googlemlkit-retirement-arm64-simulator` capability.
