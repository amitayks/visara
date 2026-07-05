# Tasks: rebuild-backend-gemma

## 1. De-risk: deps + models + inference POC (blocks everything)

- [x] 1.1 Add `@op-engineering/op-sqlite` (exact 17.1.1) with package.json feature config (sqliteVec, fts5, performanceMode), `llama.rn` (exact 0.12.5), `expo-keep-awake`; npm install; `pod install` — confirm all 4 existing Podfile patches still apply and the app still builds on both platforms BEFORE any code changes (deps-only commit).
- [x] 1.2 Download the three GGUF artifacts on the dev machine (VLM QAT Q4_0, mmproj Q8_0, EmbeddingGemma Q8_0), record exact URLs + byte sizes + SHA-256 digests → write `src/backend/model/manifest.ts` with real pins (no placeholders).
- [ ] 1.3 POC harness (dev-only script/screen behind `__DEV__`): initMultimodal with VLM+mmproj from a local path, run the enrichment prompt on a bundled test image on iOS simulator AND Android emulator; verify parseable JSON `{caption,description,tags,text}`; init embedder, embed a doc + query with task prefixes, verify 768-d output, MRL-truncate 256 + renorm. Record timings/RAM in the change notes. Resolve the Gemma-4 chat-template open question (design.md).
- [ ] 1.4 op-sqlite smoke: open DB with vec0 + FTS5 virtual tables, insert + KNN query + MATCH query on both platforms (proves the bundled extensions load).

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
- [ ] 3.4 Delete legacy modules: NativeMediaObserver.ts, NativeVisionTextRecognizer.ts, MediaObserverModule.(swift|mm), VisionTextRecognizerModule.*, MediaObserverModule.kt/Package, Android registrations; keep ThermalObserver untouched; both platforms compile.

## 4. Engines (`gemma-vision-enrichment`, `gemma-embedding-index`)

- [x] 4.1 `media/ImagePrep.ts` — toInferenceJpeg(uri) via image-resizer (≤896 px, q80, bounded temp dir, delete-after).
- [x] 4.2 `engine/GemmaVision.ts` — VisionEngine impl over llama.rn initMultimodal (lazy init from delivered paths, mutex, 120 s timeout + interrupt, release()); prompt from POC; parser (first balanced JSON, coercion, tag normalization, raw-as-caption fallback) as pure exported functions.
- [x] 4.3 `engine/GemmaEmbed.ts` — EmbedEngine impl (embedding:true context, doc/query task prefixes, MRL-256 + L2 renorm, resident lifecycle).

## 5. Model delivery v2 (`gemma-model-delivery`)

- [x] 5.1 `model/Delivery.ts` keeping name/contract `GemmaModelDeliveryService`: 3-artifact background-downloader acquisition (wifi-only default, disk preflight, per-artifact + aggregate progress), boot re-attach/adopt, streaming SHA-256 verify fail-closed, models/ dir + iOS backup exclusion, pause/resume/cancel/deleteModel, MMKV+fs-reconciled state, isReady().
- [ ] 5.2 Dev/QA adoption path verified: pre-placed valid files at target paths → initialize() adopts → ready (this is how emulator QA avoids 4.2 GB downloads).

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

- [ ] 11.1 Android emulator e2e: build+install; push test photos (adb + media scan) incl. one with printed text; pre-place model artifacts in app sandbox; drive: permission → discovery (all photos visible, pipeline idle until discovery-complete) → enable model → drain (caption/tags/text persisted) → lexical + semantic search return the right photo → hide/permanent-delete flows → relaunch reconcile (delete a photo via OS, verify purge). Use __visaraQA hooks + adb; fix until green.
- [ ] 11.2 iOS simulator e2e: xcodebuild + simctl boot/install; simctl addmedia test photos; same drive as 11.1 (ph:// URIs, limited-access spot check); fix until green.
- [ ] 11.3 Performance sanity on emulator/sim: discovery of a 100+ photo set completes < 5 s; grid scrolls; per-photo enrichment completes within timeout; record numbers in change notes.

## 12. Wrap-up

- [ ] 12.1 Update BACKLOG.md (retire stale entries: notifee watch, executorch pin, thumbnail-pipeline note updated; add future levers: LiteRT-LM adapter, GPU offload, WorkManager/BGProcessingTask lanes, mediaProcessing FGS type, PDF enrichment).
- [ ] 12.2 `openspec validate rebuild-backend-gemma` green; verify implementation matches specs (opsx:verify) → ready for archive.
