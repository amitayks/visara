# media-enrichment-schema — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: MediaFile stores AI caption and description
**Reason**: The WatermelonDB enrichment columns/tables are deleted.
**Migration**: Superseded by `sqlite-storage-core` (enrichment table + provenance columns).

### Requirement: MediaFile records AI processing provenance
**Reason**: The WatermelonDB enrichment columns/tables are deleted.
**Migration**: Superseded by `sqlite-storage-core` (enrichment table + provenance columns).

### Requirement: is_processed is derived from processed_at
**Reason**: The WatermelonDB enrichment columns/tables are deleted.
**Migration**: Superseded by `sqlite-storage-core` (enrichment table + provenance columns).

### Requirement: Gemma re-runs are idempotent via version columns
**Reason**: The WatermelonDB enrichment columns/tables are deleted.
**Migration**: Superseded by `sqlite-storage-core` (enrichment table + provenance columns).
