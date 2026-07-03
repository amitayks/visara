# executorch-poc-screen Specification

## Purpose
TBD - created by archiving change executorch-runtime-bootstrap. Update Purpose after archive.
## Requirements
### Requirement: Isolated dev-only POC screen

The change SHALL ship a proof-of-concept screen reachable only behind a `__DEV__`-gated entry point, with zero coupling to `ProcessingService` or the shipping pipeline. The screen MUST NOT be wired into `ProcessingService.processMedia`, MUST NOT write to the database, and MUST NOT be reachable from a production (non-dev) build path.

#### Scenario: Reachable only in dev

- **WHEN** the app runs in a `__DEV__` build
- **THEN** a dev-only entry point navigates to the POC screen, and the entry point is absent from the normal production user flow

#### Scenario: No pipeline coupling

- **WHEN** the POC screen is exercised
- **THEN** it calls `useLLM` directly and does not invoke `ProcessingService`, does not modify `ProcessingResult`, and performs no database writes

### Requirement: Multimodal model load with download, ready, and error states

The POC SHALL load the model via `useLLM({ model: models.llm.gemma4_e2b_multimodal() })`, gate interaction on `llm.isReady`, surface `llm.downloadProgress` during the first-run model download, and handle `llm.error`. The first-run download (~3.2 GB MLX on iOS/iPadOS, ~4.4 GB Vulkan on Android) SHALL be performed over Wi-Fi via the background downloader.

#### Scenario: Download progress then ready

- **WHEN** the POC screen mounts for the first time on Wi-Fi
- **THEN** `llm.downloadProgress` advances while the model downloads, and the inference control is enabled only once `llm.isReady` is true

#### Scenario: Error is surfaced and retryable

- **WHEN** the model download or load fails and sets `llm.error`
- **THEN** the screen surfaces the error and allows a retry rather than crashing

### Requirement: Vision inference over a decodable local file image

The POC SHALL run vision inference by calling `sendMessage` with a **decodable local `file://` image path** — a bundled test JPEG copied to a file path via `react-native-fs`, or the `file://` output of `ThumbnailService.generateThumbnail()`. A raw `content://` MediaStore URI MUST NOT be passed to `sendMessage`. The streamed `llm.response` SHALL be rendered.

#### Scenario: Caption produced from a bundled test image

- **WHEN** the user taps the inference button with a bundled test JPEG at a `file://` path
- **THEN** `sendMessage` is invoked with that decodable `file://` path and the streamed `llm.response` is rendered as it arrives

#### Scenario: content:// URIs are rejected as input

- **WHEN** an image source is prepared for `sendMessage`
- **THEN** it is a `file://` path (bundled asset or `ThumbnailService` output) and never a raw `content://` URI

### Requirement: POC operable on iPad form factor

Because the on-device gate device is an M-class iPad Pro, the POC screen SHALL render and be operable on iPad (tablet layout / larger safe-area) as well as on phone form factors.

#### Scenario: Renders on iPad

- **WHEN** the POC screen is opened on an iPad Pro
- **THEN** its controls (model status, download progress, inference button, response area) render and are operable without truncation or unreachable controls

