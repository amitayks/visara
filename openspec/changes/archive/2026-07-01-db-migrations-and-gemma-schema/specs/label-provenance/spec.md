## ADDED Requirements

### Requirement: Labels carry provenance metadata
The `labels` table SHALL provide a `source` string column (e.g., `mlkit`, `gemma`), a `type` string column (e.g., `tag`, `entity`, `object`), and an optional `model_version` string column. The `Label` model SHALL expose `source`, `type`, and `modelVersion?`.

#### Scenario: ML Kit label records its source
- **WHEN** a Tier-0 ML Kit image label is written
- **THEN** the stored label has `source = "mlkit"` and `type = "tag"`

#### Scenario: Gemma label records source, type, and model version
- **WHEN** a Tier-1 Gemma tag or entity is written
- **THEN** the stored label has `source = "gemma"`, a `type` of `tag` or `entity`, and a non-null `model_version`

### Requirement: ML Kit and Gemma labels coexist and stay distinguishable
Labels from different sources SHALL be independently queryable by `source`. A Gemma re-run SHALL replace only the rows with `source = "gemma"` for a given media file, leaving `source = "mlkit"` rows intact, and a Tier-0 re-run SHALL likewise leave `gemma` rows intact.

#### Scenario: Query labels by source
- **WHEN** a media file has both `mlkit` and `gemma` labels
- **THEN** filtering by `Q.where("source", "mlkit")` returns only the ML Kit labels
- **AND** filtering by `Q.where("source", "gemma")` returns only the Gemma labels

#### Scenario: Gemma re-run does not delete ML Kit labels
- **WHEN** a Gemma enrichment re-runs for a media file and rewrites its `gemma` labels
- **THEN** the file's `mlkit` labels are still present and unchanged

### Requirement: Existing labels backfill to the ML Kit source
Because v1 produced only ML Kit image labels, the v1→v2 migration SHALL backfill existing `labels` rows so their `source` is `mlkit` and `type` is `tag`, keeping provenance queries free of null handling.

#### Scenario: Migrated labels default to mlkit/tag
- **WHEN** the v1→v2 migration runs on a device with existing labels
- **THEN** every pre-existing label row has `source = "mlkit"` and `type = "tag"` afterward
- **AND** `model_version` remains null for those rows
