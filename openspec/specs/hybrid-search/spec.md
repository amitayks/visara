# hybrid-search Specification

## Purpose
TBD - created by archiving change semantic-search-embeddings. Update Purpose after archive.
## Requirements
### Requirement: Hybrid ranking is computed in SQL with RRF

`searchMedia(query)` SHALL execute one hybrid ranking: an FTS5 arm (`media_fts MATCH` with sanitized tokens AND-joined and a trailing prefix `*` on the final token; bm25 column weights caption 4, tags 3, ocr_text 2, description 1, filename 1; top 80) and — when the embedder is available — a semantic arm (`vec_media` KNN, `k=80`, query embedded per `gemma-embedding-index`), fused by Reciprocal Rank Fusion (`k=60`, equal arm weights) in a single SQL statement (CTE join), with `hidden=0 AND deleted=0` enforced in the same statement. Results hydrate to full media rows in fused order.

#### Scenario: Lexical and semantic agree

- **WHEN** the query matches a photo both by FTS and by vector proximity
- **THEN** RRF places it above photos matched by only one arm

#### Scenario: Hidden media cannot leak through any arm

- **WHEN** a hidden photo is among the vector top-k
- **THEN** the SQL-level filter excludes it — no code path can return hidden or deleted rows

### Requirement: Degradation ladder

The hybrid pipeline SHALL degrade without error: embedder unavailable or query embedding fails → FTS-only; a photo not yet enriched → reachable by its filename (FTS filename column, indexed at discovery time with empty enrichment columns until enriched); empty/whitespace query → empty result without touching the database.

#### Scenario: Search during first-ever drain

- **WHEN** the user searches while zero photos are enriched
- **THEN** filename matches return (FTS filename arm), no error surfaces, and results improve as enrichment progresses

#### Scenario: Embedder not yet delivered

- **WHEN** models are not downloaded and the user searches
- **THEN** results are lexical-only with no thrown error and no vector query attempted

### Requirement: No persisted side-indexes

Search SHALL read only the live FTS5 and vec0 tables; there SHALL be no serialized index snapshots, no index warm-up phase, and no `ensureSearchIndex` lifecycle. First-search latency SHALL be bounded by SQL execution (plus one query embedding when semantic is active).

#### Scenario: Cold app, instant search

- **WHEN** the user launches and immediately searches
- **THEN** the query runs directly against the database with no index build/load step

### Requirement: Suggestions come from the database

`suggest(prefix)` SHALL return up to 10 distinct tag values (from `json_each(enrichment.tags)`) and filename stems matching the prefix case-insensitively, ordered by frequency, for the search UI's suggestion chips.

#### Scenario: Tag suggestions reflect the library

- **WHEN** many beach photos are tagged "beach" and the user types "be"
- **THEN** "beach" appears among the suggestions
