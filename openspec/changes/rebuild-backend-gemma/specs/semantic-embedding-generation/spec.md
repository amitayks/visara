# semantic-embedding-generation — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: An on-device embedding is produced from a file's searchable text
**Reason**: The separate embedding queue stream and MiniLM generation are deleted.
**Migration**: Embedding happens inline per enriched item; see `gemma-embedding-index` and `processing-pipeline`.

### Requirement: Embeddings persist to the #1 embeddings table with dimension and model version
**Reason**: The separate embedding queue stream and MiniLM generation are deleted.
**Migration**: Embedding happens inline per enriched item; see `gemma-embedding-index` and `processing-pipeline`.

### Requirement: Embedding generation runs as a durable, queued pass driven by the orchestrator
**Reason**: The separate embedding queue stream and MiniLM generation are deleted.
**Migration**: Embedding happens inline per enriched item; see `gemma-embedding-index` and `processing-pipeline`.

### Requirement: Embedding admission is gated by device-capability and thermal state (#5)
**Reason**: The separate embedding queue stream and MiniLM generation are deleted.
**Migration**: Embedding happens inline per enriched item; see `gemma-embedding-index` and `processing-pipeline`.

### Requirement: Embeddings are idempotent and model-versioned
**Reason**: The separate embedding queue stream and MiniLM generation are deleted.
**Migration**: Embedding happens inline per enriched item; see `gemma-embedding-index` and `processing-pipeline`.
