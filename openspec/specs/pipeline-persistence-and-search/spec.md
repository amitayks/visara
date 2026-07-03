# pipeline-persistence-and-search Specification

## Purpose
TBD - created by archiving change processing-orchestrator-wiring. Update Purpose after archive.
## Requirements
### Requirement: Completion stamps processing provenance and preserves the is_processed invariant

When a Tier-0 analysis succeeds, `MediaFileRepository` SHALL persist the result and, in the same write, stamp `processed_at`, `ai_model_version`, and `ai_schema_version` on the `media_files` row alongside `is_processed`. The write MUST preserve change #1's invariant `is_processed === (processed_at !== null)` so resumability queries and `getUnprocessed()` agree. The `ai_model_version` value SHALL come from the analyzing engine's descriptor.

#### Scenario: A successful Tier-0 pass stamps provenance

- **WHEN** `updateWithProcessingResult` (or `createWithProcessingResult`) runs for a successful result
- **THEN** the same write sets `is_processed = true`, a non-null `processed_at`, and `ai_model_version` from the engine descriptor

#### Scenario: The is_processed invariant holds

- **WHEN** a media file has been processed
- **THEN** `processed_at` is non-null exactly when `is_processed` is true
- **AND** `MediaFileRepository.getUnprocessed()` returns only files whose `processed_at` is null

### Requirement: Re-processing is idempotent via version columns

Persisting a result for a file already processed by the same engine version SHALL NOT duplicate rows: labels and OCR text are replaced in place (delete-then-recreate for that file) and the `media_files` row is updated, never duplicated. A pass whose engine/schema version matches the stored `ai_model_version`/`ai_schema_version` MAY be skipped entirely by the orchestrator; a newer version SHALL overwrite the enrichment fields on the same row.

#### Scenario: Re-persisting does not create duplicate media rows

- **WHEN** a result is persisted for an existing `media_files` row
- **THEN** the row is updated in place and no duplicate `media_files` row is created
- **AND** its labels/OCR are replaced rather than accumulated

#### Scenario: A newer engine version overwrites in place

- **WHEN** a file processed at version `V` is reprocessed at version `V+1`
- **THEN** the same `media_files` row is updated with the new result and `ai_model_version`/`ai_schema_version` advanced
- **AND** no duplicate row is created

### Requirement: Search is updated incrementally per processed file

After each successful persist, the orchestrator SHALL update the search index incrementally via `SearchService.addToIndex(mediaFileId)` for that single file. The full `SearchService.index()` rebuild SHALL NOT be used in the per-file processing hot path.

#### Scenario: A processed file becomes searchable immediately

- **WHEN** a file's result is persisted successfully
- **THEN** `SearchService.addToIndex(mediaFileId)` is called for that file
- **AND** the file's labels/OCR text are searchable without rebuilding the whole index

#### Scenario: No full rebuild per file

- **WHEN** files are processed one after another
- **THEN** each triggers an incremental `addToIndex`
- **AND** `SearchService.index()` is not called once per processed file

