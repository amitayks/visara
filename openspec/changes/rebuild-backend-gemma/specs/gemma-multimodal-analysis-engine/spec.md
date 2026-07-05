# gemma-multimodal-analysis-engine — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: GemmaMultimodalService is a Tier-1 AnalysisEngine
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: Engine drives the imperative ExecuTorch runtime, not the React hook
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: The Gemma model is loaded once and reused across images
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: The image is decoded to a file:// path via ThumbnailService
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: Analyze produces caption, description, and open-vocabulary tags mapped additively onto ProcessingResult
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: Analyze enforces a per-image timeout with interrupt and fallback
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: Analyze resolves and never rejects, matching the MlKitEngine envelope
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).

### Requirement: The engine is registered but not wired into the drain
**Reason**: The executorch-based Gemma engine (LLMModule, .pte, tier1 envelope) is deleted with the executorch runtime.
**Migration**: Superseded by `gemma-vision-enrichment` (llama.rn GGUF engine, one-pass JSON contract).
