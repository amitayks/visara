# apple-vision-ocr-fallback Specification

## Purpose
TBD - created by archiving change retire-googlemlkit-fix-arm64-simulator. Update Purpose after archive.
## Requirements
### Requirement: An iOS native module exposes Apple Vision text recognition

The system SHALL provide an iOS-only native module that recognizes text in a local image using Apple's Vision framework (`VNRecognizeTextRequest`). It SHALL be implemented following the existing bridge pattern in `ios/Visara/MediaObserver/MediaObserverModule.{swift,m}` (a Swift `@objc` class exposed to React Native via an ObjC `RCT_EXTERN_MODULE`), added under `ios/Visara/VisionOCR/`, and SHALL expose a single promise-returning method that accepts a decodable local image path (`file://` or an app-sandbox path) and resolves with the recognized text plus per-observation bounding boxes and confidences. It SHALL NOT introduce a prebuilt binary or any `EXCLUDED_ARCHS`, so it compiles for every iOS arch (device and arm64 simulator) and does not reintroduce the simulator link conflict.

#### Scenario: Native module returns Vision OCR results for a local image

- **WHEN** the JS side calls the Vision native module with a decodable local image path on iOS
- **THEN** it resolves with the recognized text and per-observation boxes/confidences from `VNRecognizeTextRequest`
- **AND** the module is source-compiled (no vendored binary, no `EXCLUDED_ARCHS`) so it builds for the arm64 simulator

#### Scenario: Vision module is not required on Android

- **WHEN** the app builds and runs on Android
- **THEN** the Apple Vision native module is absent and unreferenced by the Android build
- **AND** Android Tier-0 OCR relies solely on executorch OCR

### Requirement: TextRecognitionService falls back to Apple Vision on iOS

On iOS, `TextRecognitionService.extractText(imageUri)` SHALL route to the Apple Vision native module when executorch OCR is unavailable (runtime not ready or module load failed) or when the OCR-parity gate has selected Vision as the iOS OCR source. The Vision result SHALL be adapted into the same `TextRecognitionResult` shape (`{ text, blocks, processingTime }`) that the executorch path produces, so `MlKitEngine`, `ProcessingService`, and `ProcessingResult` consumers are unaffected by which OCR backend served the request. Whether the fallback is active by default on iOS is POC-gated on the parity result.

#### Scenario: iOS OCR falls back to Vision when executorch OCR is unavailable

- **WHEN** `TextRecognitionService.extractText` runs on iOS and executorch OCR is unavailable or below the selected parity bar
- **THEN** it obtains OCR from the Apple Vision native module
- **AND** it returns a `TextRecognitionResult` in the same shape as the executorch path

#### Scenario: Fallback is transparent to the engine and callers

- **WHEN** a Tier-0 pass on iOS is served by the Vision fallback rather than executorch OCR
- **THEN** `MlKitEngine.analyze` still returns a normal `ProcessingResult` with `success: true`
- **AND** no caller of `processMedia` and no `ProcessingResult` consumer needs to know which OCR backend was used

