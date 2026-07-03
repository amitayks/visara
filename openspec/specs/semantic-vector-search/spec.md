# semantic-vector-search Specification

## Purpose
TBD - created by archiving change semantic-search-embeddings. Update Purpose after archive.
## Requirements
### Requirement: A semantic vector index is hydrated from the embeddings table and cached

The system SHALL provide an all-static `SemanticSearchService` that maintains an in-memory index of the stored embedding vectors for fast retrieval, hydrated from the `embeddings` table and persisted to MMKV, mirroring the way the lexical index is cached and persisted. The index SHALL be updated incrementally when a single file is embedded (an upsert analogous to the lexical `addToIndex`), and the full rebuild SHALL NOT run in the per-file hot path. The `embeddings` table SHALL remain the source of truth; the in-memory index is a derived cache.

#### Scenario: The index hydrates on load

- **WHEN** `SemanticSearchService` initializes and a persisted index or stored embeddings exist
- **THEN** its in-memory vector index is populated without re-embedding any file

#### Scenario: A newly embedded file is indexed incrementally

- **WHEN** a single file's vector is persisted
- **THEN** that vector is upserted into the in-memory index for that file id
- **AND** the whole index is not rebuilt for that single file

### Requirement: Semantic search returns cosine-ranked nearest neighbors

`SemanticSearchService` SHALL expose a query that embeds the query string with the same embedding model and returns media file ids ranked by vector similarity (cosine), limited to a top-k. Because stored vectors are L2-normalized, similarity SHALL be computed as a dot product. The query SHALL embed the text with the same `model_version` as the indexed vectors so the comparison is within one vector space.

#### Scenario: A natural-language query returns ranked ids

- **WHEN** a non-empty query string is submitted for semantic search and the index is populated
- **THEN** the service returns a ranked list of media file ids with similarity scores, ordered most-similar first, limited to the top-k

#### Scenario: Query and index share a vector space

- **WHEN** the query is embedded for semantic search
- **THEN** it is embedded with the same model / `model_version` as the stored vectors
- **AND** vectors whose `model_version` differs from the active model are excluded from ranking

#### Scenario: Empty or unindexed state yields no semantic results

- **WHEN** the query is blank, or no embeddings have been indexed yet
- **THEN** semantic search returns an empty result set without error

### Requirement: Retrieval is storage-agnostic with an in-JS default and a native escape hatch

The retrieval implementation SHALL sit behind a storage-agnostic interface. The default implementation SHALL be an in-process scan (cosine over the cached normalized vector matrix), chosen because it adds no native surface and is fast for the target library size. The design SHALL keep this boundary so a native vector-index backend (e.g. `sqlite-vec`) can replace the in-process scan for very large libraries without changing callers.

#### Scenario: The default retrieval path is in-process

- **WHEN** semantic search runs on a typical device library
- **THEN** ranking is computed in-process over the cached vectors with no native vector-index dependency

#### Scenario: The retrieval backend can be swapped without changing callers

- **WHEN** a native vector-index backend is substituted behind the retrieval interface
- **THEN** `SemanticSearchService` callers and the hybrid combiner are unchanged

