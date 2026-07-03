## ADDED Requirements

### Requirement: ProcessingService delegates to a configured engine

`ProcessingService` SHALL hold a configured `AnalysisEngine` (a `private static engine` field) that defaults to the Tier-0 `MlKitEngine`, and `ProcessingService.processMedia(imageUri)` SHALL delegate by returning `this.engine.analyze(imageUri)`. `processMedia` SHALL NOT value-import or directly call `ImageLabelingService` / `TextRecognitionService`; that pass now lives in the engine. The `processQueue` / `addToQueue` / retry logic SHALL be unchanged.

#### Scenario: Default processMedia routes through MlKitEngine

- **WHEN** `ProcessingService.processMedia(imageUri)` is called with the default configuration
- **THEN** it returns the result of `MlKitEngine.analyze(imageUri)`
- **AND** the returned `ProcessingResult` is identical to the pre-change behavior

#### Scenario: processMedia no longer hard-imports the concrete services

- **WHEN** `ProcessingService` is inspected after the change
- **THEN** it does not value-import `ImageLabelingService` or `TextRecognitionService`
- **AND** `processMedia` contains no direct `Promise.all` of those services

### Requirement: The configured engine is swappable without touching callers

`ProcessingService` SHALL expose `setEngine(engine: AnalysisEngine)` and `getEngine(): AnalysisEngine` so the analysis producer can be swapped at runtime. After `setEngine`, subsequent `processMedia` calls SHALL route to the new engine. No caller of `processMedia` and no consumer of `ProcessingResult` SHALL require changes to swap engines.

#### Scenario: Swapping the engine reroutes processMedia

- **WHEN** `ProcessingService.setEngine(otherEngine)` is called
- **THEN** `getEngine()` returns `otherEngine`
- **AND** the next `processMedia(imageUri)` returns `otherEngine.analyze(imageUri)`

#### Scenario: Swapping requires no caller changes

- **WHEN** the configured engine is replaced
- **THEN** callers of `processMedia` and consumers of `ProcessingResult` compile and run unchanged

### Requirement: A registry resolves engines by id and tier

The system SHALL provide an all-static `EngineRegistry` that registers engines and resolves them by `descriptor.id` and by `descriptor.tier`, and exposes a Tier-0 default. It SHALL be seeded with `MlKitEngine` as the Tier-0 default. `getById(id)` SHALL return the engine with that id (or `undefined` when unregistered); `getByTier(tier)` SHALL return the engines registered for that tier; `getDefault()` SHALL return the Tier-0 default engine.

#### Scenario: Resolve the seeded default engine

- **WHEN** `EngineRegistry.getDefault()` is called with no additional registration
- **THEN** it returns `MlKitEngine`

#### Scenario: Resolve an engine by id and by tier

- **WHEN** `EngineRegistry.getById("mlkit")` is called
- **THEN** it returns `MlKitEngine`
- **AND** `EngineRegistry.getByTier("tier0")` includes `MlKitEngine`

#### Scenario: Unregistered id resolves to undefined

- **WHEN** `EngineRegistry.getById("gemma")` is called in this wave
- **THEN** it returns `undefined` (no Tier-1 engine is registered yet)

### Requirement: Callers, DB, search, and UI are unchanged

The `ProcessingResult` contract SHALL remain byte-for-byte unchanged and importable from `@services/ml/ProcessingService`. `MediaFileRepository.createWithProcessingResult` and `updateWithProcessingResult` SHALL consume the delegated result exactly as before, including hard-coding `label.source = "mlkit"` and `label.type = "tag"`. No database schema, search index, or UI change SHALL be introduced by this seam.

#### Scenario: MediaFileRepository consumes the result unchanged

- **WHEN** a `ProcessingResult` from the delegated `processMedia` reaches `MediaFileRepository.createWithProcessingResult`
- **THEN** it reads `success`, `imageLabeling.labels`, and `textRecognition.text`/`blocks` exactly as before
- **AND** persisted labels still carry `source = "mlkit"` and `type = "tag"`

#### Scenario: Result import path is stable

- **WHEN** a consumer imports the result type
- **THEN** `import type { ProcessingResult } from "@services/ml/ProcessingService"` still resolves
