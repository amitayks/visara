# gemma-multimodal-analysis-engine Specification

## Purpose
TBD - created by archiving change gemma-multimodal-analysis-engine. Update Purpose after archive.
## Requirements
### Requirement: GemmaMultimodalService is a Tier-1 AnalysisEngine

The system SHALL provide `GemmaMultimodalService`, an all-static class conforming to the `AnalysisEngine` abstraction (`analyze(imageUri: string): Promise<ProcessingResult>` plus a static `descriptor`), as a Tier-1 multimodal enrichment producer. Its `descriptor` SHALL declare `id = "gemma"`, `tier = "tier1"`, `capabilities` including at least `"caption"`, `"description"`, and `"tags"`, and a non-empty `modelVersion` string. `descriptor.id` (`"gemma"`) is the `labels.source` provenance and `descriptor.modelVersion` is the `ai_model_version` / `labels.model_version` provenance, per `analysis-engine-interface`. Conformance to `AnalysisEngine` SHALL be enforced by the type system at its use sites (the registry entry) without a throwaway conformance local, matching `MlKitEngine`.

The concrete `capabilities` set (whether `"ocr"` is also claimed) and the exact `modelVersion` string are POC-DEPENDENT and MUST be finalized once #4's on-device Gemma POC reports the real output shape.

#### Scenario: Descriptor identifies a Tier-1 enrichment engine

- **WHEN** `GemmaMultimodalService.descriptor` is read
- **THEN** `id` is `"gemma"`, `tier` is `"tier1"`, and `capabilities` includes `"caption"`, `"description"`, and `"tags"`
- **AND** `modelVersion` is a non-empty string usable as `ai_model_version` / `labels.model_version` provenance

#### Scenario: Engine satisfies the AnalysisEngine contract

- **WHEN** `GemmaMultimodalService` is assigned to an `AnalysisEngine`-typed slot (the registry entry)
- **THEN** the assignment type-checks (its static `analyze` and `descriptor` match the interface)

### Requirement: Engine drives the imperative ExecuTorch runtime, not the React hook

`GemmaMultimodalService` SHALL run inference through the imperative `LLMModule` API of `react-native-executorch` (`LLMModule.fromModelName(...)` and its `generate`/`interrupt` methods), and SHALL NOT depend on the `useLLM` React hook. The engine MUST remain framework-agnostic (no React import) so it can run inside the no-React background drain (`OrchestratorService`), consistent with every sibling all-static service. The engine SHALL assume the global `initExecutorch(...)` bootstrap (wired in `index.js` by #4) has already run.

#### Scenario: Engine has no React dependency

- **WHEN** `GemmaMultimodalService` is inspected
- **THEN** it imports the imperative `LLMModule` (and `models`) from `react-native-executorch`
- **AND** it does not import or call `useLLM`, and imports nothing from `react`

### Requirement: The Gemma model is loaded once and reused across images

`GemmaMultimodalService` SHALL load `models.llm.gemma4_e2b_multimodal()` at most once and reuse the single loaded instance across every `analyze` call. Loading SHALL be lazy (on first `analyze`, not at module load) and concurrency-safe: concurrent first calls SHALL share one in-flight load promise rather than starting parallel loads. A per-`analyze` reload of the multi-gigabyte model MUST NOT occur.

#### Scenario: First analyze loads, subsequent analyze reuses

- **WHEN** `analyze` is called for the first time
- **THEN** the engine loads `models.llm.gemma4_e2b_multimodal()` via `LLMModule.fromModelName(...)` and retains the instance
- **AND** a subsequent `analyze` reuses the retained instance without loading again

#### Scenario: Concurrent first calls share one load

- **WHEN** two `analyze` calls arrive before the model has finished loading
- **THEN** both await the same in-flight load promise
- **AND** the model is loaded exactly once

### Requirement: The image is decoded to a file:// path via ThumbnailService

Before inference, `GemmaMultimodalService` SHALL obtain a decodable local `file://` image from `ThumbnailService.getThumbnail(imageUri, ...)` and pass that path (as a `user` message `mediaPath`) to the runtime. The engine SHALL NOT pass a raw `content://` MediaStore URI to the ExecuTorch image decoder, which cannot read content URIs.

#### Scenario: Analyze feeds the runtime a ThumbnailService file path

- **WHEN** `analyze(imageUri)` runs its inference
- **THEN** it first resolves a `file://` path from `ThumbnailService.getThumbnail`
- **AND** that `file://` path (never the original `content://` URI) is what reaches the runtime as the image input

### Requirement: Analyze produces caption, description, and open-vocabulary tags mapped additively onto ProcessingResult

On a successful pass, `GemmaMultimodalService.analyze` SHALL resolve with `success: true` and populate an optional additive `gemma` field on `ProcessingResult` carrying the produced caption, description, and open-vocabulary tags (and optionally structured JSON / OCR text). The additive field SHALL NOT change any existing `ProcessingResult` field: `imageLabeling` and `textRecognition` remain present (the engine supplies the contract's empty fallbacks when it produces no ML-Kit-style labels/OCR), so every existing consumer of `ProcessingResult` compiles and runs unchanged. This is the additive extension reserved by `analysis-engine-interface` ("Result contract stays additive").

The prompt text, the model-output→fields parser, the optional structured-JSON schema, and the exact `gemma` field set are POC-DEPENDENT and MUST be finalized against #4's on-device Gemma POC output.

#### Scenario: Successful pass populates the additive enrichment

- **WHEN** `analyze(imageUri)` completes a successful inference
- **THEN** the promise resolves with `success: true` and a populated `gemma` enrichment (caption / description / tags)
- **AND** `imageLabeling` and `textRecognition` are still present on the result (empty fallbacks when the engine emits no ML-Kit-style outputs)

#### Scenario: Existing ProcessingResult consumers are unaffected

- **WHEN** the optional `gemma` field is added to `ProcessingResult`
- **THEN** existing consumers (`MediaFileRepository`, `SearchService`, `OrchestratorService`, UI) compile and run unchanged
- **AND** the `MlKitEngine` result (which never sets `gemma`) remains valid

### Requirement: Analyze enforces a per-image timeout with interrupt and fallback

`GemmaMultimodalService.analyze` SHALL bound each image's inference with a per-image timeout. When the timeout elapses before generation completes, the engine SHALL call `LLMModule.interrupt()` to stop generation and SHALL treat the image as a failure (resolve with `success: false`), never leaving an unbounded in-flight generation. The timeout value is POC-DEPENDENT and MUST be tuned to #4's measured on-device latency.

#### Scenario: A slow inference is interrupted and fails closed

- **WHEN** an image's generation exceeds the per-image timeout
- **THEN** the engine calls `interrupt()` and resolves with `success: false`
- **AND** no generation is left running unbounded

### Requirement: Analyze resolves and never rejects, matching the MlKitEngine envelope

`GemmaMultimodalService.analyze` SHALL always resolve with a `ProcessingResult` and SHALL NOT reject, byte-for-byte matching `MlKitEngine`'s envelope. On any failure — thrown error, timeout, or an unavailable native runtime (`isAvailable === false` / a failed model load) — it SHALL resolve with `success: false`, the contract's fallback sub-results (`imageLabeling: { labels: [], processingTime: 0 }`, `textRecognition: { text: "", blocks: "[]", processingTime: 0 }`), a computed `totalProcessingTime`, and a non-empty `error` string (the thrown message, or a stable message for non-`Error` throws). It MUST NOT populate a partial `gemma` enrichment on failure.

#### Scenario: Runtime unavailable fails closed without rejecting

- **WHEN** the ExecuTorch runtime is unavailable or the model fails to load
- **THEN** `analyze` resolves (does not reject) with `success: false`, a non-empty `error`, and the fallback sub-results
- **AND** no `gemma` enrichment is attached

#### Scenario: Internal throw yields the documented fallback

- **WHEN** the runtime or the output parser throws during `analyze`
- **THEN** the promise resolves with `success: false` and a non-empty `error`
- **AND** `imageLabeling` is `{ labels: [], processingTime: 0 }` and `textRecognition` is `{ text: "", blocks: "[]", processingTime: 0 }`

### Requirement: The engine is registered but not wired into the drain

`GemmaMultimodalService` SHALL be registered in `EngineRegistry` as the Tier-1 engine (so it is resolvable by id and tier), but this change SHALL NOT wire it into the active processing pipeline: it SHALL NOT be set as `ProcessingService`'s engine, SHALL NOT be enqueued or selected by `OrchestratorService`'s drain, and SHALL NOT add any `tier1_gemma` task handling. Tier-1 selection, gating (`DeviceCapabilityService.canRunTier1()`), and drain wiring belong to #10.

#### Scenario: Registered engine is not the active engine

- **WHEN** this change is applied
- **THEN** `EngineRegistry.getById("gemma")` resolves `GemmaMultimodalService`
- **AND** `ProcessingService.getEngine()` still returns the Tier-0 default (`MlKitEngine`) and `OrchestratorService`'s drain still processes only `tier0_mlkit`

