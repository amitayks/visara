# gemma-enrichment-persistence Specification

## Purpose
TBD - created by archiving change gemma-multimodal-analysis-engine. Update Purpose after archive.
## Requirements
### Requirement: An additive write maps a Gemma result onto the media_files enrichment columns

The system SHALL provide an additive persistence method, `MediaFileRepository.applyGemmaEnrichment(mediaFile, gemma, provenance)`, that stamps a Gemma `ProcessingResult`'s enrichment onto the existing #1 schema columns. In a single write it SHALL set `caption`, `description`, `ai_model_version` (the Gemma `descriptor.modelVersion`), `ai_schema_version` (a `TIER1_SCHEMA_VERSION` constant), and `processed_at`, preserving the #1 invariant `is_processed === (processed_at !== null)`. The exact `gemma` field-to-column mapping and the `TIER1_SCHEMA_VERSION` value are POC-DEPENDENT and MUST be finalized against #4's on-device output shape.

#### Scenario: Enrichment stamps caption, description, and provenance in one write

- **WHEN** `applyGemmaEnrichment` persists a successful Gemma result
- **THEN** the media file's `caption`, `description`, `ai_model_version`, `ai_schema_version`, and `processed_at` are all set in the same write
- **AND** `is_processed` is true (the `is_processed === (processed_at !== null)` invariant holds)

### Requirement: Gemma labels are written with source provenance and coexist with ML Kit labels

`applyGemmaEnrichment` SHALL write the open-vocabulary tags as `labels` rows with `source = "gemma"`, a `type` of `tag` (or `entity`), and a non-null `model_version` equal to the Gemma `descriptor.modelVersion`, fulfilling `label-provenance`. It SHALL replace **only** the media file's existing `source = "gemma"` rows (delete-then-insert scoped by `Q.where("source", "gemma")`) and MUST leave `source = "mlkit"` rows intact. It MUST NOT reuse the Tier-0 `updateWithProcessingResult` path, which deletes **all** labels for the media file and would clobber the ML Kit labels.

#### Scenario: Gemma labels carry gemma provenance

- **WHEN** `applyGemmaEnrichment` writes tags for a media file
- **THEN** each stored label has `source = "gemma"`, a `type` of `tag` or `entity`, and a non-null `model_version`

#### Scenario: Writing Gemma labels leaves ML Kit labels intact

- **WHEN** a media file already has `source = "mlkit"` labels and `applyGemmaEnrichment` runs
- **THEN** the `mlkit` labels are still present and unchanged afterward
- **AND** filtering by `Q.where("source", "gemma")` returns only the newly written Gemma labels

### Requirement: The Gemma write is an in-place overwrite that never duplicates

Re-running `applyGemmaEnrichment` for the same media file SHALL update the same `media_files` row (never create a duplicate) and SHALL replace that file's `gemma` labels rather than accumulating duplicates, consistent with `media-enrichment-schema`'s "overwrite in place / update, never duplicate" rule. The version-aware SKIP that makes a same-version re-run a *no-op* (not even calling this method) is the orchestrator's guard and belongs to #10, mirroring the existing Tier-0 skip in `OrchestratorService.processNext`.

#### Scenario: Re-running overwrites in place

- **WHEN** `applyGemmaEnrichment` runs a second time for a media file that was already Gemma-enriched
- **THEN** the same `media_files` row is updated (no duplicate row is created)
- **AND** the file's `gemma` labels are replaced, not accumulated

### Requirement: The Tier-0 persistence path and the drain are unchanged

This change SHALL NOT modify the Tier-0 writers `MediaFileRepository.createWithProcessingResult` and `updateWithProcessingResult`, which continue to hard-code `label.source = "mlkit"` and `label.type = "tag"`. `applyGemmaEnrichment` SHALL be added as a standalone additive method and SHALL NOT be called from `OrchestratorService`'s drain in this change; it is the seam #10 invokes when it wires the Tier-1 pass.

#### Scenario: Tier-0 writes still stamp mlkit

- **WHEN** a Tier-0 `ProcessingResult` reaches `createWithProcessingResult` / `updateWithProcessingResult` after this change
- **THEN** persisted labels still carry `source = "mlkit"` and `type = "tag"`

#### Scenario: The additive method is present but unwired

- **WHEN** this change is applied
- **THEN** `MediaFileRepository.applyGemmaEnrichment` exists and type-checks
- **AND** `OrchestratorService`'s drain does not call it (no `tier1_gemma` handling is added)

