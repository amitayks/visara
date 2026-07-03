## ADDED Requirements

### Requirement: MediaFile stores AI caption and description
The `media_files` table SHALL provide optional `caption` and `description` string columns to hold Gemma-generated long-form text, and the `MediaFile` model SHALL expose them as `caption?` and `description?`.

#### Scenario: Caption and description persist
- **WHEN** a Gemma enrichment writes a caption and description to a media file
- **THEN** re-reading the `MediaFile` returns the stored `caption` and `description`

#### Scenario: Legacy rows read empty enrichment
- **WHEN** a media file created under v1 is read after migration and has never been enriched
- **THEN** `caption` and `description` are `undefined`/null
- **AND** existing UI that ignores these fields is unaffected

### Requirement: MediaFile records AI processing provenance
The `media_files` table SHALL provide `ai_model_version` (string, optional), `ai_schema_version` (number, optional), and `processed_at` (number epoch-ms, optional) columns, exposed on the `MediaFile` model. Together they identify which model produced the enrichment, which enrichment-output contract version it used, and when the file was last processed.

#### Scenario: Enrichment stamps provenance
- **WHEN** a Gemma pass completes for a media file
- **THEN** `ai_model_version`, `ai_schema_version`, and `processed_at` are all set on that row in the same write

#### Scenario: Never-enriched file has null provenance
- **WHEN** a media file has not been enriched by Gemma
- **THEN** `processed_at` is null
- **AND** `ai_model_version` and `ai_schema_version` are null

### Requirement: is_processed is derived from processed_at
The legacy `is_processed` boolean SHALL be retained for back-compat, and its value MUST correspond to whether `processed_at` is set: `is_processed` is true exactly when `processed_at` is non-null. The v1→v2 migration SHALL backfill `processed_at` for rows already marked `is_processed = true` so the invariant holds for legacy data.

#### Scenario: Setting processed_at implies is_processed
- **WHEN** a pass sets `processed_at` on a media file
- **THEN** the same write sets `is_processed` to true

#### Scenario: Legacy processed rows are backfilled
- **WHEN** the v1→v2 migration runs on a device where some `media_files` have `is_processed = true` but no `processed_at`
- **THEN** the migration sets those rows' `processed_at` to their `updated_at` timestamp
- **AND** `is_processed === (processed_at !== null)` holds for every row afterward

#### Scenario: Existing unprocessed query still works
- **WHEN** `MediaFileRepository.getUnprocessed()` runs (it queries `Q.where("is_processed", false)`)
- **THEN** it returns exactly the media files whose `processed_at` is null

### Requirement: Gemma re-runs are idempotent via version columns
A Gemma enrichment pass SHALL be idempotent: re-running against a media file whose `ai_model_version` and `ai_schema_version` already equal the target versions SHALL make no changes, while running with a newer model or schema version SHALL overwrite the enrichment fields on the same row (update, never duplicate).

#### Scenario: Re-run with the same versions is a no-op
- **WHEN** enrichment targets model `M` and schema `S`, and the media file already has `ai_model_version = M` and `ai_schema_version = S`
- **THEN** the pass skips the file and leaves `caption`, `description`, and `processed_at` unchanged

#### Scenario: Re-run with a newer version overwrites in place
- **WHEN** enrichment targets schema `S+1` and the media file has `ai_schema_version = S`
- **THEN** the same `media_files` row is updated with the new `caption`/`description` and `ai_schema_version = S+1`
- **AND** no duplicate `media_files` row is created
