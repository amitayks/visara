# analysis-engine-selection — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: ProcessingService delegates to a configured engine
**Reason**: Engine selection/registry is retired with the tier system; there is a single Gemma vision engine.
**Migration**: See `gemma-vision-enrichment` (engine seam) and `processing-pipeline` (admission gates).

### Requirement: The configured engine is swappable without touching callers
**Reason**: Engine selection/registry is retired with the tier system; there is a single Gemma vision engine.
**Migration**: See `gemma-vision-enrichment` (engine seam) and `processing-pipeline` (admission gates).

### Requirement: A registry resolves engines by id and tier
**Reason**: Engine selection/registry is retired with the tier system; there is a single Gemma vision engine.
**Migration**: See `gemma-vision-enrichment` (engine seam) and `processing-pipeline` (admission gates).

### Requirement: Callers, DB, search, and UI are unchanged
**Reason**: Engine selection/registry is retired with the tier system; there is a single Gemma vision engine.
**Migration**: See `gemma-vision-enrichment` (engine seam) and `processing-pipeline` (admission gates).
