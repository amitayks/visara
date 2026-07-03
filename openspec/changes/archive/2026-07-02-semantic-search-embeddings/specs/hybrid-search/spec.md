## ADDED Requirements

### Requirement: Hybrid search augments lexical results with a semantic ranker

The system SHALL provide a hybrid search entry point that runs the existing lexical `SearchService` search and the `SemanticSearchService` semantic search for the same query and fuses their ranked results into a single ranked list of media file ids. Fusion SHALL combine the two rankings by rank position (Reciprocal Rank Fusion) rather than by raw score, because the lexical and semantic engines produce scores on non-comparable scales. The hybrid result SHALL be a superset-aware ranking: a file matched by either engine is eligible to appear, and a file matched by both is boosted.

#### Scenario: Results from both engines are fused

- **WHEN** a query matches some files lexically and some files semantically
- **THEN** the hybrid result contains files from both engines in one ranked list
- **AND** a file ranked highly by both engines outranks a file matched by only one

#### Scenario: The fused output is consumable by existing search UI

- **WHEN** the hybrid search returns results
- **THEN** it returns ranked media file ids (with scores) in the same shape the search screens already resolve to `MediaFile` objects

### Requirement: The lexical search API is preserved and hybrid is additive

The existing `SearchService.search` lexical behavior and signature SHALL remain unchanged. Hybrid search SHALL be exposed as an additive entry point, so callers opt in without altering the lexical path. Adding hybrid search SHALL NOT change lexical indexing, serialization, or the incremental `addToIndex` hot path.

#### Scenario: The lexical path is unchanged

- **WHEN** a caller invokes the existing lexical `SearchService.search`
- **THEN** it returns the same lexical results as before this change, with no semantic ranking applied

#### Scenario: Callers opt into hybrid explicitly

- **WHEN** a search surface chooses hybrid search
- **THEN** it calls the additive hybrid entry point
- **AND** surfaces that do not opt in keep pure lexical behavior

### Requirement: Hybrid search degrades gracefully to lexical-only

When the semantic side is unavailable — the embedding model has not loaded, the device is ineligible, or no vectors are indexed — hybrid search SHALL return the lexical results alone rather than failing. The natural-language promise SHALL soften to keyword search in that state, never erroring or blocking the query.

#### Scenario: Missing semantic index falls back to lexical

- **WHEN** hybrid search runs but no embeddings are indexed (or the embedding model is unavailable)
- **THEN** it returns the lexical results only, with no error surfaced to the user

#### Scenario: A cold embedding model does not block the query

- **WHEN** the embedding model is still loading at query time
- **THEN** hybrid search returns lexical results immediately and does not wait on the model

### Requirement: Hybrid search fulfills the natural-language search promise

Hybrid search SHALL let a paraphrase or conceptual query surface a semantically related file even when that file's indexed text does not contain the query's literal tokens, fulfilling the onboarding "Search photos with natural language" promise, provided that file has an embedding.

#### Scenario: A conceptual query matches a non-literal file

- **WHEN** a query expresses a concept (e.g. a paraphrase) and an embedded file is semantically related but shares no query tokens in its lexical fields
- **THEN** hybrid search includes that file in the ranked results via the semantic ranker
- **AND** the same file would not have appeared under lexical search alone
