## 1. Define the AnalysisEngine seam (`src/services/ml/engines/AnalysisEngine.ts`)

- [x] 1.1 Create `src/services/ml/engines/AnalysisEngine.ts` (new folder `engines/` under the existing `@services/*` alias; no `tsconfig.json`/`babel.config.js` change).
- [x] 1.2 Export `export type AnalysisTier = "tier0" | "tier1";`.
- [x] 1.3 Export `export type AnalysisCapability = "labels" | "ocr" | "caption" | "description" | "tags";`.
- [x] 1.4 Export `interface AnalysisEngineDescriptor` with `readonly id: string;`, `readonly tier: AnalysisTier;`, `readonly capabilities: readonly AnalysisCapability[];`, and `readonly modelVersion?: string;`.
- [x] 1.5 Export `interface AnalysisEngine` with `readonly descriptor: AnalysisEngineDescriptor;` and `analyze(imageUri: string): Promise<ProcessingResult>;`, importing `ProcessingResult` type-only: `import type { ProcessingResult } from "../ProcessingService";`.
- [x] 1.6 Add no `any` (respect `noExplicitAny`) and no `biome-ignore` header (this file declares only types/interfaces; `noStaticOnlyClass` is off globally so no suppression is needed).

## 2. Implement the default Tier-0 engine (`src/services/ml/engines/MlKitEngine.ts`)

- [x] 2.1 Create `src/services/ml/engines/MlKitEngine.ts`.
- [x] 2.2 Import values `import { ImageLabelingService } from "../ImageLabelingService";` and `import { TextRecognitionService } from "../TextRecognitionService";`; import types `import type { ImageLabelingResult } from "../ImageLabelingService";`, `import type { TextRecognitionResult } from "../TextRecognitionService";`, `import type { ProcessingResult } from "../ProcessingService";`, and `import type { AnalysisEngineDescriptor } from "./AnalysisEngine";`. Do NOT import `@react-native-ml-kit/*` directly.
- [x] 2.3 Declare `export class MlKitEngine` with `static readonly descriptor: AnalysisEngineDescriptor = { id: "mlkit", tier: "tier0", capabilities: ["labels", "ocr"] };` (no `modelVersion`).
- [x] 2.4 Implement `static async analyze(imageUri: string): Promise<ProcessingResult>` by moving the body of the current `ProcessingService.processMedia` (`ProcessingService.ts:28-70`) VERBATIM: the `startTime`, the `imageLabelingResult`/`textRecognitionResult` nullable locals, the `Promise.all([ImageLabelingService.processImage(imageUri), TextRecognitionService.extractText(imageUri)])`, the `success: true` return with `totalProcessingTime`, and the `catch` returning `success: false` with the exact fallbacks `imageLabeling: { labels: [], processingTime: 0 }` / `textRecognition: { text: "", blocks: "[]", processingTime: 0 }` and `error: error instanceof Error ? error.message : "Unknown processing error"`.
- [x] 2.5 Update ONLY the internal diagnostic label to `console.error("MlKitEngine.analyze error:", error);` (the sole textual change; it is console-only and outside the `ProcessingResult` contract). Do not change any returned value.
- [x] 2.6 Do not add a `biome-ignore` header (rule is off globally) and add no npm dependency, native code, or path alias.

## 3. Implement the registry/selector (`src/services/ml/engines/EngineRegistry.ts`)

- [x] 3.1 Create `src/services/ml/engines/EngineRegistry.ts`; `import type { AnalysisEngine, AnalysisTier } from "./AnalysisEngine";` and `import { MlKitEngine } from "./MlKitEngine";`.
- [x] 3.2 Declare `export class EngineRegistry` (all-static) with a `private static readonly byId = new Map<string, AnalysisEngine>();`, `static register(engine: AnalysisEngine): void` (keys by `engine.descriptor.id`), `static getById(id: string): AnalysisEngine | undefined`, `static getByTier(tier: AnalysisTier): AnalysisEngine[]` (filter by `descriptor.tier`), and `static getDefault(): AnalysisEngine`.
- [x] 3.3 Seed the registry at module load by registering `MlKitEngine` (typed as `AnalysisEngine`, which enforces its static-side conformance here) and have `getDefault()` return the Tier-0 default (`MlKitEngine`).
- [x] 3.4 Ensure `getDefault()` cannot return `undefined` (return the seeded Tier-0 default directly, or assert non-null after seeding) so its return type is `AnalysisEngine`, not `AnalysisEngine | undefined`.

## 4. Refactor ProcessingService to delegate (`src/services/ml/ProcessingService.ts`)

- [x] 4.1 Remove the two VALUE imports `import { ImageLabelingService } from "./ImageLabelingService";` and `import { TextRecognitionService } from "./TextRecognitionService";` (`ProcessingService.ts:2-3`).
- [x] 4.2 KEEP the two type imports `import type { ImageLabelingResult } from "./ImageLabelingService";` and `import type { TextRecognitionResult } from "./TextRecognitionService";` (still referenced by the `ProcessingResult` interface).
- [x] 4.3 Add `import { MlKitEngine } from "./engines/MlKitEngine";` and `import type { AnalysisEngine } from "./engines/AnalysisEngine";`.
- [x] 4.4 Leave the `ProcessingResult` interface (`ProcessingService.ts:7-13`) and its `export` UNCHANGED so `@services/ml/ProcessingService` stays the import path for `MediaFileRepository`.
- [x] 4.5 Add `private static engine: AnalysisEngine = MlKitEngine;` to the class (this assignment enforces `MlKitEngine`'s conformance).
- [x] 4.6 Replace the entire `processMedia` body (`ProcessingService.ts:28-70`) with `return this.engine.analyze(imageUri);`, keeping the signature `static async processMedia(imageUri: string): Promise<ProcessingResult>`.
- [x] 4.7 Add `static setEngine(engine: AnalysisEngine): void { this.engine = engine; }` and `static getEngine(): AnalysisEngine { return this.engine; }`.
- [x] 4.8 Leave `QueueItem`, `addToQueue`, `processQueue`, `clearQueue`, `getQueueLength`, `isQueueProcessing`, `setMaxRetries`, and the existing top-of-file `biome-ignore-all` header UNCHANGED.

## 5. Parity and consistency checks

- [x] 5.1 Diff the moved code: confirm `MlKitEngine.analyze` reproduces the prior `processMedia` body exactly (same `Promise.all` operands and order, same `success: true` shape, same fallbacks, same `error` mapping), with the only difference being the `console.error` label from task 2.5.
- [x] 5.2 Confirm `src/services/database/MediaFileRepository.ts` is untouched: it still uses `import type { ProcessingResult } from "@services/ml/ProcessingService"` (`MediaFileRepository.ts:5`) and still hard-codes `label.source = "mlkit"` / `label.type = "tag"` in `createWithProcessingResult`/`updateWithProcessingResult`.
- [x] 5.3 Confirm no new npm dependency (`package.json` unchanged), no native code, and no alias change (`tsconfig.json`/`babel.config.js` unchanged).
- [x] 5.4 Confirm conformance is enforced only at use sites (`EngineRegistry` registration + `ProcessingService.engine` field) with NO throwaway `const _c: AnalysisEngine = …` local (would trip `noUnusedLocals`), and that no file introduces `any`.
- [x] 5.5 Confirm the runtime import graph is acyclic: engines import `ProcessingResult` type-only (erased under `isolatedModules`), so the only runtime edges are `ProcessingService → MlKitEngine → { ImageLabelingService, TextRecognitionService }` and `EngineRegistry → MlKitEngine`.

## 6. Verification (zero new errors; touched files clean)

- [x] 6.1 Record the pre-change baseline: run `npm run typecheck` on a clean tree first and note the ~8 pre-existing `TS6133` errors in unrelated UI files.
- [x] 6.2 Run `npm run typecheck` (`tsc --noEmit`) after the change and confirm the error set is UNCHANGED from 6.1 — the four touched/created files add ZERO new errors (respect `noExplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`).
- [x] 6.3 Run `npm run lint` (`biome check .`) and confirm the four created/edited files (`engines/AnalysisEngine.ts`, `engines/MlKitEngine.ts`, `engines/EngineRegistry.ts`, `ProcessingService.ts`) are clean — tabs, double quotes, organized imports, no `noExplicitAny` — without needing to fix unrelated pre-existing repo Biome issues.
- [x] 6.4 If any touched-file formatting is flagged, run `npm run lint:fix` and re-verify only the touched files changed (do not sweep unrelated files).
