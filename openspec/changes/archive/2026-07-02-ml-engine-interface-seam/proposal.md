## Why

Visara's Tier-0 analysis is hard-wired into `ProcessingService.processMedia`, which value-imports two concrete ML Kit services (`ProcessingService.ts:2-3`) and runs them itself via `Promise.all([ImageLabelingService.processImage, TextRecognitionService.extractText])` (`ProcessingService.ts:34-37`). There is no seam between "orchestrate an analysis pass" and "which engine produces the analysis," so the upcoming ML→Gemma-4 migration cannot introduce a Tier-1 multimodal enrichment engine (caption/description/open-vocab tags) without editing the orchestrator, and cannot A/B or swap runtimes without touching callers. This is Wave-A foundation #2: the database was made Gemma-ready in change #1 (archived `2026-07-01-db-migrations-and-gemma-schema`); this change makes the *analysis producer* runtime-agnostic and tiered so ML Kit today and Gemma-4 tomorrow are swappable without touching callers, DB, search, or UI.

## What Changes

- **Introduce an `AnalysisEngine` seam** (new `src/services/ml/engines/AnalysisEngine.ts`): a runtime-agnostic `image → analysis` producer contract — a single `analyze(imageUri): Promise<ProcessingResult>` plus a static `descriptor` advertising the engine's tier and capabilities. A tiered/capability taxonomy (`AnalysisTier` = `tier0` | `tier1`; `AnalysisCapability` = `labels` | `ocr` | `caption` | `description` | `tags`) anticipates Tier-0 (fast literal OCR + labels) and Tier-1 (Gemma enrichment) without implementing Gemma.
- **Provide the default engine now** (new `src/services/ml/engines/MlKitEngine.ts`): an all-static `MlKitEngine` that wraps the CURRENT behavior exactly — the same `Promise.all` of `ImageLabelingService.processImage` + `TextRecognitionService.extractText`, the same timing, the same `success`/`error` fallback (`ProcessingService.ts:27-71` moved verbatim). Its descriptor is `id: "mlkit"`, `tier: "tier0"`, `capabilities: ["labels", "ocr"]`.
- **Add a small engine registry/selector** (new `src/services/ml/engines/EngineRegistry.ts`): an all-static registry that resolves engines by `id` and by `tier` and exposes a Tier-0 default, seeded with `MlKitEngine`. This is the selection seam a later Gemma wave registers `Tier-1` against; the default hot path stays Tier-0.
- **Refactor `ProcessingService.processMedia` to DELEGATE** (`src/services/ml/ProcessingService.ts`): hold a configured `private static engine: AnalysisEngine` (defaulting to `MlKitEngine`), make `processMedia` a thin `return this.engine.analyze(imageUri)`, and add `setEngine`/`getEngine` for swap/test. Remove the two concrete value imports; keep the `ProcessingResult` declaration and its `import type` dependencies so the exported contract is unchanged.
- **Keep the `ProcessingResult` contract byte-for-byte** so the sole external consumer `MediaFileRepository` (`MediaFileRepository.ts:5,173,226`) and all runtime behavior are unchanged. The new descriptor/provenance types are designed to carry change #1's additive fields later (`media_files.caption`/`description`/`ai_model_version`; `labels.source`/`type`) — but NO Gemma producers, NO new fields on `ProcessingResult`, and NO write-path changes ship in this wave.
- **Pure refactor + interface introduction:** zero behavior change, no new npm dependency, no native code. NOT breaking.

## Capabilities

### New Capabilities
- `analysis-engine-interface`: a runtime-agnostic, tiered `AnalysisEngine` abstraction — a producer that takes an image URI and returns a `ProcessingResult`, described by a static tier + capability descriptor, with an additive-ready result/provenance contract.
- `mlkit-analysis-engine`: the default Tier-0 `MlKitEngine` (all-static) that reproduces today's ML Kit labels + OCR pass byte-for-byte behind the `AnalysisEngine` interface, advertising `tier0` / `["labels", "ocr"]`.
- `analysis-engine-selection`: `ProcessingService.processMedia` delegates to a configured engine resolved via a registry/selector (by `id`/`tier`, default Tier-0), so engines are swappable at runtime without touching callers, the DB, search, or UI.

### Modified Capabilities
<!-- None. openspec/specs/ contains only the change #1 database capabilities (database-migrations, label-provenance, media-enrichment-schema, processing-queue-tiers, semantic-embeddings); no existing spec governs ProcessingService or the ML analysis producers, so no requirement changes. -->

## Impact

- **Code (new):** `src/services/ml/engines/AnalysisEngine.ts`, `src/services/ml/engines/MlKitEngine.ts`, `src/services/ml/engines/EngineRegistry.ts`.
- **Code (edited):** `src/services/ml/ProcessingService.ts` — delegation + configured engine; the `Promise.all` body and its `ImageLabelingService`/`TextRecognitionService` value imports move into `MlKitEngine`; `ProcessingResult` stays declared/exported here unchanged.
- **Contract:** `ProcessingResult` unchanged; `MediaFileRepository.createWithProcessingResult`/`updateWithProcessingResult` (`MediaFileRepository.ts:173,226`) and their `import type { ProcessingResult } from "@services/ml/ProcessingService"` (`MediaFileRepository.ts:5`) compile and run identically. `ImageLabelingService`/`TextRecognitionService` public APIs untouched.
- **Dependencies:** none added — `@react-native-ml-kit/image-labeling@^2.0.0` and `@react-native-ml-kit/text-recognition@^2.0.0` are reused via the existing services. No path-alias change: the engine files live under the existing `@services/*` alias (`tsconfig.json`/`babel.config.js`); no `@shared-types` entry is added.
- **Conventions:** Biome (tabs, double quotes), `noExplicitAny: error`, all-static service classes (`noStaticOnlyClass: off`), strict TS (`noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`).
- **Out of scope (later waves):** the Gemma/Tier-1 engine and its inference, caption/description/tags producers, populating `ProcessingResult` with enrichment fields, sourcing `labels.source`/`type` from the descriptor, and tier-aware queue scheduling.
