# semantic-vector-search — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: A semantic vector index is hydrated from the embeddings table and cached
**Reason**: The in-memory brute-force matrix with MMKV snapshots is deleted.
**Migration**: KNN runs in SQL via sqlite-vec; see `gemma-embedding-index` and `hybrid-search`.

### Requirement: Semantic search returns cosine-ranked nearest neighbors
**Reason**: The in-memory brute-force matrix with MMKV snapshots is deleted.
**Migration**: KNN runs in SQL via sqlite-vec; see `gemma-embedding-index` and `hybrid-search`.

### Requirement: Retrieval is storage-agnostic with an in-JS default and a native escape hatch
**Reason**: The in-memory brute-force matrix with MMKV snapshots is deleted.
**Migration**: KNN runs in SQL via sqlite-vec; see `gemma-embedding-index` and `hybrid-search`.
