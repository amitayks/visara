## ADDED Requirements

### Requirement: A fixed OCR corpus with ground truth is defined

The change SHALL define a small fixed corpus of bundled test images that contain text (e.g. a street sign, a document snippet, a screenshot), each paired with a human-authored ground-truth string. The corpus SHALL be committed as a dev-only fixture and used by both the baseline-capture and the parity-scoring steps so results are reproducible across runs and devices.

#### Scenario: Corpus images each have ground truth

- **WHEN** the parity corpus is assembled
- **THEN** every image in it has an associated ground-truth text string
- **AND** the corpus is a committed dev-only fixture, not part of the production flow

### Requirement: The ML Kit OCR baseline is captured before removal

Because the parity check compares against ML Kit but this change removes ML Kit, the current `@react-native-ml-kit/text-recognition` output for every corpus image SHALL be captured and snapshotted (as a committed JSON fixture) BEFORE the ML Kit packages and pods are removed. The parity-scoring step SHALL read this snapshot rather than calling ML Kit at scoring time.

#### Scenario: Baseline snapshot precedes dependency removal

- **WHEN** the OCR-parity work runs
- **THEN** the ML Kit OCR output for each corpus image is captured into a JSON snapshot while `@react-native-ml-kit/text-recognition` is still installed
- **AND** the snapshot is committed so later scoring does not depend on ML Kit being present

### Requirement: Parity scoring compares executorch (and Vision) OCR to baseline and ground truth

A dev-only parity harness SHALL run each corpus image through executorch OCR — and, on iOS, through the Apple Vision fallback — and score the recognized text against both the ML Kit baseline snapshot and the ground truth using a text-similarity metric (e.g. character error rate and/or token F1). It SHALL report per-image and aggregate scores for each OCR backend so a human can compare them. The metric definition and the exact pass threshold are POC-gated and recorded once real device measurements exist.

#### Scenario: Harness reports per-backend parity scores

- **WHEN** the parity harness runs over the corpus on a device or the arm64 simulator
- **THEN** it produces per-image and aggregate similarity scores for executorch OCR (and Apple Vision on iOS) against the baseline and ground truth
- **AND** the scores are surfaced for human review, not silently discarded

### Requirement: The parity result selects the iOS OCR source

The parity outcome SHALL decide the iOS Tier-0 OCR source: if executorch OCR meets the (POC-set) parity bar, it is the iOS OCR backend; otherwise `TextRecognitionService` uses the Apple Vision fallback on iOS. Android SHALL use executorch OCR regardless (no Vision fallback exists there). The selected default SHALL be recorded in this change's `design.md` alongside the measured scores.

#### Scenario: Below-bar executorch OCR selects Vision on iOS

- **WHEN** executorch OCR scores below the parity bar on iOS
- **THEN** the iOS Tier-0 OCR source is set to the Apple Vision fallback
- **AND** the decision and its supporting scores are recorded in `design.md`

#### Scenario: At-or-above-bar executorch OCR is kept on iOS

- **WHEN** executorch OCR meets or exceeds the parity bar on iOS
- **THEN** the iOS Tier-0 OCR source stays executorch OCR
- **AND** Android continues to use executorch OCR in either outcome
