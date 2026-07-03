> Ordered top-to-bottom by dependency; every group is **agent-run JS** (the `react-native-executorch` runtime is integrated by #4/#7 — no native module work here). BASELINE: `npx tsc --noEmit` currently reports **8** pre-existing `TS6133` unused-symbol errors in 4 unrelated UI files; every group below must keep that count at **8** (zero NEW typecheck errors). Items tagged **(POC-DEPENDENT)** must be re-tuned after the on-device embedding POC (inherits #4's GO/NO-GO); wire them behind named constants so tuning never touches call sites. New/edited JS stays Biome-clean (tabs, double quotes, no `any`) and strict-TS.

## 1. Constants and repository

- [x] 1.1 Add `SEMANTIC_INDEX: "semantic_index"` to `STORAGE_KEYS` in `src/utils/constants/storage-keys.ts` (the MMKV key for the persisted vector index, sibling to `SEARCH_INDEX`).
- [x] 1.2 Add an `EMBEDDING_TASK_TYPE = "embedding"` constant (co-locate with `OrchestratorService`'s `TIER0_TASK_TYPE`, `OrchestratorService.ts:22`) — the token the archived `processing-queue-tiers` spec already reserves as an example.
- [x] 1.3 Add `EMBEDDING_MODEL_VERSION` **(POC-DEPENDENT)** placeholder `"all-minilm-l6-v2@1"` (id + Visara revision suffix); this is the single source of the stored `embeddings.model_version` and the stale-vector key.
- [x] 1.4 Create `src/services/database/EmbeddingRepository.ts` (all-static, `noStaticOnlyClass` biome-ignore header like siblings) over the existing `embeddings` table (`schema.ts:104-113`, `Embedding` model): `upsert(mediaFileId, vector: Float32Array, modelVersion)` that L2-normalizes, base64-encodes the Float32 bytes, writes `vector`/`dim`/`model_version`, and **replaces in place** (delete existing rows for that `media_file_id` first — mirrors the label/OCR replace pattern) so no duplicate rows accumulate.
- [x] 1.5 In `EmbeddingRepository`, add `decode(row): { vector: Float32Array; dim; modelVersion }` asserting `decoded.length === row.dim` (archived `semantic-embeddings` read-time validation), `findByMediaFileId`, `getAllForModelVersion(modelVersion)` (index hydration), and `findStale(activeModelVersion)` (rows whose `model_version` differs — archived "Identify stale embeddings").

## 2. EmbeddingService (executorch text-embeddings wrapper)

- [x] 2.1 Create `src/services/ml/EmbeddingService.ts` (all-static, fail-soft): lazy-load a resident `TextEmbeddingsModule` via `TextEmbeddingsModule.fromModelName(models.text_embedding.all_minilm_l6_v2())` from `react-native-executorch` **(POC-DEPENDENT: exact model getter + output dim)**; resolve availability inside a `try` and set an `isAvailable` flag, mirroring `MediaDiscoveryService`'s guard.
- [x] 2.2 Implement `EmbeddingService.embed(text): Promise<Float32Array | null>` calling the module's `forward(text)`; return `null` (never throw) when unavailable or on error, so the pipeline is unaffected (spec "The embedding runtime is unavailable").
- [x] 2.3 Implement `EmbeddingService.getModelVersion(): string` returning `EMBEDDING_MODEL_VERSION`, and ensure the same resident module instance serves both index-time and query-time embedding (guarantees one vector space).

## 3. Shared searchable-text assembly (DRY)

- [x] 3.1 Extract `buildSearchableText(mediaFileId): Promise<string>` (caption + description + labels joined + OCR text + filename) from the inline assembly in `SearchService.addToIndex` (`SearchService.ts:83-96`), including the #1 `caption`/`description` columns.
- [x] 3.2 Refactor `SearchService.addToIndex` and `SearchService.index` to call the shared `buildSearchableText` (no behavior change to the lexical document), so lexical and semantic inputs cannot drift.

## 4. SemanticSearchService (vector index + cosine/kNN)

- [x] 4.1 Create `src/services/search/SemanticSearchService.ts` (all-static) with a storage-agnostic retrieval boundary; the default backend holds one contiguous `Float32Array` matrix (N×dim) + parallel `id[]`, hydrated via `EmbeddingRepository.getAllForModelVersion(EmbeddingService.getModelVersion())`.
- [x] 4.2 Implement `loadIndex()` (hydrate from a persisted MMKV snapshot under `STORAGE_KEYS.SEMANTIC_INDEX`, else from the table) and `serializeIndex()` — mirroring `SearchService.loadIndex`/`serializeIndex` (`SearchService.ts:166-194`).
- [x] 4.3 Implement `upsertVector(mediaFileId, vector)` (incremental in-memory update + persist, analogous to `addToIndex`) and `removeVector(mediaFileId)` — no full rebuild in the per-file hot path.
- [x] 4.4 Implement `search(queryText, topK): Promise<{ id; score }[]>`: embed the query via `EmbeddingService.embed`; if `null`/empty/empty-index return `[]`; otherwise compute a dot product over the normalized matrix (cosine, since normalized), select top-k. **(POC-DEPENDENT: default `topK`, minimum-score cutoff.)**
- [x] 4.5 Exclude any vectors whose `model_version` differs from the active model (only same-space vectors are ranked).

## 5. Hybrid combiner (additive to SearchService)

- [x] 5.1 Add an additive hybrid entry point (`SearchService.searchHybrid(query, options?)` or a sibling `HybridSearchService`) that runs `SearchService.search` and `SemanticSearchService.search` in parallel — leaving the existing lexical `SearchService.search` signature/behavior byte-for-byte unchanged.
- [x] 5.2 Implement Reciprocal Rank Fusion (`score = Σ 1/(k + rank)`) over the two ranked id lists, returning a unified `{ id; score }[]` in the shape the search screens already resolve to `MediaFile` (`SearchModeOverlay.tsx:88-99`). **(POC-DEPENDENT: RRF `k`, or switch to normalized weighted-sum `α`.)**
- [x] 5.3 Graceful degradation: when `SemanticSearchService.search` yields `[]` (model unavailable / no vectors / cold model), return the lexical results alone — never throw, never block on model load (spec "degrades gracefully to lexical-only").

## 6. Orchestrator wiring (enqueue + drain the embedding stream, gated by #5)

- [x] 6.1 In `OrchestratorService.processNext` success branch (`OrchestratorService.ts:219-234`, after `SearchService.addToIndex`), enqueue an `embedding` `processing_queue` row for the file (`taskType: EMBEDDING_TASK_TYPE`, `modelVersion: EmbeddingService.getModelVersion()`) via `ProcessingQueueRepository.create`, guarded against stacking a duplicate active `embedding` row (reuse the `findByMediaFileId` active-row check from `ingestDiscovered`, `:365-372`).
- [x] 6.2 Add an embedding drain path: a `processEmbeddingNext()` selecting `getNextPendingByTaskType(EMBEDDING_TASK_TYPE)` (`ProcessingQueueRepository.ts:104-118`), calling `EmbeddingService.embed(buildSearchableText(...))` → `EmbeddingRepository.upsert` → `SemanticSearchService.upsertVector`, reusing `markAsProcessing`/`markAsCompleted`/`retry` and the version-aware skip guard (stale-by-`model_version`, `:205-214`).
- [x] 6.3 Compose an admission gate for the embedding drain from #5: always inherit thermal pause via `BackgroundTaskService` (already gained the thermal axis in #5); add `DeviceCapabilityService.canRunEmbeddings()` **(POC-DEPENDENT: reuse `canRunTier1()` vs. a lighter embedding-sized floor)** and skip the embed load when it fails closed, without affecting Tier-0.
- [x] 6.4 Drive the embedding drain as an **independent** stream that does not block Tier-0 (drain it after Tier-0 has no pending work, or as a separate lower-priority tick), so an embedding backlog never starves analysis (spec "Embedding is drained as an independent second stream").
- [x] 6.5 Hydrate `SemanticSearchService.loadIndex()` in `OrchestratorService.initialize` next to `SearchService.loadIndex()` (`OrchestratorService.ts:118`); ensure `removeByUri` (`:383-389`) also calls `SemanticSearchService.removeVector` so deletes drop the vector.

## 7. Search UI opts into hybrid

- [x] 7.1 Switch the search callers `SearchModeOverlay.tsx:86` and `MainScreen.tsx:81` from `SearchService.search` to the hybrid entry point; the `{id,score}[]` → `MediaFile` resolution downstream is unchanged.
- [x] 7.2 Ensure the initial-index bootstrap in those screens (`SearchModeOverlay.tsx:60-67`, `MainScreen.tsx:57-60`) also warms `SemanticSearchService.loadIndex()` so semantic ranking is available when vectors exist.

## 8. Verify (baseline-relative)

- [x] 8.1 `npx tsc --noEmit` reports exactly **8** errors (the pre-existing `TS6133` baseline) — ZERO new typecheck errors from this change.
- [x] 8.2 Metro-bundle check: `npx react-native bundle --platform ios --dev true --entry-file index.js --bundle-output /dev/null --assets-dest "$TMPDIR"` resolves the full JS graph (catches import/alias breakage `tsc` misses) with no unresolved-module errors.
- [x] 8.3 `npm run lint` (Biome) is clean on every new/edited file (tabs, double quotes, no `any`).
- [x] 8.4 `openspec validate semantic-search-embeddings --strict` passes.
- [x] 8.5 Confirm every **(POC-DEPENDENT)** item (model/dim/`model_version`, admission floor, RRF `k`/weights + score cutoff, `topK`) is behind a named constant and cross-referenced to the design "POC-dependent" section, so the post-POC re-tune touches constants only.
