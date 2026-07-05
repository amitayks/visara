# queue-drive-and-gating — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: The persistent queue is the single source of truth
**Reason**: The tiered queue drain and its gating matrix are deleted.
**Migration**: Superseded by `processing-pipeline` (single drain, admission gates, checkpoint-free resume via row status).

### Requirement: Enqueue records task type and model version
**Reason**: The tiered queue drain and its gating matrix are deleted.
**Migration**: Superseded by `processing-pipeline` (single drain, admission gates, checkpoint-free resume via row status).

### Requirement: Selection can filter by task type
**Reason**: The tiered queue drain and its gating matrix are deleted.
**Migration**: Superseded by `processing-pipeline` (single drain, admission gates, checkpoint-free resume via row status).

### Requirement: The drain runs under BackgroundTaskService gating and checkpointing
**Reason**: The tiered queue drain and its gating matrix are deleted.
**Migration**: Superseded by `processing-pipeline` (single drain, admission gates, checkpoint-free resume via row status).

### Requirement: Interrupted processing rows are recovered
**Reason**: The tiered queue drain and its gating matrix are deleted.
**Migration**: Superseded by `processing-pipeline` (single drain, admission gates, checkpoint-free resume via row status).

### Requirement: Failures retry within a bounded budget
**Reason**: The tiered queue drain and its gating matrix are deleted.
**Migration**: Superseded by `processing-pipeline` (single drain, admission gates, checkpoint-free resume via row status).
