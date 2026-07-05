# Design: rebuild-backend-gemma

## Context

Visara is an offline-first RN 0.86 (new arch, bridgeless) photo app; Android minSdk/target 36 (arm64-only), iOS deployment target 26.0, Expo 57 modules, Hermes. The UI layer was rebuilt 2026-07-04 (Visara DS + Zustand + native stack) and consumes the backend through a deliberately narrow surface: `facade.ts` (searchMedia/removeMedia/ensureSearchIndex), `OrchestratorService.subscribe/getSnapshot` → `processingStore.applyEvent`, `GemmaModelDeliveryService.subscribe` → `modelStore`, `MediaFileRepository.observeVisible()` → `useVisibleMedia`, album repos, `photoActions.loadMediaMetadata`, settings `dataActions`. Full recon of the old backend (8-agent workflow, 2026-07-05) is summarized in `proposal.md`; the load-bearing conclusions: the Gemma tier never ran, deletions are never detected, index persistence is O(n²), and search can leak hidden media through the semantic path.

Verified externally (2026-07-05): Gemma 4 E2B-it (Apr 2026) is ungated Apache-2.0 with official QAT Q4_0 GGUF + day-one llama.cpp support and OCR as a headline capability; EmbeddingGemma-300M GGUFs are ungated on `ggml-org`/`unsloth` mirrors; llama.rn 0.12.5 (Jun 2026) supports multimodal (`initMultimodal` + mmproj) and embeddings (`embedding: true`) on RN new arch; op-sqlite 17.1.1 (Jun 2026) bundles sqlite-vec + FTS5 + reactive queries; react-native-executorch has NO EmbeddingGemma in any version (checked 0.10 nightly registry); notifee is archived upstream.

## Goals / Non-Goals

**Goals:**
1. Every photo on the device is visible in the gallery before any ML runs — on first launch within seconds, on every launch thereafter instantly from the DB reconciled by change tokens.
2. All ML is Gemma-family: Gemma 4 E2B (vision: caption/description/tags/OCR) + EmbeddingGemma-300M (vectors). One runtime (llama.rn).
3. One SQLite file is the single source of truth: metadata, enrichment, FTS, vectors, durable pipeline state; reactive queries feed the existing UI hooks.
4. The UI keeps compiling with mechanical rewiring only — event unions, delivery-state contract, row field names, store seams preserved.
5. 100% verified: typecheck, lint, jest, plus booted end-to-end on Android emulator and iOS simulator via CLI (discovery → grid → enrichment → search).

**Non-Goals:**
- No data migration from the old WatermelonDB file (abandon + delete; re-discover and re-enrich).
- No Android GPU inference tuning (CPU-first; OpenCL/Hexagon later), no LiteRT-LM/executorch adapters (seam documented, not built).
- No PDF enrichment (PDFs discoverable/searchable by filename, `skipped` status), no video enrichment (videos discoverable, excluded from pipeline v1).
- No iOS BGProcessingTask/BGContinuedProcessingTask overnight lanes (documented future).
- No thumbnail file pipeline (expo-image renders platform URIs directly, as today).

## Decisions

**D1 — Single ML runtime: llama.rn 0.12.5 (llama.cpp).** Alternatives: (a) keep react-native-executorch 0.9.2 `gemma4_e2b_multimodal` (.pte MLX/Vulkan) + llama.rn only for embeddings; (b) react-native-litert-lm 0.4.2 (LiteRT-LM) + llama.rn. Rejected because: (a) the RNE Gemma path was never proven on-device in this app (placeholder SHA, no POC), Android is Vulkan-only in 0.9.2 stable (emulator CLI verification would be blocked; XNNPACK MM exists only in 0.10-nightly), and it keeps two runtimes plus Podfile patch #3; (b) bets the only vision path on a 43-star single-maintainer wrapper over an "early preview" Swift API. llama.rn is needed for EmbeddingGemma regardless (Gemma-only mandate; RNE has no EmbeddingGemma), llama.cpp is the most battle-tested Gemma 4 deployment target, and CPU fallback runs everywhere including arm64 emulator/simulator (HVF ≈ native speed), which the verification mandate depends on. The engine seam (`VisionEngine`/`EmbedEngine` interfaces) is runtime-agnostic so LiteRT-LM or executorch 0.10+ can be adapters later.

**D2 — Models.** VLM: `google/gemma-4-E2B-it-qat-q4_0-gguf` (official Google QAT, ungated, 3.35 GB) + `ggml-org/gemma-4-E2B-it-GGUF` mmproj Q8_0 (0.56 GB). Embedder: `ggml-org/embeddinggemma-300M-GGUF` Q8_0 (0.33 GB). Exact URLs + SHA-256 pinned in `manifest.ts` at implementation time (downloaded once, hashed, hardcoded — fail-closed like the old design but actually pinned). Alternatives: unsloth Q4_K_M (3.11 GB, smaller but non-official quant); litertlm 2.59 GB (needs LiteRT runtime). E4B variants documented as a future quality lever for high-RAM devices.

**D3 — VLM prompt/parse contract.** One generation per photo: system+user prompt requesting exactly one JSON object `{caption, description, tags[], text}` (`text` = transcription of any legible in-photo text, empty string if none). Parser: extract first `{...}` block, JSON.parse with schema coercion (missing keys defaulted, tags lowercased/deduped/capped at 16); on unparseable output, whole raw string becomes caption (parity with old fallback). Per-image timeout 120 s → `interrupt()` → failed status. Images decoded to `file://` JPEG ≤ 896 px longest edge (image-resizer) in a bounded temp dir, deleted after inference (llama.cpp reads no `content://`/`ph://`).

**D4 — Embeddings.** EmbeddingGemma with model-card task prefixes: documents embedded as `title: none | text: {caption. description. tags. ocr}`, queries as `task: search result | query: {q}`. 768d output → MRL-truncate to 256 → L2 renormalize → store `float[256]` in vec0 (102 MB @ 100k; <100 ms brute KNN @ 50k per sqlite.ai bench ×2–4 mobile factor). int8/bit quantization deferred (lock-in risk; float[256] is simple and fits). Embedder stays resident (~<200 MB); embedding happens inline after each VLM item (search improves per-photo) and at query time.

**D5 — Storage.** op-sqlite exact-pin 17.1.1, package.json `"op-sqlite": {"sqliteVec": true, "fts5": true, "performanceMode": true}`. Raw SQL repositories — no drizzle (v1 RC churn; cannot model vec0/FTS5 DDL anyway). Schema v1 (`PRAGMA user_version`):
- `media(id TEXT PK, uri TEXT UNIQUE NOT NULL, filename TEXT, mime TEXT, width INT, height INT, size INT, taken_at INT, added_at INT, kind TEXT CHECK(kind IN ('image','video','pdf')), hidden INT DEFAULT 0, favorite INT DEFAULT 0, deleted INT DEFAULT 0, enrich_status TEXT DEFAULT 'pending' CHECK(enrich_status IN ('pending','processing','done','failed','skipped')), enrich_error TEXT, retry_count INT DEFAULT 0, model_version TEXT, processed_at INT)` + indexes on `(deleted, hidden, taken_at DESC)`, `(enrich_status, kind)`, `uri`.
- `enrichment(media_id TEXT PK REFERENCES media(id) ON DELETE CASCADE, caption TEXT, description TEXT, tags TEXT /*json array*/, ocr_text TEXT, duration_ms INT)`.
- `media_fts` FTS5(`caption, description, tags, ocr_text, filename`, `tokenize='unicode61 remove_diacritics 2'`, contentless-delete or external-content on enrichment JOIN media; sync via repository writes in the same transaction — plus a `rebuildFts()` escape hatch).
- `vec_media` vec0(`media_id TEXT PRIMARY KEY, embedding float[256] distance_metric=cosine`) + `embedding_meta(media_id TEXT PK, model_version TEXT)` (vec0 metadata columns for version kept outside for simplicity; bundled sqlite-vec is 0.1.9-era: re-embed = DELETE+INSERT in one tx, never INSERT OR REPLACE).
- `albums(id TEXT PK, name TEXT, is_smart INT, smart_tag TEXT, sort_order INT, created_at INT)`, `album_media(album_id, media_id, sort_order, added_at, PK(album_id, media_id))`.
- `sync_state(key TEXT PK, value TEXT)` — change tokens, checkpoints, counters.
Unique-tag chips/smart albums via `SELECT DISTINCT je.value FROM enrichment, json_each(enrichment.tags) je`. All multi-row writes via `executeBatch`/explicit transactions. WAL mode.

**D6 — Reactivity.** A tiny invalidation bus in JS: repositories `notify('media'|'enrichment'|'albums')` after commit; `watchQuery(tables, runQuery)` re-runs on notification with 250 ms trailing throttle (matches old `useVisibleMedia` cadence). A `RowCache` keyed by id reuses the previous row object when all consumed fields are unchanged → reference-stable rows → existing `React.memo` cells keep working. op-sqlite's built-in reactive queries are an implementation option behind the same `watchQuery` seam, not a contract.

**D7 — MediaIndexer TurboModule** (VisaraSpecs codegen; Swift + Kotlin; MediaObserver/VisionTextRecognizer deleted). API:
- `fullScan(batchSize)` → events `indexer_batch {items: MediaItem[]}` + `indexer_scan_complete {total, token}`; MediaItem = `{id, uri, filename, mime, kind, width, height, size, takenAt}` (minimal, the 163 MB-OOM lesson). iOS: `PHAsset.fetchAssets` with NO predicate/NO sortDescriptors (near-instant @ 140k), enumerate cached keys only, in-memory sort by creationDate desc, KVC `filename`; ph:// URIs. Android: single `ContentResolver.query` (images ∪ videos), projection `[_ID, DISPLAY_NAME, MIME_TYPE, SIZE, DATE_TAKEN, DATE_ADDED, WIDTH, HEIGHT]`, `DATE_TAKEN DESC`, cached column indices; `content://` URIs; `DATE_TAKEN` NULL→`DATE_ADDED*1000` fallback.
- `changesSince(token)` → `{added: MediaItem[], updated: MediaItem[], deletedIds: string[], newToken, full?: boolean}`. iOS: `PHPhotoLibrary.fetchPersistentChanges(since:)` (iOS 16+; floor 26) mapping inserted/updated/deleted identifiers; `changeHistoryExpired` → `full: true` (caller runs fullScan + DB reconcile — routine, not exceptional). Android: `MediaStore.getVersion()` mismatch → `full: true`; else `GENERATION_ADDED/GENERATION_MODIFIED > lastGen` queries + `_ID`-only sweep diffed natively against a caller-provided known-id list? — no: deletions computed in JS by diffing the `_ID`-only sweep (cheap: 50k longs) against DB ids. Token = opaque JSON `{v, generation}` / `{changeToken: base64}`.
- `observe(throttleMs)`/`stopObserving()`: PHPhotoLibraryChangeObserver / debounced ContentObserver → emits `indexer_changed {}` (a poke; JS responds with `changesSince` — one delta path, no second contract).
- `requestAccess()` → `granted|limited|denied`; `getAccessStatus()`.
- `deleteAssets(ids)` → Promise (iOS `PHAssetChangeRequest.deleteAssets`; Android `MediaStore.createDeleteRequest` via ActivityResult) — replaces RNFS.unlink, enables dropping camera-roll.
- `pdfScan()` (Android only) → same batch events with `kind:'pdf'` (Files URI, mime filter).
Nitro rejected deliberately: call overhead is irrelevant at ~25 batch events and nitrogen adds a new codegen toolchain; the win is the query/token design, which is runtime-independent.

**D8 — Library sync (discovery-first).** `LibrarySync.start()` on boot after permission: if DB empty (or `full` flagged) → `fullScan` streaming `upsertBatch` (INSERT ON CONFLICT(uri) UPDATE metadata, never touching enrichment state) → on `scan_complete`: reconcile (DB ids − seen ids → purge rows/enrichment/vectors/FTS), persist token, set `discovery_complete=1` for this session, emit `scan-progress`/`discovery-complete` events. Else → `changesSince(token)` → apply deltas → discovery-complete. Then `observe()` for live pokes while foregrounded (2 s throttle). The pipeline's admission gate requires discovery-complete **every session** — processing never races discovery (the product mandate).

**D9 — Pipeline.** Single drain (no tiers), state on `media` rows. Admission gates evaluated between items: discovery-complete ∧ delivery.isReady ∧ enabled ∧ RAM-capability ∧ thermal < serious ∧ (charging ∨ battery > 20%) ∧ ¬saver-blocked ∧ ¬night-window-blocked ∧ ¬manual-pause. Selection: `WHERE enrich_status='pending' AND kind='image' AND deleted=0 ORDER BY taken_at DESC LIMIT 1`; stale `processing` rows reset to `pending` at start (crash recovery). Per item: ImagePrep → VisionEngine.analyze → same-tx persist (enrichment + FTS + status/provenance) → EmbedEngine.embedDoc → vec upsert → events `item-processed`/`progress`. Failure → `retry_count+1`, ≥2 → `failed` + `item-failed`. Event union preserved verbatim from `OrchestratorEvent` (+ `discovery-complete` added member consumed only by new code; `processingStore.applyEvent` untouched). Runs inside `BackgroundTaskService`-equivalent wrapper over react-native-background-actions (dataSync FGS, its own progress notification, no notifee); iOS drain runs foregrounded with expo-keep-awake active while processing, checkpoint is implicit (row statuses are the checkpoint — MMKV checkpoint blobs deleted). Reprocess: `UPDATE media SET enrich_status='pending' WHERE model_version IS NOT current OR enrich_status='failed'` + vec invalidation by model_version; exposed as one `Pipeline.reprocess()` (settings action parity).

**D10 — VLM lifecycle & capability gate.** VLM context initialized lazily at first drained item, released on `stop()`/app-background/critical-thermal (llama.rn `release()`); mutex serializes generations; embedder context resident from first use (query + index share the space). Capability: `totalMemory ≥ 5.5 GB` → VLM pipeline eligible; below → enrichment disabled (`skipped` at admission, UI copy in settings), discovery/lexical search fully functional. iOS entitlement `com.apple.developer.kernel.increased-memory-limit` added to the app target.

**D11 — Delivery v2.** Keep `GemmaModelDeliveryService` name + `DeliveryState` contract (modelStore/onboarding untouched). Three artifacts (VLM, mmproj, embedder GGUF) via `@kesha-antonov/react-native-background-downloader` into `DocumentDir/models/` — resumable, Wi-Fi-only default, boot re-attach, disk-space preflight, per-artifact + aggregate progress, pinned SHA-256 verified streaming post-download (fail-closed; real digests pinned during implementation). `isReady()` = all three present + verified + enabled. Delete = remove files + state reset. (bare-resource-fetcher pre-place dance dies with executorch.)

**D12 — Search.** `searchMedia(q)`: run FTS5 `MATCH` (tokens AND-joined with trailing `*` prefix on last token; bm25 weights caption 4 / tags 3 / ocr 2 / description 1 / filename 1) LIMIT 80 and, when embedder ready, `vec_media MATCH embedQuery(q) AND k=80`; fuse via RRF (k=60) in one SQL statement (CTEs + FULL OUTER JOIN), filter `hidden=0 AND deleted=0` at the outer SELECT (leak fixed structurally), hydrate ordered rows. Degradation ladder: no vectors → lexical-only; no enrichment yet → filename matches still hit (FTS row written at discovery? no — FTS rows exist only post-enrichment; filename fallback = `media.filename LIKE` union arm until enriched). `suggest(prefix)` = distinct tags + filenames. No index persistence, no ensureSearchIndex (facade keeps an async no-op shim during rewiring, then the call sites drop it).

**D13 — Facade & rewiring map.** New `src/backend/facade.ts` exports: `searchMedia`, `removeMedia({permanent})` (permanent → `MediaIndexer.deleteAssets`), `loadMediaMetadata(id)` (labels=tags, ocrText, caption, description), `wipeAllData()` (delete rows keep schema, observers stay alive), `getGalleryFeed()`/`useVisibleMedia` (same hook name/shape re-exported), album functions (old repo surface), `Pipeline` + `GemmaModelDeliveryService` + `ThermalService` re-exports. UI diffs are import-path + small call-signature updates only; `MediaRow` provides `id, uri, filename, mimeType, creationDate, isHidden, isProcessed, width, height, fileSize` (aliased getters over snake_case columns) so cells/viewer compile unchanged.

**D14 — Deletion & purge semantics.** `removeMedia` non-permanent = hide row (`hidden=1`) — parity with old "remove from app". Permanent = OS-level `deleteAssets` (system dialog) → on success purge row + enrichment + FTS + vector in one tx. Reconcile-detected deletions purge identically. `wipeAllData` truncates media/enrichment/vec/FTS/album_media (albums shells kept, settings kept) — matches old dataActions contract.

## Risks / Trade-offs

- [Gemma 4 E2B Q4 RAM peak (PLE not skippable in GGUF) may exceed mid-tier headroom] → 5.5 GB gate, VLM released on background/thermal-critical, iOS increased-memory entitlement, E2B-only (no E4B) v1.
- [Android CPU-only captioning 8–20 s/photo on weaker SoCs] → newest-first ordering (recent photos enrich first), persistent resume, honest ETA copy in settings; GPU offload documented future.
- [llama.rn Gemma-4 vision quality/format quirks unproven in-app] → task 0 of implementation is a smoke POC on both simulators before the pipeline lands (fail → adjust prompt/quant before building on it).
- [sqlite-vec pre-v1, bundled build 0.1.9-era] → vec access isolated in `VectorRepo` (DELETE+INSERT, no OR REPLACE); brute-force only; swap-out seam documented.
- [FTS5 external-content drift] → FTS writes only inside repository transactions + `rebuildFts()` escape hatch invoked after wipe/reprocess.
- [Android 15/16 6 h background FGS cap] → row-status checkpointing makes stop/resume free; timer resets on foreground; WorkManager overnight lane = documented future.
- [Play Console FGS declaration (dataSync) already granted for this app; type change would re-trigger review] → keep dataSync v1 (policy text covers local processing), mediaProcessing migration documented.
- [iOS limited-library mode returns only selected assets] → status surfaced (`limited`), discovery proceeds over selection, change observer catches selection edits (existing product stance).
- [Reference-stability regression risk in grid] → RowCache + jest test asserting unchanged rows keep identity across emissions.
- [4.2 GB total download] → Wi-Fi-only default, resumable, per-artifact progress, disk preflight (≥ 6 GB free).

## Migration Plan

1. Land new backend + rewiring in one change (old backend deleted in the same commit series — no coexistence).
2. First boot after update: old `watermelon.db` file deleted if present; DB v1 created; full discovery repopulates in seconds; enrichment restarts from `pending` (intended — new models).
3. MMKV: backend-owned keys (`search_index`, `semantic_index`, `processing_checkpoint`, `reprocess_checkpoint`) deleted at boot once; settings keys untouched.
4. Rollback = git revert (no persisted-format compatibility to preserve; DB file namespaced `visara-v2.db`).

## Open Questions

- Exact GGUF SHA-256s + final URLs (pinned during implementation after one verified download).
- Gemma 4 chat-template handling in llama.rn `initMultimodal` (template auto-detected from GGUF metadata vs explicit) — resolved in the POC task.
- Whether FTS5 filename-arm makes the pre-enrichment `LIKE` union unnecessary (decide when wiring: index filename into FTS at discovery-time with empty enrichment columns).
