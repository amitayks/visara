## ADDED Requirements

### Requirement: An on-device embedding is produced from a file's searchable text

The system SHALL provide an all-static `EmbeddingService` that produces a single fixed-length numeric vector for a media file from its assembled searchable text (caption, description, labels, OCR text, and filename — the same fields the lexical index gathers). It SHALL obtain the vector from an on-device text-embedding model provided by the `react-native-executorch` runtime via the non-React module API (`TextEmbeddingsModule.forward`, returning a `Float32Array`), so the pass runs inside the React-free background drain. The exact model and its output dimension SHALL be configuration decided by the embedding POC, not hard-coded into callers. The service SHALL fail soft: when the runtime or model is unavailable, embedding resolves to no vector rather than throwing, and the lexical pipeline is unaffected.

#### Scenario: A file's text is embedded to a vector

- **WHEN** `EmbeddingService` embeds a media file whose enrichment text is available
- **THEN** it returns one numeric vector whose length equals the active model's output dimension
- **AND** the same searchable-text assembly used by the lexical index is used as the model input

#### Scenario: The embedding runtime is unavailable

- **WHEN** the embedding model or executorch runtime cannot be loaded on the device
- **THEN** embedding resolves without a vector and surfaces no user-facing error
- **AND** Tier-0 processing and lexical search continue to run normally

### Requirement: Embeddings persist to the #1 embeddings table with dimension and model version

Each produced vector SHALL be L2-normalized and stored in the existing `embeddings` table (change #1) as a serialized string payload, with `dim` recording the vector length and `model_version` recording the producing model identifier. A dedicated repository SHALL own serialization/deserialization so a stored payload's decoded length always equals its `dim`.

#### Scenario: A vector is persisted with its metadata

- **WHEN** an embedding is generated for a media file
- **THEN** a row is written to `embeddings` with the media file's id, the serialized normalized vector, its `dim`, and the active `model_version`

#### Scenario: Decoded length matches the stored dimension

- **WHEN** a stored embedding row is read and its vector payload is deserialized
- **THEN** the number of decoded components equals the row's `dim`

### Requirement: Embedding generation runs as a durable, queued pass driven by the orchestrator

Embedding work SHALL be enqueued into the durable `processing_queue` as a row with `task_type = "embedding"` and drained by `OrchestratorService` as a queued pass, reusing the existing per-tier selection (`ProcessingQueueRepository.getNextPendingByTaskType`) and the existing mark-processing / mark-completed / retry / stale-recovery machinery. An `embedding` row SHALL be enqueued when a file's searchable text becomes ready (after an analysis/enrichment persist), and the pass SHALL survive app restarts like the Tier-0 drain. The embedding stream SHALL be selected independently so an embedding backlog never blocks Tier-0 analysis.

#### Scenario: A processed file is enqueued for embedding

- **WHEN** a media file's analysis/enrichment result is persisted
- **THEN** an `embedding` `processing_queue` row is created for that file with `task_type = "embedding"`

#### Scenario: The embedding pass is drained and recorded

- **WHEN** the orchestrator drains a pending `embedding` row
- **THEN** `EmbeddingService` produces the vector, it is persisted to `embeddings`, and the queue row is marked completed

#### Scenario: Embedding work survives a restart

- **WHEN** pending `embedding` rows exist and the app is killed and relaunched
- **THEN** the pending rows are still present and drainable, and any row stranded in `processing` is returned to `pending`

### Requirement: Embedding admission is gated by device-capability and thermal state (#5)

The embedding drain SHALL run under `BackgroundTaskService`, so change #5's thermal pause axis pauses it under thermal pressure without additional wiring. Before loading the embedding model, admission SHALL be gated by a check composed from change #5's `DeviceCapabilityService`/`ThermalService` primitives; because the embedding model is far lighter than the Tier-1 Gemma model, the admission floor MAY be lighter than `canRunTier1()` so that Tier-0-only devices can still embed their available text. The exact admission floor is configuration decided by the embedding POC. Admission SHALL fail closed: an unknown or error signal SHALL skip embedding without affecting Tier-0.

#### Scenario: A thermally throttled device pauses the embedding drain

- **WHEN** the device is under thermal pressure at or above the drain threshold
- **THEN** the embedding drain pauses between items along with any other queued work

#### Scenario: An ineligible device skips embedding without regression

- **WHEN** the admission check resolves false (or errors)
- **THEN** no embedding model is loaded and no vector is produced
- **AND** Tier-0 discovery, analysis, and lexical search continue unchanged

### Requirement: Embeddings are idempotent and model-versioned

The system SHALL keep one current vector per media file for a given `model_version`. Re-embedding a file SHALL replace its vector in place rather than accumulate duplicate rows. A file's embedding SHALL be treated as stale (eligible for re-embedding) when its searchable text has changed or when the active embedding `model_version` differs from the stored row's; re-embedding unchanged text at the same `model_version` SHALL be a no-op skip.

#### Scenario: Re-embedding replaces in place

- **WHEN** a file that already has an embedding is re-embedded
- **THEN** its existing vector row is replaced and no duplicate embedding row is created for the same `model_version`

#### Scenario: A model-version change marks embeddings stale

- **WHEN** the active embedding `model_version` differs from a stored embedding row's `model_version`
- **THEN** that file is selectable for re-embedding
- **AND** rows already at the active `model_version` over unchanged text are left in place
