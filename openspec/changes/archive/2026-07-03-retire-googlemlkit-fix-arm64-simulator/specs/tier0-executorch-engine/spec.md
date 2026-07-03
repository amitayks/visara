## ADDED Requirements

### Requirement: Tier-0 OCR is produced by executorch OCR

`TextRecognitionService.extractText(imageUri)` SHALL produce its result from `react-native-executorch`'s `OCRModule` (built-in `OCR_ENGLISH`: CRAFT detector + CRNN recognizer, both XNNPACK/CPU `.pte`s) instead of `@react-native-ml-kit/text-recognition`. It SHALL run the module's `forward(imageUri)` to obtain `OCRDetection[]` (`{ bbox, text, score }`) and adapt them into the existing `TextRecognitionResult` shape: `text` SHALL be the detections' recognized strings joined in reading order, `blocks` SHALL be a JSON string derived from the detections, and `processingTime` SHALL be measured across the call. The service SHALL NOT import `@react-native-ml-kit/*`. The exact reading-order join and `blocks` serialization are POC-gated and finalized against the real on-device `OCRDetection[]` shape.

#### Scenario: OCR text is assembled from executorch detections

- **WHEN** `TextRecognitionService.extractText(imageUri)` runs on a device where the executorch OCR models are loaded
- **THEN** it calls the executorch `OCRModule.forward(imageUri)` and receives `OCRDetection[]`
- **AND** it returns a `TextRecognitionResult` whose `text` is the joined recognized strings, `blocks` is a JSON string derived from the detections, and `processingTime` is a measured number
- **AND** it does not import or call `@react-native-ml-kit/text-recognition`

### Requirement: Tier-0 labeling is produced by executorch classification

`ImageLabelingService.processImage(imageUri)` SHALL produce its result from `react-native-executorch`'s `ClassificationModule` (built-in `efficientnet-v2-s`, ImageNet-1k) instead of `@react-native-ml-kit/image-labeling`. It SHALL run `forward(imageUri)` to obtain a `Record<label, number>` of class confidences, keep only labels at or above the existing `MIN_CONFIDENCE` threshold (default `0.5`, still adjustable via `setMinConfidence`), and adapt the survivors into the existing `ImageLabel[]` shape (`{ text, confidence, index }`) inside `ImageLabelingResult`. The service SHALL NOT import `@react-native-ml-kit/*`. The label vocabulary is ImageNet-1k (not ML Kit's generic labels); the confidence threshold, any top-k cap, and the `index` assignment are POC-gated for quality.

#### Scenario: Labels are derived from executorch classification and thresholded

- **WHEN** `ImageLabelingService.processImage(imageUri)` runs on a device where the executorch classification model is loaded
- **THEN** it calls `ClassificationModule.forward(imageUri)` and receives a `Record<label, number>`
- **AND** it returns an `ImageLabelingResult` containing only labels whose confidence is `>= MIN_CONFIDENCE`, each shaped as `{ text, confidence, index }`
- **AND** it does not import or call `@react-native-ml-kit/image-labeling`

### Requirement: The Tier-0 engine preserves the two-producer pass and result contract

`MlKitEngine.analyze(imageUri)` SHALL remain unchanged in structure: it SHALL run `ImageLabelingService.processImage` and `TextRecognitionService.extractText` concurrently via `Promise.all`, measure a single `totalProcessingTime`, and on success resolve with `{ imageLabeling, textRecognition, totalProcessingTime, success: true }`. The `ProcessingResult` type and its import path SHALL be unchanged, and `MlKitEngine` SHALL NOT import any analysis runtime directly — it composes the two services. Because `descriptor.id` stays `"mlkit"`, downstream provenance (`labels.source = "mlkit"`, `ai_model_version = "mlkit"`, `task_type = "tier0_mlkit"`) SHALL be unaffected.

#### Scenario: Engine still composes the two services in parallel

- **WHEN** `MlKitEngine.analyze(imageUri)` runs and both services succeed
- **THEN** it resolves with `success: true` and populated `imageLabeling` / `textRecognition` sub-results
- **AND** the two services run concurrently via `Promise.all`, not sequentially
- **AND** `MlKitEngine` imports neither `react-native-executorch` nor `@react-native-ml-kit/*` directly

#### Scenario: Provenance token stays "mlkit"

- **WHEN** a Tier-0 result from `MlKitEngine` is persisted after this change
- **THEN** the engine `descriptor.id` is still `"mlkit"`
- **AND** persisted labels still carry `source = "mlkit"` and `type = "tag"`, with no schema, orchestrator, or migration change

### Requirement: Executorch modules are loaded once and memoized

Because the executorch OCR and classification modules require an asynchronous one-time load (first-run model download plus native initialization) and hold native memory, each service SHALL lazily create its module on first use and memoize the load so concurrent `analyze` calls do not trigger duplicate loads. A failed load SHALL be recoverable (a later call MAY retry) rather than permanently poisoning the service. First-run download size and load latency for the CRAFT, CRNN, and EfficientNet `.pte`s are POC-gated.

#### Scenario: Concurrent first-run calls share a single module load

- **WHEN** two `analyze` calls reach a service before its executorch module has finished loading
- **THEN** both calls await the same in-flight load rather than starting two loads
- **AND** once loaded, subsequent calls reuse the memoized module without reloading

#### Scenario: A failed load does not permanently disable the service

- **WHEN** a module load fails (e.g. the first-run download cannot complete)
- **THEN** the current `analyze` resolves via the failure path (not reject)
- **AND** a later `analyze` call is allowed to attempt the load again

### Requirement: Unavailable runtime resolves through the failure path

When the executorch runtime is unavailable (`isAvailable === false`, e.g. an unsupported ABI) or a producer throws, the Tier-0 pass SHALL still resolve rather than reject, using the existing fallback sub-results (`imageLabeling: { labels: [], processingTime: 0 }`, `textRecognition: { text: "", blocks: "[]", processingTime: 0 }`), a computed `totalProcessingTime`, `success: false`, and a populated `error`. On iOS, an unavailable or failing executorch OCR MAY be served by the Apple Vision fallback (see `apple-vision-ocr-fallback`) before falling through to the failure path.

#### Scenario: Runtime unavailable yields the documented fallback

- **WHEN** `MlKitEngine.analyze(imageUri)` runs where `react-native-executorch` reports `isAvailable === false` and no iOS Vision fallback applies
- **THEN** the promise resolves (does not reject) with `success: false`
- **AND** `imageLabeling` is `{ labels: [], processingTime: 0 }` and `textRecognition` is `{ text: "", blocks: "[]", processingTime: 0 }`
- **AND** `error` is a non-empty string
