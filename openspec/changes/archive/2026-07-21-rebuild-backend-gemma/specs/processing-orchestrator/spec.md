# processing-orchestrator — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: OrchestratorService connects the pipeline end to end
**Reason**: The OrchestratorService pipeline over WatermelonDB queue rows is deleted.
**Migration**: Superseded by `processing-pipeline` (event contract preserved) and `library-discovery-first` (discovery).

### Requirement: Processing is triggered post-onboarding with a foreground scan and background continuation
**Reason**: The OrchestratorService pipeline over WatermelonDB queue rows is deleted.
**Migration**: Superseded by `processing-pipeline` (event contract preserved) and `library-discovery-first` (discovery).

### Requirement: Discovery upserts are idempotent
**Reason**: The OrchestratorService pipeline over WatermelonDB queue rows is deleted.
**Migration**: Superseded by `processing-pipeline` (event contract preserved) and `library-discovery-first` (discovery).

### Requirement: The pipeline is resumable and does not double-process
**Reason**: The OrchestratorService pipeline over WatermelonDB queue rows is deleted.
**Migration**: Superseded by `processing-pipeline` (event contract preserved) and `library-discovery-first` (discovery).

### Requirement: OrchestratorService exposes a framework-agnostic event API
**Reason**: The OrchestratorService pipeline over WatermelonDB queue rows is deleted.
**Migration**: Superseded by `processing-pipeline` (event contract preserved) and `library-discovery-first` (discovery).

### Requirement: Selection is tier-aware and forward-compatible
**Reason**: The OrchestratorService pipeline over WatermelonDB queue rows is deleted.
**Migration**: Superseded by `processing-pipeline` (event contract preserved) and `library-discovery-first` (discovery).
