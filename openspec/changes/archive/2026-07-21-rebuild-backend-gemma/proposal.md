# Proposal: rebuild-backend-gemma

## Why

The current backend is a half-migrated hybrid: a "tier" pipeline whose Gemma tier never ran (fail-closed placeholder SHA — zero photos ever processed by Gemma), an EfficientNet/CRAFT tier misleadingly named "mlkit", a MiniLM embedder that violates the product's Gemma-only direction, WatermelonDB + MiniSearch + MMKV-snapshot persistence with O(n²) index-rewrite behavior, and a discovery layer that marshals fat payloads, misses deletions entirely, and interleaves processing with discovery. Mid-2026 tech makes a decisively better stack possible: Gemma 4 E2B (Apr 2026, Apache-2.0, ungated, natively multimodal with OCR as a headline capability), EmbeddingGemma-300M, one battle-tested runtime for both (llama.cpp via llama.rn), and op-sqlite with FTS5 + sqlite-vec + reactive queries in a single SQLite file.

## What Changes

- **BREAKING (internal): delete the entire existing backend** — all of `src/services/**`, `src/models/**`, `src/utils/embeddings/**`, the MediaObserver and VisionTextRecognizer TurboModules — and rebuild as `src/backend/**` on new tech. The UI keeps compiling via a preserved contract surface (event unions, store seams, facade) with mechanical rewiring only.
- **Discovery-first (product change)**: on every launch the entire device library is discovered and visible in the gallery **before any ML processing starts**. Processing is hard-gated on discovery completion.
- **Gemma-only ML**: one llama.rn runtime executes Gemma 4 E2B-it QAT Q4_0 GGUF (+ mmproj) for caption + description + open-vocab tags + in-photo text (OCR) in a single JSON pass, and EmbeddingGemma-300M GGUF for 768→256d (MRL) semantic vectors. EfficientNet labeling, CRAFT/CRNN OCR, Apple Vision OCR fallback, and MiniLM embeddings are deleted, as are the engine registry and tier system.
- **New storage**: op-sqlite (exact-pin 17.1.1) with FTS5 + sqlite-vec compiled in; raw-SQL repositories; reactive invalidation feeding the existing `useVisibleMedia` hook shape; durable state (enrichment status/provenance) on rows instead of a parallel queue table + MMKV checkpoints.
- **New native discovery**: `MediaIndexer` TurboModule (existing VisaraSpecs codegen pipeline) — unsorted `PHAsset.fetchAssets` / single `ContentResolver.query` bulk scans streaming minimal records; cross-launch change tracking via `PHPersistentChangeToken` (iOS) and `MediaStore.getGeneration()` (Android) including **deletions** (the old module never emitted one); native `deleteAssets` via system confirmation flows; Android PDF scan parity.
- **Search**: hybrid FTS5 (bm25) + vec0 KNN fused by Reciprocal Rank Fusion computed in SQL; no persisted side-indexes, no `ensureSearchIndex` rebuild step; hidden-media leak fixed by construction (one SQL query path).
- **Background execution**: keep `react-native-background-actions` (dataSync FGS already declared) with checkpointed resume; drop `@notifee/react-native` (archived upstream) — the FGS's own notification is the only notification. iOS: foreground drain + keep-awake + checkpoint flush.
- **Dependency deletions**: `@nozbe/watermelondb`, `@nozbe/simdjson`, `minisearch`, `react-native-executorch`, `react-native-executorch-bare-resource-fetcher`, `@notifee/react-native`, `@react-native-camera-roll/camera-roll`, `react-native-quick-crypto`, `react-native-quick-base64`, `react-native-keychain` (dead `EncryptionService` deleted with them). iOS Podfile patch #3 (executorch OTHER_LDFLAGS) retires with executorch. **Additions**: `@op-engineering/op-sqlite`, `llama.rn`, `expo-keep-awake`.

## Capabilities

### New Capabilities
- `media-indexer-native`: MediaIndexer TurboModule contract — bulk scan, change tokens/deltas (incl. deletions), live observer, access request, asset deletion, PDF scan.
- `library-discovery-first`: library sync orchestration — full visibility before processing, reconcile, discovery-complete gate, live increments.
- `sqlite-storage-core`: op-sqlite database — schema, migrations, transactional writes, reactive invalidation, wipe-preserving-observers, provenance columns.
- `gemma-vision-enrichment`: single-pass Gemma 4 VLM enrichment — prompt/parse contract, image prep, statuses/retries, model-version provenance, runtime-agnostic engine seam.
- `gemma-embedding-index`: EmbeddingGemma semantic index — doc/query task prefixes, MRL truncation + renorm, vec0 lifecycle, model-version invalidation.
- `processing-pipeline`: gated checkpointed drain — admission gates (discovery-complete, model-ready, thermal, battery, saver, night), event contract (preserved `OrchestratorEvent` union), pause/resume/stop, crash recovery, reprocessing sweep, per-platform background execution.

### Modified Capabilities
- `hybrid-search`: rebuilt as FTS5 + sqlite-vec KNN with RRF in SQL; requirement set replaced wholesale.
- `gemma-model-delivery`: artifact set becomes three ungated GGUFs (VLM + mmproj + embedder) with pinned SHA-256s; delivery state contract preserved; requirement set replaced wholesale.
- `services-ui-facade`: facade expands (feed, metadata, wipe, delete-assets); `ensureSearchIndex` retired; requirement set replaced wholesale.
- `nitro-crypto-random`: crypto-random requirement removed with `react-native-quick-crypto` (dead code); vision-camera-absence requirement retained.
- `ui-state-management`, `search-experience`, `orchestrator-gallery-bridge`, `reprocessing-user-action`, `ai-model-settings`, `settings-experience`, `onboarding-model-step`: surgical deltas only where wording binds to deleted tech (WatermelonDB observables, ensureSearchIndex, LibraryReprocessingService, executorch variant labels); user-visible behavior otherwise unchanged.

### Removed Capabilities
- `analysis-engine-interface`, `analysis-engine-selection`, `mlkit-analysis-engine`, `gemma-multimodal-analysis-engine`, `tier0-executorch-engine`, `tier1-reprocessing-gate`, `apple-vision-ocr-fallback`, `ocr-parity-gate`, `executorch-runtime-integration`, `executorch-inference-gate`, `executorch-poc-screen`, `semantic-embeddings`, `semantic-embedding-generation`, `semantic-vector-search`, `pipeline-persistence-and-search`, `media-enrichment-schema`, `gemma-enrichment-persistence`, `label-provenance`, `database-migrations`, `processing-orchestrator`, `processing-queue-tiers`, `queue-drive-and-gating`, `library-reprocessing`, `device-capability-gating` — each superseded by the new capability set above (retirement deltas enumerate the mapping).

## Impact

- **Code**: `src/services/**`, `src/models/**`, `src/utils/embeddings/**` deleted; new `src/backend/**`; `src/native-modules/` loses MediaObserver + VisionTextRecognizer specs, gains MediaIndexer; Android `MediaObserverModule/Package` + iOS `MediaObserverModule.swift/.mm`, `VisionTextRecognizerModule.*` replaced by MediaIndexer implementations; ThermalObserver untouched.
- **UI rewiring (mechanical)**: `useVisibleMedia`, `photoActions`, `dataActions`, albums data hooks, bootstrap, onboarding model step, settings sections, search controller, devQaHooks — import-path and call-site updates against the preserved contracts.
- **Native build**: Podfile loses executorch/simdjson pods + patch #3; gains op-sqlite + llama.rn pods. Gradle loses WatermelonDB JSI; gains op-sqlite + llama.rn. iOS entitlement `com.apple.developer.kernel.increased-memory-limit` added.
- **Data**: no migration — old WatermelonDB file abandoned/deleted on first run of the new backend (library re-discovers in seconds; enrichment recomputes under the new Gemma models by design).
- **Specs**: 6 new capabilities, 12 modified, 24 removed.
- **Risk posture**: model downloads total ~4.2 GB (3.35 + 0.56 + 0.33); VLM gated to ≥5.5 GB RAM devices; Android inference CPU-first (GPU opportunistic later); emulator/simulator CPU paths keep end-to-end QA viable.
