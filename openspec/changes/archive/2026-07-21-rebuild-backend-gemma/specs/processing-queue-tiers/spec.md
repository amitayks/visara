# processing-queue-tiers — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: Processing queue distinguishes task tiers
**Reason**: The processing_queue table and task_type streams are deleted.
**Migration**: Durable state lives on media rows (`enrich_status`); see `sqlite-storage-core` and `processing-pipeline`.

### Requirement: Distinct tiers can be scheduled independently
**Reason**: The processing_queue table and task_type streams are deleted.
**Migration**: Durable state lives on media rows (`enrich_status`); see `sqlite-storage-core` and `processing-pipeline`.

### Requirement: Existing queue rows backfill to Tier-0
**Reason**: The processing_queue table and task_type streams are deleted.
**Migration**: Durable state lives on media rows (`enrich_status`); see `sqlite-storage-core` and `processing-pipeline`.
