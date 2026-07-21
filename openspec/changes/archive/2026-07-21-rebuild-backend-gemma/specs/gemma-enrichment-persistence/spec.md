# gemma-enrichment-persistence — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: An additive write maps a Gemma result onto the media_files enrichment columns
**Reason**: The WatermelonDB Gemma persistence path is deleted.
**Migration**: Superseded by `sqlite-storage-core` and `gemma-vision-enrichment` (same-transaction persist requirement).

### Requirement: Gemma labels are written with source provenance and coexist with ML Kit labels
**Reason**: The WatermelonDB Gemma persistence path is deleted.
**Migration**: Superseded by `sqlite-storage-core` and `gemma-vision-enrichment` (same-transaction persist requirement).

### Requirement: The Gemma write is an in-place overwrite that never duplicates
**Reason**: The WatermelonDB Gemma persistence path is deleted.
**Migration**: Superseded by `sqlite-storage-core` and `gemma-vision-enrichment` (same-transaction persist requirement).

### Requirement: The Tier-0 persistence path and the drain are unchanged
**Reason**: The WatermelonDB Gemma persistence path is deleted.
**Migration**: Superseded by `sqlite-storage-core` and `gemma-vision-enrichment` (same-transaction persist requirement).
