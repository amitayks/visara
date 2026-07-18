# Proposal: personalized-vision-context

## Why

Users hold context about their photos that no static image reveals: the event a picture was taken at, a brand recognizable only by its design, a pet or person the model has never heard of. Today the enrichment prompt is identical for every photo of every user (`GemmaVision.ts` hardcodes one system + user string), so the analysis can never use that knowledge, and there is nowhere for the user to teach it — every label in the database is model-generated.

Research (July 2026) is unambiguous about the mechanism: per-user fine-tuning on device is not viable (no supported training toolchain on Android/iOS; llama.cpp runtime LoRA applies to text layers only and is trained off-device), and the pattern shipping products use — Google Photos' Ask Photos "Remember List", Apple Photos' knowledge graph — is a **user-taught entity store retrieved into the model's context at analysis time**. That architecture is a pure app-layer feature on our existing stack.

## What Changes

- **New capability `user-entity-store`**: a local store of user-taught entities (person / pet / brand / event / place / other) with name, free-text description, and exemplar photo links. Schema v2 (`entity`, `entity_media`), `EntityRepo`, and facade CRUD. Teaching an entity (create / update / link exemplars / delete) flips the affected photos back to `pending` so the pipeline re-analyzes them with the new knowledge.
- **BREAKING (internal): rebuild the vision engine** — delete `engine/GemmaVision.ts` and `engine/parseEnrichment.ts`, replace with `engine/vision/`: a pure prompt-assembly module (builds the message array, injecting a capped, sanitized glossary of the user's entities), a pure output-parser module (JSON extraction/coercion, now including a model-reported `entities` array), and the llama.rn runtime module (lazy context, mutex, 120 s budget — behavior contracts preserved).
- **`VisionEngine.analyze` gains an `AnalysisContext` parameter**; `EnrichmentResult` gains `entities: string[]` (names of known entities the model says appear). The pipeline resolves reported names against the store and persists `entity_media` links with `source='vlm'` (user links are never overwritten; unrecognized names are dropped as hallucination guard).
- **Pipeline**: new optional `entities` dependency (prompt-context provider + detection recorder), context fetched per item, detection recording tolerated-failure like inline embed; new `nudge()` to kick re-analysis.
- **Out of scope (deferred)**: any fine-tuning/LoRA delivery, retrieval-ranked context selection (v1 injects a recency-capped glossary; the provider seam admits smarter selection later), entity-aware query expansion at search time, and the teaching UI (facade surface only in this change).

## Capabilities

### New Capabilities
- `user-entity-store`: entity schema, repository, facade surface, teach→re-analyze loop, vlm-detection links.

### Modified Capabilities
- `gemma-vision-enrichment`: prompt becomes assembled-per-item with user-entity glossary; output contract gains `entities`; engine module layout rebuilt; parse/coerce, image-prep, mutex/timeout, and provenance requirements carry forward unchanged.
- `sqlite-storage-core`: schema version 2 (additive migration: `entity`, `entity_media`); media purge and full wipe extended to entity links.
- `processing-pipeline`: per-item analysis context, detection recording, re-analysis nudge.
- `services-ui-facade`: entity CRUD/exemplar/introspection functions exported.

## Impact

- **Code**: `src/backend/engine/GemmaVision.ts`, `src/backend/engine/parseEnrichment.ts` deleted; new `src/backend/engine/vision/**`, `src/backend/repo/EntityRepo.ts`; deltas in `types.ts`, `contracts.ts`, `db/migrations.ts`, `repo/MediaRepo.ts`, `repo/maintenance.ts`, `pipeline/Pipeline.ts`, `facade.ts`.
- **Data**: additive schema migration to v2; no existing rows touched.
- **UI**: none in this change (facade-only surface; screens come later).
- **Model artifacts**: unchanged — same VLM + mmproj + embedder.
