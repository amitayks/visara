# analysis-engine-interface Specification

## Purpose
TBD - created by archiving change ml-engine-interface-seam. Update Purpose after archive.
## Requirements
### Requirement: AnalysisEngine defines a runtime-agnostic image-to-analysis producer

The system SHALL define an `AnalysisEngine` abstraction representing an `image → analysis` producer. An `AnalysisEngine` SHALL expose an `analyze(imageUri: string): Promise<ProcessingResult>` method and a static `descriptor` of type `AnalysisEngineDescriptor`. The descriptor SHALL declare a stable string `id`, an `AnalysisTier` `tier`, and a readonly `capabilities` list of `AnalysisCapability`; it MAY declare an optional `modelVersion` string. The abstraction MUST NOT depend on any concrete runtime (ML Kit, Gemma, or otherwise).

#### Scenario: Engine exposes analyze and descriptor

- **WHEN** any value is used as an `AnalysisEngine`
- **THEN** it provides an `analyze(imageUri)` method returning `Promise<ProcessingResult>`
- **AND** it provides a `descriptor` with `id`, `tier`, and `capabilities`

#### Scenario: Descriptor advertises tier and capabilities

- **WHEN** a selector inspects an engine's `descriptor`
- **THEN** `descriptor.tier` identifies the engine's tier
- **AND** `descriptor.capabilities` lists exactly the outputs the engine produces

### Requirement: analyze resolves rather than rejects

`analyze` SHALL always resolve with a `ProcessingResult` and SHALL NOT reject: on a successful pass it resolves with `success: true` and populated sub-results; on failure it resolves with `success: false`, a populated `error` string, and the contract's fallback sub-results. This preserves the existing `ProcessingService.processMedia` behavior for all callers.

#### Scenario: Successful analysis resolves with success true

- **WHEN** `analyze(imageUri)` completes without throwing internally
- **THEN** the promise resolves with `success: true`
- **AND** the `ProcessingResult` carries the produced sub-results and a `totalProcessingTime`

#### Scenario: Failed analysis resolves with success false

- **WHEN** an engine's internal producer throws during `analyze(imageUri)`
- **THEN** the promise still resolves (does not reject)
- **AND** the `ProcessingResult` has `success: false` and a non-empty `error` string

### Requirement: Tier and capability taxonomy anticipates Tier-0 and Tier-1

`AnalysisTier` SHALL be the closed union `"tier0" | "tier1"`, where `tier0` denotes the fast literal pass (OCR + labels) and `tier1` denotes multimodal enrichment. `AnalysisCapability` SHALL include at least `"labels"`, `"ocr"`, `"caption"`, `"description"`, and `"tags"`. Enrichment capabilities (`caption`, `description`, `tags`) SHALL be part of the taxonomy in this wave even though no engine produces them yet, so a Tier-1 engine can be added later without changing the abstraction.

#### Scenario: Tier taxonomy names both tiers

- **WHEN** an engine declares its `tier`
- **THEN** the value is either `"tier0"` or `"tier1"`

#### Scenario: Capability taxonomy reserves enrichment outputs

- **WHEN** the capability taxonomy is defined
- **THEN** it includes `caption`, `description`, and `tags` alongside `labels` and `ocr`
- **AND** no requirement in this wave obligates any engine to emit `caption`, `description`, or `tags`

### Requirement: Descriptor is provenance-ready and the result contract extends additively

The descriptor SHALL be usable as the source of analysis provenance: `descriptor.id` is the intended `labels.source` value (e.g. `"mlkit"`, `"gemma"`) and `descriptor.modelVersion` maps to `ai_model_version` / `labels.model_version`. `analyze` SHALL return the existing `ProcessingResult` contract unchanged in this wave, and that contract SHALL be extensible additively (e.g. a future optional `enrichment` and/or `provenance`) without breaking existing consumers. This wave SHALL NOT add producers that write those provenance or enrichment fields.

#### Scenario: Descriptor id doubles as a provenance source

- **WHEN** a later wave stamps label provenance from an engine
- **THEN** it can use `descriptor.id` as the `labels.source` value
- **AND** `descriptor.modelVersion` (when present) as the model-version provenance

#### Scenario: Result contract stays additive

- **WHEN** a later wave adds optional enrichment or provenance fields to the analysis result
- **THEN** existing consumers of `ProcessingResult` continue to compile and run unchanged

