# ios-turbomodule-conformance Specification

## Purpose
TBD - created by archiving change fix-ios-turbomodule-specs. Update Purpose after archive.
## Requirements
### Requirement: iOS custom modules resolve as spec-conforming TurboModules

The MediaObserver, ThermalObserver, and VisionTextRecognizerModule iOS implementations SHALL be served through `TurboModuleRegistry.getEnforcing` under bridgeless RN 0.86: each exports under its spec's JS name, declares conformance to its generated `Native*Spec` protocol, and returns its `Native*SpecJSI` from `getTurboModule:`. Promise method selectors SHALL match the generated spec exactly.

#### Scenario: Post-onboarding boot resolves MediaObserver on iOS

- **WHEN** the app boots on the iOS simulator with onboarding already completed (OrchestratorBridge requires MediaDiscoveryService immediately)
- **THEN** no `'MediaObserver' could not be found` invariant fires and the gallery screen renders

#### Scenario: Promise methods callable

- **WHEN** JS invokes `getThermalState()` or `recognizeText(path)`
- **THEN** the generated selector (`…:reject:` / `…resolve:reject:`) dispatches onto the Swift implementation without an unrecognized-selector crash

