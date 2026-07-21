# device-capability-gating — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: A coarse device-capability policy decides Tier-1 eligibility
**Reason**: DeviceCapabilityService heuristics tied to executorch models are deleted.
**Migration**: Superseded by `processing-pipeline` (RAM capability gate requirement).

### Requirement: Free-disk headroom for Tier-1 is checked live, not cached
**Reason**: DeviceCapabilityService heuristics tied to executorch models are deleted.
**Migration**: Superseded by `processing-pipeline` (RAM capability gate requirement).

### Requirement: The static capability verdict is cached and versioned
**Reason**: DeviceCapabilityService heuristics tied to executorch models are deleted.
**Migration**: Superseded by `processing-pipeline` (RAM capability gate requirement).

### Requirement: canRunTier1 composes capability AND thermal and fails closed
**Reason**: DeviceCapabilityService heuristics tied to executorch models are deleted.
**Migration**: Superseded by `processing-pipeline` (RAM capability gate requirement).

### Requirement: The capability gate performs no Tier-0 regression
**Reason**: DeviceCapabilityService heuristics tied to executorch models are deleted.
**Migration**: Superseded by `processing-pipeline` (RAM capability gate requirement).
