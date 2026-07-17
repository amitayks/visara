# library-reprocessing — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: A reprocessing planner enqueues by model-version mismatch
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).

### Requirement: Tier-0 backfills broadly and Tier-1 is enqueued as a distinct stream
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).

### Requirement: Reprocessing overwrites in place and never resets the library up front
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).

### Requirement: Reprocessing is idempotent and reuses the version-aware skip
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).

### Requirement: The reprocess sweep is resumable and safe to stop
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).

### Requirement: A rollback-if-worse gate preserves prior enrichment
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).

### Requirement: An embedding stream can be scheduled without wiring an engine
**Reason**: LibraryReprocessingService and its sweep/checkpoint machinery are deleted.
**Migration**: Superseded by `processing-pipeline` (Reprocessing requirement: one status-flip sweep).
