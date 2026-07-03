## ADDED Requirements

### Requirement: Embeddings table stores per-media vectors
The database SHALL provide a new `embeddings` table with columns `media_file_id` (string, indexed), `vector` (string; serialized vector payload), `dim` (number; vector length), `model_version` (string; embedding model identifier), and `created_at` (number). A new `Embedding` model SHALL expose these fields and be registered in the `database.ts` `modelClasses` list.

#### Scenario: Store an embedding for a media file
- **WHEN** an embedding is generated for a media file
- **THEN** a row is written to `embeddings` with the media file's id, the serialized `vector`, its `dim`, and the `model_version`

#### Scenario: Embedding belongs to its media file
- **WHEN** the `Embedding` model is defined
- **THEN** it has a `belongs_to` association on `media_file_id` to `media_files`
- **AND** `MediaFile` declares a matching `has_many` `embeddings` association

### Requirement: Vector payload is serialized for WatermelonDB storage
Because WatermelonDB column types are limited to `string`/`number`/`boolean`, the `vector` SHALL be stored as a serialized string (base64-encoded float bytes or a JSON number array), and the `dim` column SHALL record the vector length so payloads can be validated on read.

#### Scenario: Dimension matches decoded vector length
- **WHEN** an embedding row is read and its `vector` is deserialized
- **THEN** the number of decoded components equals the stored `dim`

### Requirement: Embeddings are model-versioned for re-embedding
Each embedding SHALL record the `model_version` that produced it so that changing the embedding model can invalidate and regenerate only stale vectors, keeping semantic search idempotent across model upgrades.

#### Scenario: Identify stale embeddings
- **WHEN** the active embedding model differs from an embedding row's `model_version`
- **THEN** that row is selectable as stale for regeneration
- **AND** rows already at the active `model_version` are left in place
