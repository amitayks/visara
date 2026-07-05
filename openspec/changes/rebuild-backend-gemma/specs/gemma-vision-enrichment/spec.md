# gemma-vision-enrichment — Delta Spec

## ADDED Requirements

### Requirement: One Gemma vision pass produces the full enrichment

Image enrichment SHALL be produced by a single generation against Gemma 4 E2B-it (official Google QAT Q4_0 GGUF + mmproj) through llama.rn's multimodal API: for each image, exactly one prompt requesting exactly one JSON object `{"caption": string, "description": string, "tags": string[], "text": string}` where `text` is a transcription of legible in-photo text (empty string when none). No other ML engine (classification, dedicated OCR, cloud) SHALL participate in enrichment. The engine SHALL sit behind a `VisionEngine` interface (`analyze(fileUri) → EnrichmentResult`, `dispose()`) so an alternative Gemma runtime (LiteRT-LM, executorch) can be adapted later without touching the pipeline.

#### Scenario: A photo of a receipt

- **WHEN** the pipeline enriches a photo containing printed text
- **THEN** one Gemma generation returns caption, description, open-vocabulary tags, and the transcribed text — persisted from that single pass

#### Scenario: Engine is swappable

- **WHEN** a different `VisionEngine` implementation is registered in tests
- **THEN** the pipeline drains against it unchanged (interface-only coupling)

### Requirement: Robust parse with degraded fallback

The engine SHALL extract the first balanced JSON object from the model output and coerce it: missing keys default (`caption`/`description`/`text` → empty string, `tags` → []); tags are lowercased, trimmed, deduplicated, and capped at 16; surrounding prose/code fences are tolerated. When no JSON object can be parsed, the entire raw output (trimmed, capped) SHALL be stored as the caption with empty description/tags/text — a degraded-but-searchable result, not a failure.

#### Scenario: Model wraps JSON in a code fence

- **WHEN** the output is ```` ```json {…} ``` ````
- **THEN** the object parses and enrichment persists normally

#### Scenario: Model rambles without JSON

- **WHEN** the output contains no `{...}` block
- **THEN** the raw text becomes the caption and the item completes with status `done`

### Requirement: Inference-ready image preparation

Before generation, the platform asset URI (`ph://` / `content://`) SHALL be decoded to a temporary `file://` JPEG with longest edge ≤ 896 px (quality ~80) in a bounded app-cache directory; the temp file SHALL be deleted after the generation settles. Preparation failure (unreadable/corrupt asset) SHALL mark the item failed without invoking the model.

#### Scenario: content:// URI reaches llama.cpp as a file

- **WHEN** an Android photo is enriched
- **THEN** the engine receives a `file://…jpg` path and the temp file is gone after the item completes

### Requirement: Serialized generation with timeout and interrupt

Generations SHALL be serialized by a mutex (never concurrent on one context). Each generation SHALL race a 120 s timeout; on expiry the engine SHALL interrupt the native generation and report the item failed. Engine failures SHALL resolve to a failure result (never throw into the drain loop).

#### Scenario: A pathological image hangs generation

- **WHEN** a generation exceeds 120 s
- **THEN** it is interrupted, the item is marked failed (retryable), and the drain continues with the next item

### Requirement: Provenance stamped per enriched row

Every enrichment persist SHALL stamp `media.model_version` with the VLM manifest version tag and `media.processed_at`; `enrichment.duration_ms` SHALL record wall-time. The version tag SHALL equal the delivery manifest's version (single source), enabling the model-version-aware reprocess sweep.

#### Scenario: Version drives reprocessing eligibility

- **WHEN** the VLM model version changes in a later release
- **THEN** rows stamped with the old version are exactly the set the reprocess sweep flips to `pending`

### Requirement: VLM lifecycle bounded by pipeline state

The VLM context SHALL be initialized lazily (first drained item), reused across items, and released on pipeline stop, app-background (after the in-flight item settles), and critical-thermal. Initialization failure SHALL surface as a pipeline-level pause reason, not a crash loop.

#### Scenario: Backgrounding releases memory

- **WHEN** the user backgrounds the app mid-drain
- **THEN** the in-flight item finishes or times out, the context is released, and the drain resumes (context re-initialized) when conditions next allow
