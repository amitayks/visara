## Context

Foundation #2 left a clean seam: `AnalysisEngine` (`src/services/ml/engines/AnalysisEngine.ts`) is an `image → ProcessingResult` producer with a `descriptor { id, tier, capabilities, modelVersion? }`; `MlKitEngine` is the Tier-0 default; `EngineRegistry` (`EngineRegistry.ts`) resolves engines by id/tier and is seeded with `MlKitEngine`. `analysis-engine-interface` explicitly reserved `tier1`, the `caption`/`description`/`tags` capabilities, and an *additive* `ProcessingResult` extension — "no engine produces them yet." Foundation #1 shipped the target schema (`schema.ts` v2: `media_files.caption/description/ai_model_version/ai_schema_version/processed_at`; `labels.source/type/model_version`) and `label-provenance` + `media-enrichment-schema` already specify how a Gemma write must behave. Foundation #4 integrated `react-native-executorch@0.9.2` (deps in `package.json`, `initExecutorch` in `index.js`, a `useLLM` POC at `src/screens/Dev/ExecutorchPocScreen.tsx`) and is the GO/NO-GO gate.

This change is the **producer** that fills the reserved seam: `GemmaMultimodalService`. It is deliberately decoupled from *when* Gemma runs — Tier-1 selection, `canRunTier1()` gating (#5), and the drain wiring are #10.

Central constraint: `EngineRegistry` is consumed by **nobody** today (`grep` finds zero importers outside its own file), and `AnalysisEngine.analyze` runs inside `OrchestratorService`'s background drain, which is explicitly framework-agnostic (`OrchestratorService.ts:1` "no React import"). So the engine cannot use a React hook.

## Goals / Non-Goals

**Goals:**
- A registered, type-conforming Tier-1 `AnalysisEngine` (`descriptor.id = "gemma"`) that runs `models.llm.gemma4_e2b_multimodal()` on a `ThumbnailService`-decoded `file://` image and returns caption + description + open-vocabulary tags additively on `ProcessingResult`.
- Resolve-never-reject envelope + per-image timeout, matching `MlKitEngine` byte-for-byte so any future caller is drop-in.
- An additive DB write (`applyGemmaEnrichment`) that lands the result on the #1 schema with `source = "gemma"` provenance without clobbering Tier-0 data — the seam #10 calls.

**Non-Goals (belong to #5/#10):**
- Selecting/enqueuing/draining the Tier-1 pass; setting Gemma as `ProcessingService`'s engine; the `tier1_gemma` task type.
- `DeviceCapabilityService.canRunTier1()` gating and thermal-driven model unload.
- The version-aware SKIP (same-version re-run = no-op).
- Search indexing of `caption`/`description`/`gemma` tags.
- Any native code, Podfile/Gradle, or model-download changes (all owned by #4).

## Decisions

### D1 — Imperative `LLMModule`, not the `useLLM` hook (the load-bearing choice)

`react-native-executorch` exposes the LLM two ways: the `useLLM` React hook (used by #4's POC) and the imperative `LLMModule` class (`modules/natural_language_processing/LLMModule.ts`) that the hook wraps over a shared `LLMController`. The engine MUST use the **imperative** `LLMModule` because `AnalysisEngine` is all-static and runs in the no-React drain — a hook is unusable there.

- `LLMModule.fromModelName(namedSources, onDownloadProgress?, tokenCallback?, messageHistoryCallback?)` accepts exactly the object `models.llm.gemma4_e2b_multimodal()` returns (`{ modelName, modelSource, tokenizerSource, tokenizerConfigSource, capabilities: ["vision","audio"], audioConfig, generationConfig }`), so loading is `LLMModule.fromModelName(models.llm.gemma4_e2b_multimodal())`.
- Inference uses `generate(messages: Message[])` (returns the full response string, applies the chat template, and is **stateless per call** — "doesn't manage conversation context"), passing a `user` message with `mediaPath` set to the `file://` image. Chosen over `sendMessage` (mutates `messageHistory` — undesirable for a stateless per-image engine) and over `forward` (requires hand-building the prompt with special tokens).

*Alternative considered:* host a `useLLM` singleton in a hidden React component and bridge to imperative via a ref/event. Rejected — it couples inference to a mounted component and the React lifecycle, and cannot run truly headless in the background task.

### D2 — Lazy, single-instance model lifecycle with a load mutex and a generation mutex

The model is a ~3.2 GB (iOS MLX) / ~4.4 GB (Android Vulkan) `.pte`; loading is expensive and memory-heavy. So:
- `private static llm: LLMModule | null` + `private static loadPromise: Promise<LLMModule> | null`. `ensureLoaded()` returns the cached instance, else awaits the shared in-flight `loadPromise`, else starts one. Concurrent first calls share the single load (spec: "Concurrent first calls share one load").
- Loading is **lazy** (first `analyze`), not at module import — so merely registering the engine costs nothing.
- On-device LLM generation is single-threaded; two concurrent `generate` calls on one `LLMController` are unsafe. A `private static inflight: Promise<...>` **generation mutex** serializes `analyze` calls. (The drain calls `processNext` sequentially anyway — `OrchestratorService.ts:185` — so this is defensive, and keeps the engine correct if any future caller parallelizes.)
- A `dispose()` that calls `LLMModule.delete()` and clears the handle is provided for #5/#10 to free memory under thermal pressure, but this change never calls it.

### D3 — Additive `ProcessingResult` extension shape

`ProcessingResult` (`ProcessingService.ts:8-14`) gains one optional field. Existing fields stay required, so the type stays backward-compatible and `MlKitEngine` (which never sets it) still conforms:

```ts
export interface GemmaTag { text: string; confidence?: number; } // confidence: POC-dependent
export interface GemmaEnrichment {
	caption?: string;
	description?: string;
	tags: GemmaTag[];
	ocrText?: string; // only if "ocr" capability is exercised — POC-dependent
	raw?: string;     // unparsed output / structured-JSON passthrough for debugging
}
export interface ProcessingResult {
	imageLabeling: ImageLabelingResult;
	textRecognition: TextRecognitionResult;
	totalProcessingTime: number;
	success: boolean;
	error?: string;
	gemma?: GemmaEnrichment; // additive; set only by the Tier-1 Gemma engine
}
```

The Gemma engine still returns the contract's `imageLabeling`/`textRecognition` empty fallbacks (so the shape is valid) plus its `gemma` payload. **The exact `GemmaEnrichment` fields, the parser, and whether tags mirror into `imageLabeling.labels` are POC-DEPENDENT.**

### D4 — Decode via `ThumbnailService`; pass a `file://` path

`analyze` calls `ThumbnailService.getThumbnail(imageUri, "large")` (`ThumbnailService.ts:84`) to get a decodable `file://` JPEG (3-tier cached, already `file://`-prefixed), then sets it as `Message.mediaPath`. This mirrors #4's hard rule (POC comment `ExecutorchPocScreen.tsx:44-58`): the ExecuTorch decoder cannot read `content://`. Size (`large` vs `medium`) trades resolution for latency/memory and is POC-tunable.

### D5 — Registration seam: seed the registry, keep executorch off the Tier-0 path

Mirroring `EngineRegistry.register(MlKitEngine)` (`EngineRegistry.ts:27`), the registry seeds the Tier-1 engine so `getById("gemma")`/`getByTier("tier1")` resolve it. To avoid a circular import (the `MlKitEngine` precedent is: registry imports engine, engine does *not* import registry), `EngineRegistry` imports and registers `GemmaMultimodalService`; the service does not import the registry.

Because **no Tier-0 hot path imports `EngineRegistry`** today, this coupling is inert until #10 first imports the registry for Tier-1 selection. To keep even that import cheap and executorch strictly lazy, `GemmaMultimodalService` imports `react-native-executorch` symbols but only *touches* the runtime inside `ensureLoaded()` (first `analyze`) — importing the module neither loads the model nor forces native evaluation beyond what the POST-#4 app already does. If future gating wants zero executorch reachability until enabled, a dynamic `await import("react-native-executorch")` inside `ensureLoaded()` is the drop-in hardening (flagged, not adopted now).

### D6 — Per-image timeout via `Promise.race` + `interrupt()`

`analyze` races `generate(...)` against a timeout timer. On timeout it calls `LLMModule.interrupt()` ("may return one more token after interrupt") and resolves `success: false`. The timeout constant is **POC-DEPENDENT** — set from #4's measured on-device latency (a too-tight value fails every image; too-loose starves the drain).

### D7 — Additive persistence: `applyGemmaEnrichment`, not the Tier-0 writer

The Tier-0 `updateWithProcessingResult` (`MediaFileRepository.ts:293`) **deletes all labels + OCR** for the file then rewrites with `source = "mlkit"`. Reusing it for Gemma would wipe the ML Kit labels — violating `label-provenance` ("Gemma re-run does not delete ML Kit labels"). So a new additive method:
- One `media_files` write: `caption`, `description`, `aiModelVersion = descriptor.modelVersion`, `aiSchemaVersion = TIER1_SCHEMA_VERSION`, `processedAt = new Date()` (preserving `is_processed === (processed_at !== null)`), following the same in-write invariant as the Tier-0 writers.
- Labels: delete `Q.where("media_file_id", id) AND Q.where("source", "gemma")`, then insert the new `source = "gemma"` / `type = "tag"` / `model_version = descriptor.modelVersion` rows. ML Kit rows untouched.
- Idempotent overwrite-in-place (never duplicates). The *no-op* same-version SKIP is #10's drain guard (like the Tier-0 skip at `OrchestratorService.ts:206-214`), not this method's job.

**Provenance-merge decision:** `labels.source`/`model_version` make label provenance unambiguous regardless of tier. The single scalar `media_files.ai_model_version` can hold only one value; this design sets it to the Gemma `modelVersion` when Gemma runs (Tier-1 is the richer/latest enrichment). Whether #10 prefers a composite or "highest-tier-wins" policy is an **open question** deferred to the wiring change; the label rows are the durable, unambiguous provenance either way.

## Risks / Trade-offs

- **[Hook-vs-module drift]** #4's POC exercises `useLLM`; this engine exercises `LLMModule`. → They share the `LLMController` + native runtime; the POC's GO result transfers. Re-confirm on-device once wired (a task notes this).
- **[POC-dependent surface is wide]** prompt, parser, JSON schema, `GemmaEnrichment` fields, timeout, `modelVersion`, `TIER1_SCHEMA_VERSION`. → All are localized to `GemmaMultimodalService` + the `GemmaEnrichment` type + one repo constant; the engine/registry/persistence *contracts* (the specs) are POC-stable. Tasks flag every POC-tunable value.
- **[executorch reachable from the registry]** seeding pulls the service (and its `react-native-executorch` import) into `EngineRegistry`'s module graph. → Inert until #10 imports the registry; runtime stays lazy (D5); dynamic-import hardening is available if needed.
- **[Unused-until-#10 method]** `applyGemmaEnrichment` and `dispose()` ship before a caller. → Public static methods with used params — no `TS6133`; they are the documented seams #10/#5 consume, and dep #1 scopes this change to the schema-write layer.
- **[Runtime absent / OOM on weak devices]** loading a multi-GB model where the runtime is unavailable or RAM is short. → Engine fails **closed** (`isAvailable`/load failure ⇒ `success: false`, no partial `gemma`); actually admitting a device to Tier-1 is `canRunTier1()`'s job (#5), never this engine's.

## Open Questions

- Final `media_files.ai_model_version` merge policy when both Tier-0 and Tier-1 have run (scalar overwrite vs composite) — resolved with #10.
- Whether `"ocr"` belongs in `descriptor.capabilities` (does Gemma reliably transcribe on-image text, or does Tier-0 ML Kit OCR stay authoritative?) — resolved by the #4 POC output.
- Whether Gemma tags should also mirror into `imageLabeling.labels` for existing label consumers, or live only under `gemma.tags` — resolved by the #4 POC + #10 search needs.
