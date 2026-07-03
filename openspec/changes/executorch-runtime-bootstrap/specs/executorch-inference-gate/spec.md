## ADDED Requirements

### Requirement: arm64 iOS/iPadOS 26 Simulator build/install/launch smoke

The agent SHALL validate the RNE arm64-simulator slice on an Apple-Silicon Mac by building, installing, and launching the Debug app on the arm64 iOS/iPadOS 26 Simulator, confirming the pod links, the app boots, `initExecutorch` succeeds, the POC screen renders, and the model download starts. The agent SHALL also attempt `sendMessage` and record the outcome; simulator inference is expected to FAIL (MLX has no CPU fallback) and MUST NOT be treated as a gate.

#### Scenario: Simulator smoke passes for build/install/launch

- **WHEN** the Debug app is built and launched on the arm64 iOS/iPadOS 26 Simulator
- **THEN** the pod links, the app boots, `initExecutorch` succeeds, the POC screen renders, and the model download begins

#### Scenario: Simulator inference outcome is recorded, not gated

- **WHEN** `sendMessage` is attempted on the simulator
- **THEN** the outcome (expected MLX failure with no CPU fallback) is recorded as a data point, and simulator inference is NOT counted toward GO/NO-GO

### Requirement: Human-run on-device inference proof on iPad Pro and Android flagship

The human SHALL execute the on-device inference proof on an M-class iPad Pro (iPadOS 26, MLX) and an Android flagship with 12 GB+ RAM (Vulkan, arm64-v8a). No iPhone is used. On each device, `sendMessage` SHALL be run on at least two distinct test images, and the results table in `design.md` SHALL be filled with caption text, post-load latency, peak RAM, download size/time, tokens/sec (if available), and any OOM/crash.

#### Scenario: Correct captions for two distinct images per device

- **WHEN** the human runs the POC on the iPad Pro and on the Android flagship with two distinct bundled test images each
- **THEN** each device returns a non-empty, semantically-correct caption/object-list for both images, and the metrics are recorded in the `design.md` results table

#### Scenario: Metrics captured for the go/no-go decision

- **WHEN** each on-device run completes
- **THEN** the recorded metrics include post-load latency per image, peak process RAM, first-run download size/time, and whether any OOM/jetsam/native crash occurred

### Requirement: Explicit GO/NO-GO decision recorded

The gate SHALL record an explicit GO or NO-GO decision in `design.md`. GO requires ALL of: correct non-empty captions for ≥2 images on the iPad Pro and on the Android flagship within the product latency budget with no OOM/crash; a passing arm64 simulator build/install/launch smoke; no regression of the shipping ML-Kit pipeline; stakeholder acceptance of the iOS 26.0 / Android 36 floor; and cleared Gemma licensing. Any NO-GO trigger (device OOM even with the increased-memory-limit entitlement, empty/gibberish captions, latency wildly outside budget, unacceptable OS floor, or an unfixable link failure) MUST block the decision.

#### Scenario: GO recorded when all criteria pass

- **WHEN** both devices return correct captions within budget with no OOM/crash, the simulator smoke passes, the ML-Kit path is unregressed, and the OS-floor and licensing sign-offs are obtained
- **THEN** a GO decision is recorded in `design.md` with rationale and sign-off

#### Scenario: NO-GO recorded when a trigger fires

- **WHEN** any NO-GO trigger occurs (e.g. persistent OOM on the iPad Pro, gibberish captions, or an unfixable link failure on either platform)
- **THEN** a NO-GO / re-evaluate decision is recorded in `design.md` with the triggering reason
