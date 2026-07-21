# label-provenance — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: Labels carry provenance metadata
**Reason**: Label source/model-version provenance columns on the labels table are deleted with the table.
**Migration**: Provenance is `media.model_version` + `media.processed_at`; tags carry no per-row provenance (single engine). See `sqlite-storage-core`.

### Requirement: ML Kit and Gemma labels coexist and stay distinguishable
**Reason**: Label source/model-version provenance columns on the labels table are deleted with the table.
**Migration**: Provenance is `media.model_version` + `media.processed_at`; tags carry no per-row provenance (single engine). See `sqlite-storage-core`.

### Requirement: Existing labels backfill to the ML Kit source
**Reason**: Label source/model-version provenance columns on the labels table are deleted with the table.
**Migration**: Provenance is `media.model_version` + `media.processed_at`; tags carry no per-row provenance (single engine). See `sqlite-storage-core`.
