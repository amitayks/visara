> Ordered top-to-bottom; every group is agent-verifiable against the typecheck baseline (no native build needed — this is pure JS over the runtime #4 already integrated). BASELINE: `npm run typecheck` currently reports **8** pre-existing `TS6133` unused-symbol errors in 4 unrelated UI files (`AnimatedBottomNav.tsx`, `AlbumList.tsx`, `MainTemplate.tsx`, `OnboardingScreen.tsx`); every group below must keep that count at **8** (zero NEW typecheck errors). Conventions: Biome tabs / double quotes / `noExplicitAny: error`, strict TS, all-static services. **POC-DEPENDENT** tasks (tagged) must be re-tuned once #4's on-device Gemma POC reports real latency / quality / output shape.

## 1. Additive `ProcessingResult` extension (no runtime import)

- [x] 1.1 In `src/services/ml/ProcessingService.ts`, add and `export` a `GemmaTag` interface (`{ text: string; confidence?: number }`) and a `GemmaEnrichment` interface (`caption?`, `description?`, `tags: GemmaTag[]`, `ocrText?`, `raw?`) above `ProcessingResult`.
- [x] 1.2 Add a single optional field `gemma?: GemmaEnrichment` to the `ProcessingResult` interface. Do NOT change any existing field (all stay required) — the extension is purely additive so `MlKitEngine` and every existing consumer still conform.
- [x] 1.3 **(POC-DEPENDENT)** Leave a comment on `GemmaEnrichment` marking `confidence`, `ocrText`, `raw`, and the tag/caption field set as subject to the #4 POC output shape.
- [x] 1.4 `npm run typecheck` — count still **8** (an optional field breaks no existing consumer).

## 2. `GemmaMultimodalService` — the Tier-1 engine

- [x] 2.1 Add `src/services/ml/engines/GemmaMultimodalService.ts`, an all-static class matching `MlKitEngine`'s shape (static `descriptor`, static `analyze`). Import the imperative `LLMModule` and `models` (and `isAvailable`) from `react-native-executorch`; import `type { ProcessingResult, GemmaEnrichment }` from `@services/ml/ProcessingService`, `type { AnalysisEngineDescriptor }` from `./AnalysisEngine`, and `ThumbnailService` from `@services/media/ThumbnailService`. Do NOT import `react` or `useLLM` (spec: framework-agnostic).
- [x] 2.2 Declare `static readonly descriptor: AnalysisEngineDescriptor = { id: "gemma", tier: "tier1", capabilities: ["caption", "description", "tags"], modelVersion: <MODEL_VERSION> }`. **(POC-DEPENDENT)** finalize the `modelVersion` string (e.g. `"gemma4-e2b-multimodal-v0.9.0"`, tracking the `models.llm.gemma4_e2b_multimodal()` model source) and whether `"ocr"` is added to `capabilities`.
- [x] 2.3 Implement the lazy single-instance load: `private static llm: LLMModule | null` + `private static loadPromise: Promise<LLMModule> | null`; `private static async ensureLoaded()` returns the cached instance, else awaits the shared in-flight promise, else starts `LLMModule.fromModelName(models.llm.gemma4_e2b_multimodal())`, caches it, and clears `loadPromise` on settle. If `isAvailable === false`, throw (caught by `analyze` → `success: false`).
- [x] 2.4 Add a generation mutex: `private static inflight: Promise<unknown> | null` so concurrent `analyze` calls serialize onto one `generate` at a time (on-device LLM generation is single-threaded).
- [x] 2.5 Implement `static async analyze(imageUri: string): Promise<ProcessingResult>`: measure `startTime`; inside `try` → resolve a decodable `file://` via `ThumbnailService.getThumbnail(imageUri, "large")`, `await this.ensureLoaded()`, build the `Message[]` (system + a `user` message with `content` = the prompt and `mediaPath` = the `file://` path), run `generate(...)` under the mutex + timeout (task 2.7), parse (task 2.6), and return `{ imageLabeling: EMPTY, textRecognition: EMPTY, totalProcessingTime, success: true, gemma }`.
- [x] 2.6 **(POC-DEPENDENT)** Implement the prompt text and the output→`GemmaEnrichment` parser (caption + description + open-vocabulary tags, optional structured JSON). The parser MUST avoid `any` — parse to `unknown` and narrow with type guards (`noExplicitAny: error`). Keep the raw string in `gemma.raw` for debugging.
- [x] 2.7 **(POC-DEPENDENT)** Implement the per-image timeout: `Promise.race` the `generate(...)` against a timer of `<TIMEOUT_MS>`; on timeout call `llm.interrupt()` and route to the failure envelope. Tune `<TIMEOUT_MS>` to #4's measured on-device latency.
- [x] 2.8 Implement the resolve-never-reject fallback matching `MlKitEngine.ts:43-57`: on any thrown error / timeout / unavailable runtime, resolve `success: false` with `imageLabeling: { labels: [], processingTime: 0 }`, `textRecognition: { text: "", blocks: "[]", processingTime: 0 }`, a computed `totalProcessingTime`, and a non-empty `error` (thrown message or a stable string). Do NOT attach a partial `gemma` on failure.
- [x] 2.9 Add a `static dispose()` that calls `LLMModule.delete()` and nulls the handle (memory release seam for #5/#10). Do not call it anywhere in this change.
- [x] 2.10 `npm run typecheck` — count still **8**; confirm no `any` and no `react`/`useLLM` import in the file.

## 3. Register the engine in `EngineRegistry`

- [x] 3.1 In `src/services/ml/engines/EngineRegistry.ts`, import `GemmaMultimodalService` and add `EngineRegistry.register(GemmaMultimodalService)` beside the existing `EngineRegistry.register(MlKitEngine)` seed (`:27`). Keep the import one-directional (registry → service; the service does NOT import the registry) to avoid a cycle.
- [x] 3.2 Confirm the seam is inert for Tier-0: do NOT call `ProcessingService.setEngine(...)`, do NOT touch `OrchestratorService`, and add no `tier1_gemma` handling. `getDefault()` still returns `MlKitEngine`.
- [x] 3.3 `npm run typecheck` — count still **8**; sanity-check that `getById("gemma")` and `getByTier("tier1")` would now resolve `GemmaMultimodalService` (type-level).

## 4. Additive Gemma persistence (`MediaFileRepository`)

- [x] 4.1 In `src/services/database/MediaFileRepository.ts`, export a `TIER1_SCHEMA_VERSION` constant (parallel to `TIER0_SCHEMA_VERSION`, `:33`). **(POC-DEPENDENT)** its value tracks the finalized `GemmaEnrichment` output contract.
- [x] 4.2 Add `static async applyGemmaEnrichment(mediaFile, gemma: GemmaEnrichment, provenance: ProcessingProvenance)`: in one `database.write`, set `caption`, `description`, `aiModelVersion = provenance.modelVersion`, `aiSchemaVersion = provenance.schemaVersion`, `processedAt = new Date()`, `isProcessed = true` (preserving `is_processed === (processed_at !== null)`).
- [x] 4.3 In the same method, replace ONLY `source = "gemma"` labels: fetch `Q.where("media_file_id", id)` + `Q.where("source", "gemma")`, `markAsDeleted()` those, then create the new tags as `source = "gemma"`, `type = "tag"`, `model_version = provenance.modelVersion`. Do NOT delete `source = "mlkit"` rows (contrast `updateWithProcessingResult.ts:314-342`, which deletes all).
- [x] 4.4 Do NOT modify `createWithProcessingResult` / `updateWithProcessingResult` (they keep hard-coding `source = "mlkit"`), and do NOT call `applyGemmaEnrichment` from `OrchestratorService` — it is the unwired seam #10 invokes.
- [x] 4.5 `npm run typecheck` — count still **8**.

## 5. POC re-tune checklist (do after #4's on-device Gemma POC)

- [ ] 5.1 **(POC-DEPENDENT)** Re-tune, from the POC's real output: the prompt (2.6), the parser + structured-JSON schema (2.6), the `GemmaEnrichment` field set (1.1) + whether tags mirror into `imageLabeling.labels`, `capabilities`/`ocr` (2.2), `<TIMEOUT_MS>` (2.7), `<MODEL_VERSION>` (2.2), and `TIER1_SCHEMA_VERSION` (4.1).
- [ ] 5.2 **(POC-DEPENDENT)** Re-confirm the imperative `LLMModule` path returns equivalent output to #4's `useLLM` POC on the same image (they share the `LLMController` + native runtime).

## 6. Verify — baseline-relative

- [x] 6.1 `npm run typecheck` (`tsc --noEmit`) reports exactly **8** errors — the pre-existing baseline, ZERO new.
- [x] 6.2 Metro bundle check — `npx react-native bundle --platform ios --dev true --entry-file index.js --bundle-output "$TMPDIR/visara.gemma.jsbundle" --reset-cache` (and/or `--platform android`) completes successfully, proving the new module graph (`GemmaMultimodalService` → `react-native-executorch` imperative `LLMModule`, the `EngineRegistry` seed, and the `MediaFileRepository` edit) resolves and bundles.
- [x] 6.3 `npm run lint` (Biome) is clean on every new/edited file (tabs, double quotes, no `any`).
- [x] 6.4 `openspec validate gemma-multimodal-analysis-engine --strict` passes.
