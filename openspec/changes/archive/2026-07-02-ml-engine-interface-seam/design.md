## Context

Visara analyzes on-device media through `ProcessingService` (`src/services/ml/ProcessingService.ts`). `processMedia(imageUri)` both *orchestrates* a pass (timing, success/error envelope, fallback result) and *is hard-wired to the producer*: it value-imports two concrete ML Kit services (`ProcessingService.ts:2-3`) and runs them itself —

```ts
const [labelingResult, recognitionResult] = await Promise.all([
    ImageLabelingService.processImage(imageUri),
    TextRecognitionService.extractText(imageUri),
]); // ProcessingService.ts:34-37
```

— assembling `ProcessingResult` (`ProcessingService.ts:7-13`). The result is consumed by exactly one external site, `MediaFileRepository`, and only as a *type*: `import type { ProcessingResult } from "@services/ml/ProcessingService"` (`MediaFileRepository.ts:5`), read in `createWithProcessingResult` (`MediaFileRepository.ts:173-224`) and `updateWithProcessingResult` (`MediaFileRepository.ts:226-278`), which pull `success`, `imageLabeling.labels[].{text,confidence}`, and `textRecognition.{text,blocks}` and hard-code `label.source = "mlkit"` / `label.type = "tag"`. The only *runtime* caller of `processMedia` is the internal `processQueue` loop (`ProcessingService.ts:103`).

This is Wave-A foundation #2 of the ML→Gemma-4 migration. Change #1 (archived `2026-07-01-db-migrations-and-gemma-schema`) already made the schema Gemma-ready: `media_files.caption`/`description`/`ai_model_version`/`ai_schema_version`/`processed_at`, `labels.source`/`type`/`model_version`, `processing_queue.task_type`/`model_version`, and an `embeddings` table; `src/shared-types/display.ts` already exposes `DisplayLabel.source`/`type` and a `DisplayEnrichment` (`caption`/`description`). What is still missing is a seam between "run a pass" and "which engine produces it," so a Tier-1 Gemma engine can be added later without editing the orchestrator or any caller.

**Constraints.** Biome (tabs, double quotes; `noExplicitAny: error`; `noStaticOnlyClass: off`; `useImportType: off`; `organizeImports: on`), strict TS (`noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`/`noFallthroughCasesInSwitch`, `isolatedModules: true`), legacy decorators, all-static service classes. Path aliases `@services/*`, `@models/*`, `@shared-types/*` are defined in both `tsconfig.json` and `babel.config.js`. The repo carries ~8 pre-existing TS6133 baseline errors in unrelated UI files and many pre-existing Biome issues; this change must add ZERO new errors and keep every *touched* file Biome-clean.

## Goals / Non-Goals

**Goals:**
- Define a runtime-agnostic, tiered `AnalysisEngine` abstraction: an `image → ProcessingResult` producer described by a static tier + capability descriptor.
- Refactor `ProcessingService.processMedia` to DELEGATE to a configured engine (resolved via a small registry/selector) instead of hard-importing the two ML Kit services.
- Ship the default `MlKitEngine` now, wrapping the current pass so `ProcessingResult` and runtime behavior are byte-for-byte unchanged.
- Keep the `ProcessingResult` contract stable and make the new engine descriptor/provenance types ready to carry change #1's additive fields (caption/description/model version; label source/type) later.
- Zero behavior change, no new npm dependency, no native code; all touched files pass `npm run typecheck` and `npm run lint` with no new errors.

**Non-Goals:**
- No Gemma/Tier-1 engine, no inference, no caption/description/open-vocab-tag producers, no embeddings — later waves.
- No new fields on `ProcessingResult` and no write-path changes: `MediaFileRepository` keeps hard-coding `source="mlkit"`/`type="tag"` this wave (sourcing provenance from the descriptor is a later wave).
- No new npm dependency, no new path alias, no native module.
- No change to `ImageLabelingService`/`TextRecognitionService` public APIs, nor to the queue/retry logic in `ProcessingService`.

## Decisions

### D1: Engine shape — one `analyze()` returning `ProcessingResult` + a static descriptor (NOT granular capability methods)

Adopt a single-method producer with a descriptor:

```ts
// src/services/ml/engines/AnalysisEngine.ts
import type { ProcessingResult } from "../ProcessingService";

export type AnalysisTier = "tier0" | "tier1";
export type AnalysisCapability = "labels" | "ocr" | "caption" | "description" | "tags";

export interface AnalysisEngineDescriptor {
    /** Stable engine id; also the intended label/enrichment provenance source (e.g. "mlkit", "gemma"). */
    readonly id: string;
    /** Scheduling/selection bucket: tier0 = fast literal pass, tier1 = multimodal enrichment. */
    readonly tier: AnalysisTier;
    /** What this engine actually produces. */
    readonly capabilities: readonly AnalysisCapability[];
    /** Optional model identifier to stamp as provenance later (ai_model_version / labels.model_version). Omitted for ML Kit. */
    readonly modelVersion?: string;
}

export interface AnalysisEngine {
    readonly descriptor: AnalysisEngineDescriptor;
    /** Produce analysis for one image. Resolves (does not reject) with success=false on failure, matching today's contract. */
    analyze(imageUri: string): Promise<ProcessingResult>;
}
```

**Why (over granular `labelImage()`/`extractText()`/`caption()`/`tag()` methods):**
- **Byte-for-byte parity.** Today's pass is a *bundle*: two producers run under one `Promise.all`, one shared timer (`totalProcessingTime`), and one unified success/error/fallback envelope (`ProcessingService.ts:27-71`). A single `analyze()` lets `MlKitEngine` own that exact orchestration, so `processMedia` becomes a one-line delegate and the parity is trivially auditable.
- **Tiers are capability bundles.** Tier-0 emits labels+OCR from one parallel pass; Tier-1 emits caption/description/tags from one multimodal inference. Granular methods would fracture the bundle and push parallelization/timing/error-handling back up into `ProcessingService` — i.e., MOVE behavior into the caller, contradicting "delegate, don't reimplement."
- **No capability leakage.** With granular methods the caller must probe optional methods (`if (engine.caption) …`) — exactly the coupling we are removing. A `descriptor.capabilities` array lets a registry/selector reason about engines without the caller knowing internals.
- **Additive growth.** A single result object grows optional fields (`enrichment?`, `provenance?`) without changing the method signature (D7); granular methods would each need a result type the caller must stitch.
- **Composition still works.** A future hybrid "Tier-0 then Tier-1" engine is just another `AnalysisEngine` that internally composes two engines — no caller change.

**Alternative considered:** granular capability methods — rejected for the reasons above. A middle option (return a *new* `AnalysisResult` type distinct from `ProcessingResult`) is rejected for this wave because it would ripple into `MediaFileRepository` (D7).

### D2: Engines are all-static classes; interface conformance is checked at assignment sites

Repo convention is all-static service classes (`noStaticOnlyClass: off`). A TS `interface` describes an instance, but a class's *static side* structurally satisfies `AnalysisEngine` when the class object is assigned to an `AnalysisEngine`-typed slot. So `MlKitEngine` is `class MlKitEngine { static readonly descriptor = …; static async analyze(…) {…} }`, and conformance is enforced where it is *used* as an engine — `EngineRegistry`'s entries and `ProcessingService`'s `engine` field are typed `AnalysisEngine`, so `tsc` checks the static shape there.

**Why:** matches the codebase, needs no instances, and avoids a throwaway `const _c: AnalysisEngine = MlKitEngine;` conformance local that `noUnusedLocals` would flag. **Alternative:** object-literal engines (`export const MlKitEngine: AnalysisEngine = { … }`) — cleaner structural fit but breaks the all-static-class convention; rejected for consistency.

### D3: `MlKitEngine` wraps the current pass verbatim; it owns the timing/success/fallback envelope

Move the entire body of `processMedia` (`ProcessingService.ts:28-70`) into `MlKitEngine.analyze` unchanged: `startTime`, the same `Promise.all([ImageLabelingService.processImage, TextRecognitionService.extractText])`, the same success return, and the same catch that returns `success: false` with the identical fallbacks (`imageLabeling: { labels: [], processingTime: 0 }`, `textRecognition: { text: "", blocks: "[]", processingTime: 0 }`) and `error` message. The descriptor is `{ id: "mlkit", tier: "tier0", capabilities: ["labels", "ocr"] }` (no `modelVersion` — ML Kit has no app-level model version).

The **only** textual difference is the internal diagnostic label, which moves from `console.error("ProcessingService.processMedia error:", …)` to `console.error("MlKitEngine.analyze error:", …)`. It is console-only, not part of the `ProcessingResult` contract, and no test asserts on it (there are zero test files for these services). **Alternative:** keep the string verbatim — acceptable but misleading inside `MlKitEngine`; either is byte-for-byte at the `ProcessingResult` level. The engine (not `ProcessingService`) owns the envelope because different tiers have different failure modes and partial-result fallbacks; centralizing it in the caller would re-couple the orchestrator to Tier-0's result shape.

### D4: `ProcessingService.processMedia` delegates to a configured engine; `ProcessingResult` stays declared in place

```ts
// ProcessingService.ts (shape after refactor)
import type { ImageLabelingResult } from "./ImageLabelingService";     // kept: ProcessingResult references it
import type { TextRecognitionResult } from "./TextRecognitionService"; // kept: ProcessingResult references it
import { MlKitEngine } from "./engines/MlKitEngine";
import type { AnalysisEngine } from "./engines/AnalysisEngine";

export interface ProcessingResult { /* UNCHANGED, lines 7-13 */ }

export class ProcessingService {
    private static engine: AnalysisEngine = MlKitEngine; // conformance enforced here
    static async processMedia(imageUri: string): Promise<ProcessingResult> {
        return this.engine.analyze(imageUri);
    }
    static setEngine(engine: AnalysisEngine): void { this.engine = engine; }
    static getEngine(): AnalysisEngine { return this.engine; }
    // addToQueue / processQueue / clearQueue / getQueueLength / isQueueProcessing / setMaxRetries — UNCHANGED
}
```

- **Drop** the two *value* imports (`import { ImageLabelingService }`, `import { TextRecognitionService }`) — they move to `MlKitEngine`.
- **Keep** the two `import type` lines — `ProcessingResult` still references `ImageLabelingResult`/`TextRecognitionResult`.
- **Keep** `ProcessingResult` declared and exported from `ProcessingService.ts` so `MediaFileRepository`'s `import type … from "@services/ml/ProcessingService"` (`MediaFileRepository.ts:5`) resolves unchanged. **Why not move it to the engine module:** moving it would either change `MediaFileRepository`'s import path (touching a caller) or require a re-export; declaring it where it already lives is zero-churn.

**Why:** `processMedia` becomes a pure delegate; `setEngine`/`getEngine` make engines swappable for the Gemma wave and for tests without touching callers. Default is `MlKitEngine` directly (see D5).

### D5: Small `EngineRegistry` selector, seeded with `MlKitEngine`; default hot path stays direct

Ship an all-static `EngineRegistry` that maps `id → engine` and `tier → engine[]`, exposes `getById(id)`, `getByTier(tier)`, `getDefault()` (the Tier-0 default), and `register(engine)`, seeded at module load with `MlKitEngine` as the Tier-0 default. `ProcessingService.engine` defaults to `MlKitEngine` **directly** (not `EngineRegistry.getDefault()`) to avoid any static-initialization-order coupling between the two modules; the registry is the *selection* seam (`setEngine(EngineRegistry.getByTier("tier1"))` in Wave-B; `setEngine(EngineRegistry.getById("mlkit"))` round-trips today), and it aligns with the archived `processing-queue-tiers` `task_type` values (`tier0_mlkit`, `tier1_gemma`).

**Why:** the prompt invites "a configured engine (or a small engine registry/selector)"; a tiered seam needs a place to *select* by tier. Keeping the default field direct guarantees the hot path is trivially unchanged and sidesteps init ordering. **Alternatives:** (a) default via `EngineRegistry.getDefault()` — minor static-init-order risk, rejected; (b) no registry, only `setEngine` — rejected, leaves tier selection unspecified for Wave-B.

### D6: Tier + capability taxonomy as string-literal unions; descriptor carries provenance hooks

`AnalysisTier` and `AnalysisCapability` are closed string-literal unions (extensible additively). The descriptor's `id` is the intended `labels.source` value (`"mlkit"` today, `"gemma"` later) and `modelVersion?` maps to `ai_model_version` / `labels.model_version`. `capabilities` names `caption`/`description`/`tags` now even though no engine emits them yet, so the taxonomy — and thus the provenance the result will eventually carry — is "ready" without a Gemma implementation.

**Why:** literal unions give exhaustive checking (`noFallthroughCasesInSwitch`) and no `any`. **Alternative:** free-form strings — rejected, loses type safety and selector guarantees.

### D7: `ProcessingResult` unchanged now; additive growth documented, not implemented

Keep `ProcessingResult` and its members (`imageLabeling: ImageLabelingResult`, `textRecognition: TextRecognitionResult`, `totalProcessingTime`, `success`, `error?`) byte-for-byte, including the ML-Kit-flavored `ImageLabelingResult`/`TextRecognitionResult` names, to avoid rippling into `MediaFileRepository`. The seam is "ready to carry" change #1's fields via a documented additive path: a later wave adds optional `enrichment?: { caption?; description?; tags?: string[] }` and/or per-result `provenance?: { tier; source; modelVersion? }` to `ProcessingResult`, and Tier-1 engines populate them — all additive, no consumer breakage.

**Why:** "byte-for-byte unchanged" and "additive later" are both satisfied by defining the *taxonomy/provenance* now (D6) while leaving the *result payload* untouched. **Alternative:** add unused optional `enrichment?` now — rejected; it is dead surface this wave and mildly perturbs the contract with no producer.

### D8: No new path alias, no `@shared-types` entry

The engine contract is a service-layer type and lives under the existing `@services/*` alias at `src/services/ml/engines/`. UI-facing provenance already exists in `src/shared-types/display.ts` (`DisplayLabel.source`/`type`, `DisplayEnrichment`), added by change #1, so no shared-type or alias change is needed. (`@shared-types/*` is a glob in both `tsconfig.json` and `babel.config.js` regardless.)

### D9: Import graph, decorators, and lint hygiene

- **No cycle.** `MlKitEngine` imports `ProcessingResult` from `ProcessingService` **type-only** (erased under `isolatedModules`); the sole runtime edges are `ProcessingService → MlKitEngine → { ImageLabelingService, TextRecognitionService }` and `EngineRegistry → MlKitEngine` — a DAG.
- **No decorators** are involved (these are plain services, not WatermelonDB models).
- **No `biome-ignore` header on new files.** `noStaticOnlyClass` is `off` globally, so a suppression comment would suppress nothing and risks Biome's unused-suppression detection; new engine files omit it. `ProcessingService.ts`'s existing header is left untouched to avoid churn.
- **Conformance without unused locals.** Static-side checks happen at the `EngineRegistry` entry and `ProcessingService.engine` assignment — no throwaway conformance local (`noUnusedLocals`).

## Risks / Trade-offs

- **Diagnostic-string drift** (D3): the moved `console.error` label differs from the original → mitigated by it being console-only, contract-irrelevant, and untested; documented as the sole textual change (or kept verbatim if preferred).
- **Static-init ordering** between `ProcessingService`, `EngineRegistry`, and `MlKitEngine` → mitigated by defaulting `ProcessingService.engine` to `MlKitEngine` directly (D5); the registry is not on the default hot path.
- **Import cycle risk** if an engine ever imports a *value* from `ProcessingService` → mitigated by the type-only import rule (D9) and by keeping `ProcessingResult` a pure type.
- **Interface/impl drift** (an engine whose `analyze`/`descriptor` shape diverges) → mitigated by assignment-site conformance (D2) caught by `npm run typecheck`.
- **Registry appears unused this wave** (only `MlKitEngine` registered, default path bypasses it) → accepted: it is the documented Wave-B selection seam and is exercised by `setEngine`/round-trip; kept minimal to avoid over-engineering.
- **`ProcessingResult` name is ML-Kit-flavored** for a runtime-agnostic seam → accepted for byte-for-byte parity; a future additive `enrichment?`/`provenance?` (D7) generalizes it without renaming.

## Migration Plan

Deploy order (also the tasks order):
1. Add `src/services/ml/engines/AnalysisEngine.ts` (types + interface).
2. Add `src/services/ml/engines/MlKitEngine.ts` (verbatim current pass + descriptor).
3. Add `src/services/ml/engines/EngineRegistry.ts` (selector, seeded with `MlKitEngine`).
4. Edit `src/services/ml/ProcessingService.ts`: add the `engine` field + `setEngine`/`getEngine`, make `processMedia` delegate, drop the two value imports, keep `ProcessingResult` + its `import type` lines.
5. Verify: `npm run typecheck` and `npm run lint` — zero new errors, touched files clean.

**Rollback:** trivial. This is a pure refactor with no schema, dependency, or native change; reverting the four files restores the previous behavior exactly. Because `ProcessingResult` and the ML Kit pass are unchanged, there is no data or migration concern.

## Open Questions

- **Whether to source `labels.source`/`type` from `descriptor.id`** in `MediaFileRepository` — deferred; this wave keeps the hard-coded `"mlkit"`/`"tag"` and only makes the descriptor *available* to do so later.
- **Exact shape of the future `enrichment?`/`provenance?` additions** to `ProcessingResult` (flat fields vs nested, per-label vs per-result provenance) — deferred to the Gemma producer wave (D7).
- **Whether the registry should also key by `task_type`** (`tier0_mlkit`/`tier1_gemma`) to line up 1:1 with `processing_queue.task_type` — deferred to the tier-scheduling wave; this wave keys by `id` and `tier`.
