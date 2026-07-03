## Context

Visara's search is lexical only. `SearchService` (`src/services/search/SearchService.ts`) builds a MiniSearch token index over three fields — `filename`, `labels`, `ocrText` (`:28-39`) — persists it to MMKV under `STORAGE_KEYS.SEARCH_INDEX`, hydrates it via `loadIndex()` (`:172-194`), and updates it incrementally per processed file via `addToIndex(mediaFileId)` (`:77-109`, called from `OrchestratorService.processNext`, `OrchestratorService.ts:225`). Consumers (`SearchModeOverlay.tsx:86`, `MainScreen.tsx:81`) call `SearchService.search(query)`, get `{id, score}[]`, and resolve `MediaFile`s by id. Lexical recall cannot satisfy the onboarding promise "Search photos with natural language" (`OnboardingScreen.tsx:49`) for paraphrase/conceptual queries.

Foundation #1 already shipped the vector **storage** but no producer or consumer:
- `embeddings` table — `media_file_id` (indexed), `vector` (string), `dim` (number), `model_version` (string), `created_at` — `schema.ts:104-113`; `Embedding` model `src/models/Embedding.ts`; registered `database.ts:33`. There is **no `EmbeddingRepository` yet** (the only DB model without one).
- The archived `semantic-embeddings` spec (`openspec/specs/semantic-embeddings/spec.md`) already mandates: serialized-string vector payload with `dim` recording the length for read-time validation, and `model_version` for stale-vector invalidation/re-embed.
- The archived `processing-queue-tiers` spec (`:7`) already reserves `"embedding"` as an example `task_type`; `ProcessingQueueRepository.getNextPendingByTaskType` (`:104-118`) already selects per-tier with priority-desc/created_at-asc ordering — the orchestrator drains only `tier0_mlkit` today (`OrchestratorService.ts:22,185-191`), and `OrchestratorService.ts:21` notes "Tier-1 (Gemma) enqueues a different value later".

**Runtime facts that drive the design** (`react-native-executorch@0.9.2`, `package.json`, verified in `node_modules`):
- Two APIs: the React hook `useTextEmbeddings({ model })` **and** the non-React module class `TextEmbeddingsModule.fromModelName({ modelName, modelSource, tokenizerSource })` — both expose `forward(input: string): Promise<Float32Array>` (`types/textEmbeddings.d.ts`, `modules/.../TextEmbeddingsModule.d.ts`). The module class is what an all-static, React-free background service must use.
- Built-in `text_embedding` registry: `all-minilm-l6-v2` (**384-dim**), `all-mpnet-base-v2` (768), `multi-qa-minilm-l6-cos-v1`, `paraphrase-multilingual-minilm-l12-v2`, `clip-vit-base-patch32-text`, etc. **No EmbeddingGemma** in the pinned `0.9.2`. Custom models go through `TextEmbeddingsModule.fromCustomModel(...)`, whose native tensor contract the lib docs call "not formally defined and may change between releases."
- Every executorch-model assumption inherits #4's on-device GO/NO-GO (`executorch-runtime-bootstrap`); this change adds an embedding-specific POC on top.

Constraints: all-static services, strict TS, `noExplicitAny: error`, Biome tabs/double-quotes, legacy decorators, `@services`/`@models`/`@shared-types` aliases. WatermelonDB runs on its own bundled SQLite via a JSI adapter (`database.ts:14-21`).

## Goals / Non-Goals

**Goals:**
- Generate one on-device text embedding per media file from its assembled searchable text, persisted to the #1 `embeddings` table, as a durable queued `embedding` pass driven by the #3 orchestrator and gated by #5.
- Provide a semantic retrieval path (cosine/kNN) over those vectors that is fast for realistic library sizes and hydrated/persisted the same way the lexical index already is.
- Augment — never replace — the lexical `SearchService` with a hybrid re-rank that fulfills the natural-language-search promise and degrades to lexical-only when vectors are absent.
- Keep every executorch-model-specific parameter (model, dim, latency/quality thresholds, admission floor) clearly isolated and flagged for POC re-tuning.

**Non-Goals:**
- Choosing the final production embedding model, dim, or `model_version` string — POC-decided (D2).
- Image/CLIP visual embeddings (`useImageEmbeddings`/`clip-vit-base-patch32-image` exist but are out of scope; this wave is text-embedding of enrichment text). Cross-modal image-vector search is a future wave.
- A native `sqlite-vec` layer (designed and recommended-against for now; flagged as an escape hatch, D5).
- Changing `SearchService.search`'s lexical behavior/signature, or the Tier-0/Tier-1 analysis contracts.
- Producing `caption`/`description` — that is #7's job; this change consumes whatever enrichment text exists.

## Decisions

### D1: The background embed pass uses the non-React `TextEmbeddingsModule`, wrapped in an all-static `EmbeddingService`

The embed pass runs inside the orchestrator's background drain (`BackgroundTaskService`), which has no React tree — so the `useTextEmbeddings` **hook** is unusable there. Use `TextEmbeddingsModule.fromModelName(...)` (returns an instance with `forward(input): Promise<Float32Array>`) behind a new all-static `EmbeddingService` that lazy-loads the module once, keeps it resident, exposes `embed(text): Promise<Float32Array>`, and mirrors the `try`-guarded native-availability pattern of `MediaDiscoveryService` (fail-soft when the runtime/model is unavailable). This matches every sibling all-static service and the #4/#5 service shape.

**Alternatives:** the `useTextEmbeddings` hook driving a hidden React component — rejected; it couples a background data pass to the view tree and to `isReady` render timing. A per-call load/unload of the module — rejected; model init dominates latency, so keep it resident.

### D2: Concrete model = `all-minilm-l6-v2` (384-dim); EmbeddingGemma is aspirational — **model/dim/`model_version` are POC-dependent**

The pinned `0.9.2` registry has no EmbeddingGemma; its strongest general sentence-embedding preset is `all-minilm-l6-v2` (384-dim, ~90 MB) — small, fast, and a proven retrieval baseline. Adopt it as the concrete default: `model_version = "all-minilm-l6-v2@1"` (id + a Visara revision suffix so re-quantization/re-export bumps it). EmbeddingGemma (or a larger MPNet/multilingual preset) would go through `fromCustomModel(...)`, whose contract the lib flags as unstable — **out of scope until proven**. The **final model, its output `dim`, and the `model_version` string are POC-decided** (latency/quality/size on real hardware); the schema (`dim` column + read-time length validation) already absorbs a dim change without migration.

**Alternatives:** `all-mpnet-base-v2` (768-dim, higher quality, ~2× vector size + slower) — revisit if MiniLM recall is inadequate at POC. Multilingual presets — only if the user base needs them. EmbeddingGemma via custom export — deferred (unstable contract, larger).

### D3: Embed one vector per file from the same searchable text the lexical index uses (DRY)

Assemble the file's text exactly as `SearchService.addToIndex` already does — `caption` + `description` + `labels` (joined) + OCR text + `filename` (`SearchService.ts:83-96`, plus the #1 `caption`/`description` columns) — into one document string, embed it to **one vector per file** (per `model_version`). Extract a shared `buildSearchableText(mediaFileId): Promise<string>` used by **both** `SearchService.addToIndex` and `EmbeddingService`, so lexical and semantic views never drift. One vector keeps the retrieval matrix simple; per-field/multi-vector embeddings are a flagged future option.

**Alternatives:** separate vectors per field (caption vs OCR) with field-weighted scoring — more expressive but multiplies storage/compute and complicates the matrix; deferred. Embedding raw pixels — that is CLIP/image-embedding scope (Non-Goal).

### D4: Serialize L2-normalized Float32 bytes as base64; store `dim`; validate on read

`forward` yields a `Float32Array`. **L2-normalize at write time** so retrieval cosine similarity reduces to a plain dot product (no per-query norm). Serialize the normalized buffer as **base64 of the raw Float32 bytes** (`dim*4` bytes → ~1.33× — compact, exact) into `embeddings.vector`; store `dim`; on read, assert `decoded.length === dim` (the archived spec's "Dimension matches decoded vector length" scenario). Base64-bytes over JSON-number-array: ~3× smaller and lossless. A new `EmbeddingRepository` owns encode/decode + the replace-in-place upsert (the table has a model but no repository).

**Alternatives:** JSON number array — human-readable but bloated/lossy at float edges; rejected. Storing unnormalized + normalizing per query — wastes per-query cycles; rejected.

### D5: **Storage/index = in-JS cosine over a cached, normalized Float32 matrix. Recommend against `sqlite-vec` for now (escape hatch).**

The `embeddings` table (SQLite) is the **source of truth**. For retrieval, hydrate a single contiguous **`Float32Array` matrix** (N×dim) + a parallel `id[]` once, cache it in memory, and persist a compact snapshot to MMKV under `STORAGE_KEYS.SEMANTIC_INDEX` — exactly mirroring how `SearchService` caches MiniSearch in memory + MMKV and rebuilds via `index()`/`loadIndex()` (`SearchService.ts:41-75,166-194`). Update it incrementally per embed (an `upsertVector(id, vec)` analogous to `addToIndex`). A query is: embed the query string → one linear pass of `dim` multiply-adds per row → partial top-k.

Why in-JS wins here:
- **Cost is small at Visara's scale.** 384-dim dot = 384 MACs/row. N=10k ≈ 3.8M MACs/query (single-digit ms in a tight Float32Array loop under Hermes/JSI); N=50k ≈ 19M (tens of ms). The dominant cost is one-time hydration, not per-query — and hydration is amortized like the lexical index.
- **Memory is bounded.** N·dim·4 bytes: 50k×384 ≈ 75 MB in one ArrayBuffer — acceptable and freeable; flagged as the pressure point for very large libraries.
- **Zero native surface.** WatermelonDB uses its own bundled SQLite via the JSI adapter (`database.ts:14-21`) and exposes **no extension-load API**. `sqlite-vec` would require either a custom-compiled SQLite with the extension statically linked (native build changes on both platforms under the newest-only arm64 floors) or a **second** SQLite connection (e.g. op-sqlite) — a new native dependency, a duplicate DB handle to keep in sync, and iOS/Android build work — heavy for a first-party gallery whose libraries are realistically thousands-to-low-tens-of-thousands.

**`sqlite-vec` escape hatch (flagged):** if telemetry shows libraries >~100k vectors or query latency/memory regresses, move retrieval behind an interface whose in-JS implementation is swapped for a native `sqlite-vec` kNN (disk-backed ANN, no full-matrix RAM). Keep the retrieval API storage-agnostic from day one so the swap is local.

**Alternatives:** in-JS HNSW/ANN library — extra dep + index-build complexity for marginal gain at this N; rejected until the linear scan is proven too slow. Recompute from the table every query (no cache) — deserialization per query dominates; rejected.

### D6: Gating rides #5 — thermal pause is inherited; admission floor is **POC-dependent**

The embedding drain runs through `BackgroundTaskService.start` (like the Tier-0 drain, `OrchestratorService.maybeStartDrain`, `:399-413`), so #5's thermal pause axis in `shouldPauseProcessing` already pauses it under heat — "gated by #5" for runtime pressure, no new code. For **model admission**, compose #5's primitives (`DeviceCapabilityService`/`ThermalService`). Tension: `canRunTier1()` requires a 6 GiB RAM + 6 GiB disk floor sized for Gemma's 3–4 GB — but a ~90 MB MiniLM does not need that, and gating embeddings behind Tier-1 eligibility would deny semantic search to exactly the low-end, Tier-0-only devices that benefit most (they still have labels+OCR to embed). **Recommendation:** add a lighter `canRunEmbeddings()` composed from the same #5 signals with an embedding-sized floor (much lower RAM/disk), plus the thermal Tier-1 threshold. **The exact floor, and whether to reuse `canRunTier1()` verbatim vs. a new lighter check, are POC-dependent** on the chosen model's measured footprint.

**Alternatives:** reuse `canRunTier1()` as-is — simplest, but over-restricts light-device semantic search; rejected as default, kept as the conservative fallback if the POC model turns out heavy. No admission gate (rely only on thermal) — risks OOM on the weakest devices; rejected.

### D7: Hybrid = Reciprocal Rank Fusion, additive to `SearchService`, degrading to lexical-only

Add a hybrid entry point (`searchHybrid(query)` or a `{ semantic: true }` option) that runs the lexical `SearchService.search` **and** `SemanticSearchService.search` in parallel and fuses their ranked id lists with **Reciprocal Rank Fusion** (`score = Σ 1/(k + rank)`), because MiniSearch's BM25-ish scores and cosine's 0..1 scores are not directly comparable — RRF fuses by **rank**, needs only a single `k`, and is robust to that scale mismatch. `SearchService.search`'s lexical signature/behavior is untouched; consumers (`SearchModeOverlay.tsx:86`, `MainScreen.tsx:81`) switch to the hybrid call and still receive `{id, score}[]`. **Graceful degradation:** if the semantic model/vector cache is unavailable (POC not GO, model still downloading, ineligible device), the hybrid returns pure lexical results — the promise softens to keyword search rather than failing.

**Alternatives:** normalized weighted-sum fusion (`α·lexical + (1-α)·cosine`) — needs score normalization + a tuned `α`; offered as the tunable alternative if RRF ranking proves too coarse. Semantic-only — loses exact filename/OCR precision and strands unembedded files; rejected.

### D8: Orchestrator wiring — enqueue after enrichment persist, drain as an independent third stream

Enqueue an `embedding` `processing_queue` row (`taskType = EMBEDDING_TASK_TYPE`, `modelVersion = <embedding model_version>`) when a file's searchable text is ready — after the Tier-0 persist in `processNext` (`OrchestratorService.ts:219-234`), and re-enqueued after a #7 Tier-1 enrichment persist so richer caption/description text is re-embedded. Drain it as a **separate stream**: a second tick path calling `getNextPendingByTaskType(EMBEDDING_TASK_TYPE)` and `EmbeddingService.embed` → `EmbeddingRepository` upsert → `SemanticSearchService.upsertVector`, mirroring the Tier-0 tick and reusing the same markProcessing/markCompleted/retry machinery. Independent selection guarantees an embedding backlog never blocks Tier-0 (the archived `processing-orchestrator` "tier-aware and forward-compatible" requirement, now made concrete). Ordering: embeddings are lower priority than analysis so a fresh library becomes browsable/lexically-searchable first, then semantically.

**Alternatives:** embed synchronously inside the Tier-0 persist — couples two model runtimes in one hot item and blocks the gallery; rejected. A wholly separate scheduler outside the orchestrator — violates the #3 "single entry point" invariant; rejected.

### D9: Idempotency and stale re-embed via `model_version` (one current vector per file)

Keep **one current vector per (media_file, model_version)**. Re-embedding replaces in place (delete-then-create for that file, like the label/OCR replace pattern) — never accumulates. A file is **stale** (re-enqueue an `embedding` task) when its enrichment text changed (Tier-1 re-run) **or** the active embedding `model_version` differs from the stored row's (the archived `semantic-embeddings` "Identify stale embeddings" scenario). Re-embedding at the same `model_version` over unchanged text is a no-op skip, matching the orchestrator's version-aware skip guard (`OrchestratorService.ts:205-214`).

### D10: Query-side embedding + cold start

The query path embeds the user's query string with the **same** resident `EmbeddingService` module (same `model_version` as the stored vectors — mismatched spaces are incomparable). First query after launch may pay model load; until `isReady`, the hybrid transparently falls back to lexical-only (D7). Query embedding of one short string is a single fast `forward` once loaded. The UI query path may use `useTextEmbeddings` (React) or the shared static `EmbeddingService`; prefer the shared static service so query and index vectors are guaranteed same-model.

## Risks / Trade-offs

- **Embedding model may not run on-device / dim differs from assumed** (inherits #4 gate) → all model-facing params are isolated behind `EmbeddingService` + `model_version`; `dim` is stored per-row and validated on read, so a POC dim change needs no migration. Persistent failure ⇒ semantic search stays dark and hybrid degrades to lexical (no regression).
- **In-JS linear scan memory/latency at very large N** (75 MB @ 50k×384) → bounded and acceptable at target scale; the storage-agnostic retrieval API lets `sqlite-vec` replace the scan if telemetry demands (D5).
- **Lexical/semantic index drift** → single shared `buildSearchableText` feeds both; both upsert on the same orchestrator persist boundary (D3, D8).
- **Score-scale mismatch in fusion** → RRF fuses by rank, not raw score (D7); weighted-sum is the flagged fallback.
- **Over-gating light devices** → dedicated lighter `canRunEmbeddings()` so Tier-0-only devices still get semantic search over labels+OCR (D6); floor is POC-tuned.
- **First-run model download** (executorch resource fetcher) → reuse #4's Wi-Fi/download handling; the embed drain is background + #5-gated, so a slow download never blocks the UI.
- **Two resident model runtimes (#7 Gemma + embeddings)** → embeddings are lower priority and thermally paused with the shared drain; sequence embeddings after analysis so they never contend with a live Tier-1 pass on a hot device.

## Migration Plan

Additive and low-blast-radius — no schema migration (the `embeddings` table + columns already exist at v2; MMKV keys are new):
1. `EmbeddingRepository` (encode/decode base64 Float32 + replace-in-place upsert + stale query by `model_version`) over the existing table.
2. `EmbeddingService` (all-static; `TextEmbeddingsModule.fromModelName`, resident, fail-soft) + shared `buildSearchableText` extraction from `SearchService`.
3. `SemanticSearchService` (matrix cache hydrate/persist/upsert + cosine/kNN) behind a storage-agnostic retrieval interface.
4. Hybrid combiner (RRF) as an additive `SearchService` entry point; switch `SearchModeOverlay`/`MainScreen` to it with lexical-only fallback.
5. Orchestrator: enqueue `embedding` post-persist + drain the `embedding` stream; compose `canRunEmbeddings()` from #5.
6. Verify baseline-relative (typecheck 8, Metro bundle, lint).

**Rollback:** trivial — the embedding stream is a distinct `task_type` and the hybrid is an additive entry point. Reverting to `SearchService.search` restores exact prior behavior; orphan `embeddings` rows are harmless and ignored.

## POC-dependent (must be re-tuned after the on-device embedding POC / #4 gate)

- **Model + `dim` + `model_version`** (D2): `all-minilm-l6-v2@1`/384 is the placeholder; final model, output dim, and version string are POC-decided.
- **Admission floor** (D6): reuse `canRunTier1()` vs. a lighter `canRunEmbeddings()` and its exact RAM/disk floor — set from the chosen model's measured footprint.
- **Fusion** (D7): RRF `k` vs. weighted-sum `α`, and the minimum semantic score/rank cutoff for inclusion — set from real score distributions.
- **Storage crossover** (D5): the N / latency / memory point at which `sqlite-vec` replaces the in-JS scan — set from real library-size + latency telemetry.
- **Drain throughput** (D8): embedding batch size / priority relative to Tier-0/Tier-1 — set from measured per-embed latency.
- **Query cold-start budget** (D10): acceptable model-load delay before the lexical-only fallback is shown.

## Open Questions

- Does #7 land before this change (so `caption`/`description` exist to embed), or do we ship semantic search over Tier-0 text (labels+OCR+filename) first and let quality rise as enrichment fills in?
- Is the `#4` embedding POC folded into #4's existing POC screen, or a separate embedding-specific proof (it is a different model + a non-multimodal path)?
- Single whole-document vector (D3) vs. per-field vectors — revisit if MiniLM whole-doc recall is weak at POC.
- Multilingual libraries — does the default model need a multilingual preset (affects D2)?
