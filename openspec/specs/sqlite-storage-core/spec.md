# sqlite-storage-core Specification

## Purpose
TBD - created by archiving change rebuild-backend-gemma. Update Purpose after archive.
## Requirements
### Requirement: Single op-sqlite database is the source of truth

The backend SHALL persist all durable state in one SQLite database (`visara-v2.db`) opened via `@op-engineering/op-sqlite` (exact-pinned) with the package configured `{"sqliteVec": true, "fts5": true, "performanceMode": true}`, WAL journal mode, and foreign keys ON. WatermelonDB, `@nozbe/simdjson`, MiniSearch, and all MMKV-persisted index/checkpoint blobs (`search_index`, `semantic_index`, `processing_checkpoint`, `reprocess_checkpoint`) SHALL be removed; MMKV remains solely for UI settings keys. Any legacy WatermelonDB database file present on disk SHALL be deleted once at boot.

#### Scenario: One file holds everything

- **WHEN** the app runs after this change
- **THEN** media metadata, enrichment, FTS index, vectors, albums, and sync state all live in `visara-v2.db`, and no WatermelonDB/MiniSearch artifacts exist on disk or in code

#### Scenario: Legacy file cleanup

- **WHEN** the app boots on a device that still has the old WatermelonDB file and legacy MMKV index keys
- **THEN** both are deleted exactly once and boot proceeds normally

### Requirement: Schema v1

Schema version SHALL be tracked with `PRAGMA user_version` and applied by an idempotent migration runner. Schema v1 SHALL comprise: `media` (id PK, uri UNIQUE NOT NULL, filename, mime, width, height, size, taken_at, added_at, kind CHECK image|video|pdf, hidden, favorite, deleted, enrich_status CHECK pending|processing|done|failed|skipped DEFAULT pending, enrich_error, retry_count DEFAULT 0, model_version, processed_at) with indexes on `(deleted, hidden, taken_at DESC)`, `(enrich_status, kind)`, and `uri`; `enrichment` (media_id PK REFERENCES media ON DELETE CASCADE, caption, description, tags JSON-array text, ocr_text, duration_ms); `media_fts` FTS5 over (caption, description, tags, ocr_text, filename) with `tokenize='unicode61 remove_diacritics 2'`; `vec_media` vec0 (media_id TEXT PRIMARY KEY, embedding float[256] distance_metric=cosine); `embedding_meta` (media_id PK, model_version); `albums` (id PK, name, is_smart, smart_tag, sort_order, created_at); `album_media` (album_id, media_id, sort_order, added_at, PK(album_id, media_id)); `sync_state` (key PK, value).

#### Scenario: Fresh install migrates to v1

- **WHEN** the app first opens the database
- **THEN** `user_version` becomes 1 and all tables/virtual tables/indexes above exist

#### Scenario: Re-open is idempotent

- **WHEN** the app opens the database again
- **THEN** no migration re-runs and the schema is unchanged

### Requirement: Transactional writes with FTS kept in sync

All multi-row writes SHALL run inside explicit transactions (`executeBatch` or BEGIN/COMMIT). Enrichment persistence SHALL write the `enrichment` row, its `media_fts` entry, and the media row's status/provenance in the same transaction; purges SHALL delete media, enrichment, FTS, vector, and album-membership rows in the same transaction. A `rebuildFts()` maintenance operation SHALL exist to rebuild the FTS table from `enrichment`+`media` (invoked after wipe and available after bulk operations).

#### Scenario: Enrichment persist is atomic

- **WHEN** an enrichment result is saved and the process is killed mid-write
- **THEN** after restart the row is either fully enriched (status done, FTS row present) or fully pending — never half-written

### Requirement: Reactive queries with reference-stable rows

The storage layer SHALL provide `watchQuery(tables, run)` — re-running a query when any named table is invalidated by a committed write, throttled ~250 ms trailing — and a gallery feed built on it that preserves the `useVisibleMedia()` hook contract (`{media, ready}`, first emission unthrottled). Emitted row arrays SHALL pass through a row cache keyed by id such that a row whose consumed fields did not change is the **same object reference** as the previous emission (existing `React.memo` cells keep skipping). Row objects SHALL expose the legacy field names the UI reads: `id, uri, thumbnailUri, filename, mimeType, creationDate, isHidden, isProcessed, width, height, fileSize`.

#### Scenario: Drain writes don't storm the UI

- **WHEN** the pipeline updates one row per second for an hour
- **THEN** the gallery feed re-emits at most ~4×/second worth of throttled batches (250 ms trailing) and unchanged rows keep identity across emissions

#### Scenario: Hook contract unchanged

- **WHEN** `useVisibleMedia()` mounts on a populated database
- **THEN** the first emission arrives immediately (`ready: true`) with rows ordered `taken_at DESC`, excluding hidden and deleted rows

### Requirement: Wipe preserves schema and live observers

`wipeAllData()` SHALL delete all rows from media, enrichment, FTS, vec, embedding_meta, and album_media (album shells and settings survive) without dropping tables or closing the database, so active `watchQuery` subscriptions emit empty result sets rather than erroring; sync-state tokens SHALL be cleared so the next discovery is a full scan.

#### Scenario: Wipe under a live grid

- **WHEN** the user wipes all data while the gallery is mounted
- **THEN** the grid empties via its own subscription (no crash, no manual store patch), and the next launch performs a full discovery scan

### Requirement: Vector rows are replaced, never upserted in place

Because the bundled sqlite-vec build predates `INSERT OR REPLACE` support on vec0 tables, vector writes SHALL be `DELETE` + `INSERT` within one transaction, and `embedding_meta.model_version` SHALL be written in the same transaction.

#### Scenario: Re-embedding a photo

- **WHEN** a photo is re-enriched and re-embedded
- **THEN** exactly one vec_media row exists for it afterward, tagged with the current embedder model version
