## MODIFIED Requirements

### Requirement: A registry resolves engines by id and tier

The system SHALL provide an all-static `EngineRegistry` that registers engines and resolves them by `descriptor.id` and by `descriptor.tier`, and exposes a Tier-0 default. It SHALL be seeded with `MlKitEngine` as the Tier-0 default and with `GemmaMultimodalService` as the Tier-1 engine. `getById(id)` SHALL return the engine with that id (or `undefined` when unregistered); `getByTier(tier)` SHALL return the engines registered for that tier; `getDefault()` SHALL return the Tier-0 default engine. Seeding the Tier-1 engine SHALL NOT change the default or route any drain to it — selection remains the caller's (#10's) responsibility.

#### Scenario: Resolve the seeded default engine

- **WHEN** `EngineRegistry.getDefault()` is called with no additional registration
- **THEN** it returns `MlKitEngine`

#### Scenario: Resolve an engine by id and by tier

- **WHEN** `EngineRegistry.getById("mlkit")` is called
- **THEN** it returns `MlKitEngine`
- **AND** `EngineRegistry.getByTier("tier0")` includes `MlKitEngine`

#### Scenario: The Tier-1 Gemma engine now resolves by id and tier

- **WHEN** `EngineRegistry.getById("gemma")` is called after this change
- **THEN** it returns `GemmaMultimodalService` (no longer `undefined`)
- **AND** `EngineRegistry.getByTier("tier1")` includes `GemmaMultimodalService`

#### Scenario: Registering the Tier-1 engine does not change the default

- **WHEN** the Tier-1 engine is seeded into the registry
- **THEN** `EngineRegistry.getDefault()` still returns `MlKitEngine`
- **AND** `ProcessingService.getEngine()` still returns the Tier-0 default (nothing routes the drain to Gemma)
