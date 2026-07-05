# analysis-engine-interface — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: AnalysisEngine defines a runtime-agnostic image-to-analysis producer
**Reason**: The multi-engine `AnalysisEngine` abstraction is retired; the rebuilt backend has exactly one vision engine (Gemma 4 via llama.rn) behind the `gemma-vision-enrichment` seam.
**Migration**: Enrichment behavior is specified by `gemma-vision-enrichment`; the runtime-agnostic seam is its `VisionEngine` interface.

### Requirement: analyze resolves rather than rejects
**Reason**: The multi-engine `AnalysisEngine` abstraction is retired; the rebuilt backend has exactly one vision engine (Gemma 4 via llama.rn) behind the `gemma-vision-enrichment` seam.
**Migration**: Enrichment behavior is specified by `gemma-vision-enrichment`; the runtime-agnostic seam is its `VisionEngine` interface.

### Requirement: Tier and capability taxonomy anticipates Tier-0 and Tier-1
**Reason**: The multi-engine `AnalysisEngine` abstraction is retired; the rebuilt backend has exactly one vision engine (Gemma 4 via llama.rn) behind the `gemma-vision-enrichment` seam.
**Migration**: Enrichment behavior is specified by `gemma-vision-enrichment`; the runtime-agnostic seam is its `VisionEngine` interface.

### Requirement: Descriptor is provenance-ready and the result contract extends additively
**Reason**: The multi-engine `AnalysisEngine` abstraction is retired; the rebuilt backend has exactly one vision engine (Gemma 4 via llama.rn) behind the `gemma-vision-enrichment` seam.
**Migration**: Enrichment behavior is specified by `gemma-vision-enrichment`; the runtime-agnostic seam is its `VisionEngine` interface.
