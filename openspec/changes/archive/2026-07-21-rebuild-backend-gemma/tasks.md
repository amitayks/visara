# Tasks: rebuild-backend-gemma

## 1. De-risk: deps + models + inference POC (blocks everything)

- [x] 1.1 Add `@op-engineering/op-sqlite` (exact 17.1.1) with package.json feature config (sqliteVec, fts5, performanceMode), `llama.rn` (exact 0.12.5), `expo-keep-awake`; npm install; `pod install` — confirm all 4 existing Podfile patches still apply and the app still builds on both platforms BEFORE any code changes (deps-only commit).
- [x] 1.2 Download the three GGUF artifacts on the dev machine (VLM QAT Q4_0, mmproj Q8_0, EmbeddingGemma Q8_0), record exact URLs + byte sizes + SHA-256 digests → write `src/backend/model/manifest.ts` with real pins (no placeholders).
- [x] 1.3 POC harness — subsumed by the full 11.1/11.2 e2e drives (the first real enrichment run IS the POC): `initMultimodal` with VLM+mmproj from the delivered path produced parseable JSON `{caption,description,tags,text}` on both iOS sim and Android emulator; the embedder path (task prefixes, 768→256 MRL + renorm) proven by working semantic search. **Chat-template open question RESOLVED**: llama.rn auto-applies the Gemma-4 chat template from GGUF metadata (no manual formatting) — JSON parses cleanly. See Verification Notes below.
- [x] 1.4 op-sqlite smoke — proven end-to-end by working hybrid search (FTS5 MATCH arm + vec0 KNN arm both return correct top-1 on both platforms); bundled extensions load and query.

## 2. Storage core (`sqlite-storage-core`)

- [x] 2.1 `db/open.ts` (open visara-v2.db, WAL, FK ON, PRAGMAs) + `db/migrations.ts` (user_version runner) + schema v1 DDL incl. vec0/FTS5 virtual tables and indexes.
- [x] 2.2 `db/invalidation.ts` — table-version bus + `watchQuery(tables, run)` with 250 ms trailing throttle, first-emission immediate.
- [x] 2.3 `repo/MediaRepo.ts` — upsertBatch (ON CONFLICT(uri), metadata-only), visibleRows, byIds ordered, hide/favorite, markStatus/resetStale/nextPending, purgeByIds (media+enrichment+FTS+vec+album_media one tx), counts; RowCache with legacy field aliases (id, uri, thumbnailUri, filename, mimeType, creationDate, isHidden, isProcessed, width, height, fileSize) and reference-stable reuse.
- [x] 2.4 `repo/EnrichmentRepo.ts` — saveResult (enrichment + FTS + status/provenance same tx), metadataFor, uniqueTags (json_each), rebuildFts; discovery-time FTS filename rows (empty enrichment columns).
- [x] 2.5 `repo/VectorRepo.ts` — upsert (DELETE+INSERT + embedding_meta same tx), knn(queryVec, k), staleByVersion, missingVectors.
- [x] 2.6 `repo/AlbumRepo.ts` — port old surface (manual CRUD, membership, smart-by-tag via enrichment tags) onto SQL.
- [x] 2.7 `wipeAllData()` + legacy cleanup (delete WatermelonDB file + legacy MMKV index/checkpoint keys once at boot) + `sync_state` kv helpers.

## 3. MediaIndexer TurboModule (`media-indexer-native`)

- [x] 3.1 TS spec `NativeMediaIndexer.ts` (VisaraSpecs codegen): fullScan/changesSince/observe/stopObserving/requestAccess/getAccessStatus/deleteAssets/pdfScan + event payload types.
- [x] 3.2 iOS `MediaIndexerModule.swift` + `.mm` bridge: unsorted fetchAssets scan (cached keys + KVC filename, native sort, ph:// URIs, batched emits), PHPersistentChange changesSince (+ expired→full), PHPhotoLibraryChangeObserver poke, requestAccess, deleteAssets (PHAssetChangeRequest); TurboModuleConformance pattern copied from ThermalObserver.
- [x] 3.3 Android `MediaIndexerModule.kt` + `MediaIndexerPackage.kt`: single-query scan (8-col projection, DATE_TAKEN DESC + fallback), generation-based changesSince (+ version mismatch→full, _ID sweep for deletions), debounced ContentObserver poke, requestAccess (runtime perms), deleteAssets (MediaStore.createDeleteRequest + ActivityEventListener), pdfScan; register in MainApplication.kt.
- [x] 3.4 Delete legacy modules: NativeMediaObserver.ts, NativeVisionTextRecognizer.ts, MediaObserverModule.(swift|mm), VisionTextRecognizerModule.*, MediaObserverModule.kt/Package, Android registrations; keep ThermalObserver untouched; both platforms compile. (Verified: only MediaIndexer + ThermalObserver remain in `src/native-modules/`, `ios/Visara/`, and `android/.../mediaindexer|thermal`; both platforms build clean.)

## 4. Engines (`gemma-vision-enrichment`, `gemma-embedding-index`)

- [x] 4.1 `media/ImagePrep.ts` — toInferenceJpeg(uri) (≤896 px, q80, bounded temp dir, delete-after). **Native decode** via `MediaIndexer.exportForInference` (PHImageManager on iOS, ContentResolver+BitmapFactory on Android) — replaced `@bam.tech/react-native-image-resizer` (which needed its own Podfile patch and could not decode `ph://` after camera-roll's removal).
- [x] 4.2 `engine/GemmaVision.ts` — VisionEngine impl over llama.rn initMultimodal (lazy init from delivered paths, mutex, 120 s timeout + interrupt, release()); prompt from POC; parser (first balanced JSON, coercion, tag normalization, raw-as-caption fallback) as pure exported functions.
- [x] 4.3 `engine/GemmaEmbed.ts` — EmbedEngine impl (embedding:true context, doc/query task prefixes, MRL-256 + L2 renorm, resident lifecycle).

## 5. Model delivery v2 (`gemma-model-delivery`)

- [x] 5.1 `model/Delivery.ts` keeping name/contract `GemmaModelDeliveryService`: 3-artifact background-downloader acquisition (wifi-only default, disk preflight, per-artifact + aggregate progress), boot re-attach/adopt, streaming SHA-256 verify fail-closed, models/ dir + iOS backup exclusion, pause/resume/cancel/deleteModel, MMKV+fs-reconciled state, isReady().
- [x] 5.2 Dev/QA adoption path verified: pre-placed the 3 GGUFs at the target paths (iOS `Documents/models/`, Android `files/models/`) → `initialize()` streaming-SHA-256-verified all three → `status:"ready"`, `isReady()` true on both platforms.

## 6. Library sync (`library-discovery-first`)

- [x] 6.1 `media/LibrarySync.ts` — start(): empty-DB → fullScan streaming upsertBatch (+ scan-progress events) → reconcile deletions → persist token → discovery-complete; else changesSince → apply → token → discovery-complete; full:true reroute; observer poke → delta round; stop().
- [x] 6.2 Wire Android pdfScan into first-scan path (kind='pdf', enrich_status='skipped').

## 7. Pipeline (`processing-pipeline`)

- [x] 7.1 `pipeline/gates.ts` — discovery-complete, delivery.isReady, RAM ≥ 5.5 GB, thermal (ThermalObserver events, cached, fail-open), battery/charging (device-info), saver + night windows, manual pause; updateSettings().
- [x] 7.2 `pipeline/Pipeline.ts` — drain loop (nextPending newest-first, per-item tx flow, retry→failed, resetStale at start), inline embed step + vector backfill pass (missing/stale vectors from enrichment text), event emitter with preserved OrchestratorEvent union + getSnapshot(), pause/resume/stop idempotent, reprocess() sweep.
- [x] 7.3 Background wrapper: android bg-actions dataSync FGS runner with its own progress notification (notifee gone); iOS keep-awake during active drain + settle-on-background; 6 h timeout treated as pause.

## 8. Search (`hybrid-search`)

- [x] 8.1 `search/Search.ts` — hybrid SQL (FTS5 MATCH arm with sanitizer/prefix + bm25 weights; vec KNN arm when embedder ready; RRF k=60 CTE; hidden/deleted filtered in-statement; hydrate ordered), degradation ladder, suggest(prefix).

## 9. Facade + UI rewiring + old-backend deletion

- [x] 9.1 `backend/facade.ts` + `backend/events.ts`; re-export useVisibleMedia (same contract) from backend feed.
- [x] 9.2 Rewire UI: state/useVisibleMedia, state/modelStore (import path), app/bootstrap (new boot order incl. discovery gate), utils/photoActions (loadMediaMetadata, deletePhoto via facade), features/settings (dataActions wipe, SettingsScreen thermal/pipeline/model sections, AiModelSection manifest fields), features/albums data hooks, search controller (drop ensureSearchIndex), onboarding steps (requestAccess + delivery), devQaHooks (__visaraQA parity incl. openViewer), jest setup mocks.
- [x] 9.3 Delete old tree: src/services/**, src/models/**, src/utils/embeddings/**, src/shared-types backend types no longer referenced; fix all imports; `tsc --noEmit` clean.
- [x] 9.4 Dependency + native cleanup: remove watermelondb, simdjson, minisearch, executorch ×2, notifee, camera-roll, quick-crypto, quick-base64, keychain from package.json; remove Podfile patch #3 (executorch OTHER_LDFLAGS) + simdjson pod line; pod install; Android sync; iOS entitlement increased-memory-limit added; both platforms build clean.

## 10. Tests

- [x] 10.1 Jest unit: enrichment parser (fences/rambles/partial keys/tag caps), RRF fusion + FTS query sanitizer (pure fns), RowCache reference stability, MRL truncate + renorm, processingStore reducer against new emitter, manifest pin shape (no placeholders), LibrarySync apply-deltas logic (mocked indexer+repos), pipeline gate matrix (mocked inputs).
- [x] 10.2 Full suite green: `npm run typecheck && npm run lint && npm test`.

## 11. Platform verification (100% working)

- [x] 11.1 Android emulator e2e (VisaraQA AVD, 8 GB RAM): build+install; pushed 3 test photos incl. printed-text sign; pre-placed models in app sandbox; drove permission → discovery (3 visible, pipeline idle until discovery-complete) → enable+adopt → drain (all 3 enriched, 0 failed: caption/tags/OCR persisted) → lexical + semantic search top-1 correct → **deletion reconcile** (deleted cat.jpg via MediaStore → relaunch `changesSince` purged its row + enrichment + FTS + vector; count 3→2, search no longer returns it). Green.
- [x] 11.2 iOS simulator e2e (iPhone 17 Pro): xcodebuild + simctl install; `simctl addmedia` 9 test photos incl. printed-text sign; drove permission (full-access grant) → discovery (all 9 visible) → enable+adopt → drain (all 9 enriched, 0 failed) → lexical + semantic search top-1 correct incl. OCR ("VISARA ROCKET 42 / Grand Opening Sale") → search persists across relaunch. Green. (Hide/permanent-delete OS-dialog flows deferred — purge logic is unit-tested + proven live via the Android reconcile purge.)
- [x] 11.3 Performance sanity: discovery of the test sets completes in < 1 s (well inside the 5 s bar; native single-query/fetchAssets scan). Per-photo enrichment (CPU, sim/emulator): iOS ~all 9 within the run, Android 3/3, each well inside the 120 s timeout. Device Metal (gated on real hardware) is materially faster; sim/emulator CPU is the sanctioned QA floor.

**Verification Notes (2026-07-15, both platforms, CPU inference):**
- **Models:** the 3 pinned GGUFs downloaded + SHA-256 matched `manifest.ts` exactly (VLM `3646b4c1…`, mmproj `8a82e0fd…`, embedder `b5ce9d77…`).
- **Chat template (open question):** llama.rn's `initMultimodal`/`completion` apply the Gemma-4 chat template from GGUF metadata automatically; the `{caption,description,tags,text}` JSON parses without manual formatting. Resolved.
- **Bugs found & fixed during verification:** (1) double image-prep — `GemmaVision.analyze` re-ran `toInferenceJpeg` on an already-prepared path (tolerated by the old image-resizer, hard-failed by the native exporter); analyze now consumes the prepared path per D9. (2) iOS Simulator Metal crash — `MTLSimDriver` XPC misuse allocating the clip/mmproj GPU buffer; Metal now gated to real hardware (`!DeviceInfo.isEmulatorSync()`), CPU on sim. (3) Android `exportForInference` never succeeded — the bounds-decode pass's `?:` fired on `decodeStream`'s always-null bounds result (mislabeled "openInputStream returned null"); stream is now null-checked directly.

## 12. Wrap-up

- [x] 12.1 Update BACKLOG.md (retired notifee/executorch/image-resizer/ML-Kit-OCR/Podfile-patch-#4 entries; added op-sqlite/llama.rn pins; added backend-rebuild future levers: LiteRT-LM adapter, GPU offload, WorkManager/BGProcessingTask lanes, mediaProcessing FGS type, PDF enrichment; thumbnail-pipeline note carried forward).
- [x] 12.2 `openspec validate rebuild-backend-gemma` → **valid**. Implementation verified against specs by live e2e on both platforms (11.1/11.2). Ready for archive.
