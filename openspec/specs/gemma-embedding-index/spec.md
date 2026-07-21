# gemma-embedding-index Specification

## Purpose
TBD - created by archiving change rebuild-backend-gemma. Update Purpose after archive.
## Requirements
### Requirement: EmbeddingGemma is the only embedder

Semantic vectors SHALL be produced exclusively by EmbeddingGemma-300M (Q8_0 GGUF) via llama.rn (`embedding: true`, mean pooling), behind an `EmbedEngine` interface (`embedDoc(text)`, `embedQuery(text)`, `dispose()`). Document texts SHALL use the model-card document prompt format (`title: none | text: {caption. description. tags. ocr}`) and queries the query prompt format (`task: search result | query: {q}`), so stored and query vectors share one space.

#### Scenario: Same space for docs and queries

- **WHEN** a photo captioned "golden retriever on a beach" is embedded and the user searches "dog at the sea"
- **THEN** the query vector ranks that photo's vector among its nearest neighbors

### Requirement: MRL truncation to 256 dimensions

Raw 768-d outputs SHALL be Matryoshka-truncated to the first 256 dimensions and L2-renormalized before storage or query use. The stored vector format is `float[256]` in the `vec_media` vec0 table (cosine distance).

#### Scenario: Stored vectors are 256-d unit vectors

- **WHEN** any vector row is written
- **THEN** it contains 256 float32 components with L2 norm ≈ 1.0

### Requirement: Embedding rides the enrichment drain

After each successful enrichment persist, the pipeline SHALL embed the enrichment text and write the vector (DELETE+INSERT, same-transaction `embedding_meta.model_version`) before advancing to the next item. Embedding failure SHALL NOT fail the enriched item (enrichment stands; the vector is backfillable) — the item completes and a `vector-missing` condition remains queryable (`enrichment done` without `vec_media` row) for later backfill by the pipeline when the embedder becomes available.

#### Scenario: Search improves photo by photo

- **WHEN** the drain completes item N
- **THEN** item N is immediately findable both lexically and semantically, before item N+1 processes

#### Scenario: Embedder hiccup doesn't lose enrichment

- **WHEN** embedding fails for one item
- **THEN** the enrichment row persists, the item is `done`, and a later backfill pass embeds it without re-running the VLM

### Requirement: Model-version invalidation

Vectors SHALL be tagged with the embedder model version (`embedding_meta`). At pipeline start, vectors whose version differs from the current embedder SHALL be treated as missing (backfill re-embeds from stored enrichment text — the VLM is not re-run for an embedder-only version bump).

#### Scenario: Embedder upgrade re-embeds cheaply

- **WHEN** the embedder version tag changes
- **THEN** stale vectors are re-computed from existing enrichment text at drain pace, without any VLM generations

### Requirement: Resident embedder

The embedder context (~<300 MB) SHALL be initialized lazily and MAY stay resident across pipeline stop/start (it also serves query-time embedding); it SHALL be released on app termination and MAY be released under memory pressure. Query embedding SHALL work whenever the embedder model files are delivered and verified, independent of VLM/pipeline state.

#### Scenario: Semantic query before any VLM work

- **WHEN** models are delivered but the pipeline hasn't run (e.g., discovery still in progress)
- **THEN** a search still embeds the query and returns vector matches for any previously embedded rows (none on first run — lexical arm covers), without loading the VLM
