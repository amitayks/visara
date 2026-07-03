# mlkit-analysis-engine Specification

## Purpose
TBD - created by archiving change ml-engine-interface-seam. Update Purpose after archive.
## Requirements
### Requirement: MlKitEngine is the default Tier-0 engine

The system SHALL provide `MlKitEngine`, an all-static class conforming to `AnalysisEngine`, as the default Tier-0 analysis producer. Its `descriptor` SHALL be `{ id: "mlkit", tier: "tier0", capabilities: ["labels", "ocr"] }` and SHALL NOT declare a `modelVersion` (ML Kit has no app-level model version). Conformance to `AnalysisEngine` SHALL be enforced by the type system at its use sites (registry entry and the `ProcessingService` engine field), without a throwaway conformance local.

#### Scenario: MlKitEngine descriptor identifies a Tier-0 labels+OCR engine

- **WHEN** `MlKitEngine.descriptor` is read
- **THEN** `id` is `"mlkit"`, `tier` is `"tier0"`, and `capabilities` is `["labels", "ocr"]`
- **AND** `modelVersion` is absent

#### Scenario: MlKitEngine satisfies the AnalysisEngine contract

- **WHEN** `MlKitEngine` is assigned to an `AnalysisEngine`-typed slot
- **THEN** the assignment type-checks (its static `analyze` and `descriptor` match the interface)

### Requirement: MlKitEngine preserves the failure fallback

On failure of either producer, `MlKitEngine.analyze` SHALL resolve (not reject) with `success: false`, the existing fallback sub-results `imageLabeling: { labels: [], processingTime: 0 }` and `textRecognition: { text: "", blocks: "[]", processingTime: 0 }` when a partial result is unavailable, a computed `totalProcessingTime`, and an `error` equal to the thrown `Error.message` (or `"Unknown processing error"` for non-`Error` throws). The fallback values MUST match the pre-change behavior exactly.

#### Scenario: Producer failure yields the documented fallback

- **WHEN** `ImageLabelingService.processImage` or `TextRecognitionService.extractText` throws during `analyze`
- **THEN** the promise resolves with `success: false`
- **AND** `imageLabeling` is `{ labels: [], processingTime: 0 }` and `textRecognition` is `{ text: "", blocks: "[]", processingTime: 0 }` when no partial result exists
- **AND** `error` is the thrown message, or `"Unknown processing error"` if the throw was not an `Error`

