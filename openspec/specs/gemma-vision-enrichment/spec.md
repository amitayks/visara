# gemma-vision-enrichment Specification

## Purpose
TBD - created by archiving change rebuild-backend-gemma. Update Purpose after archive.
## Requirements
### Requirement: One Gemma vision pass produces the full enrichment

Image enrichment SHALL be produced by a single generation against Gemma 4 E2B-it (official Google QAT Q4_0 GGUF + mmproj) through llama.rn's multimodal API: for each image, exactly one prompt requesting exactly one JSON object `{"caption": string, "description": string, "tags": string[], "text": string, "entities": string[]}` where `text` is a transcription of legible in-photo text (empty string when none) and `entities` lists the exact names of user-taught entities the model judges clearly present (empty array when none or when no entities were provided). No other ML engine SHALL participate in enrichment. The engine SHALL sit behind a `VisionEngine` interface (`analyze(fileUri, context?) → VisionAnalysis`, `dispose()`) so an alternative Gemma runtime can be adapted later without touching the pipeline; `context` is optional and its absence yields the generic prompt.

#### Scenario: A photo of a receipt

- **WHEN** the pipeline enriches a photo containing printed text
- **THEN** one Gemma generation returns caption, description, open-vocabulary tags, transcribed text, and (possibly empty) entity matches — persisted from that single pass

#### Scenario: Engine is swappable

- **WHEN** a different `VisionEngine` implementation is registered in tests
- **THEN** the pipeline drains against it unchanged (interface-only coupling)

### Requirement: Robust parse with degraded fallback

The engine SHALL extract the first balanced JSON object from the model output and coerce it: missing keys default (`caption`/`description`/`text` → empty string, `tags`/`entities` → []); tags are lowercased, trimmed, deduplicated, and capped at 16; entities are trimmed, deduplicated case-insensitively (original casing preserved), and capped at 8; surrounding prose/code fences are tolerated. When no JSON object can be parsed, the entire raw output (trimmed, capped) SHALL be stored as the caption with empty description/tags/text/entities — a degraded-but-searchable result, not a failure.

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

### Requirement: Per-item prompt assembly with the user's entity glossary

The prompt SHALL be assembled per item by a pure, dependency-free module from an `AnalysisContext` of entity briefs (name, kind, description). When briefs are present, the user turn SHALL include a glossary section framed as user reference data — not instructions — directing the model to use matching names naturally in caption/description/tags and to list exact matched names in `entities`, matching only what is clearly visible. When no briefs are present the glossary section and entity instructions SHALL be omitted except the constant `entities` key in the output schema. Briefs SHALL be sanitized (control characters stripped, whitespace collapsed) and capped: name ≤ 60 chars, description ≤ 200 chars, ≤ 24 entities, glossary ≤ ~2,400 chars — bounding prompt growth inside the 4,096-token context.

#### Scenario: Glossary entry shapes the result

- **WHEN** the context contains `{name: "Biscuit", kind: "pet", description: "golden retriever, red collar"}` and the photo shows that dog
- **THEN** the assembled prompt contains the Biscuit brief and the parsed result can carry `entities: ["Biscuit"]` with "biscuit" usable as a tag

#### Scenario: Hostile description cannot break the prompt

- **WHEN** an entity description contains newlines and "ignore previous instructions"
- **THEN** the brief is flattened to one sanitized line inside the glossary and the output contract is unchanged

### Requirement: Analysis context provision is fail-soft

The pipeline SHALL obtain the `AnalysisContext` from an injected provider before each item; provider absence or failure SHALL degrade to the empty context (generic prompt), never fail or delay the item.

#### Scenario: Entity store read fails

- **WHEN** `promptContext()` rejects
- **THEN** the item is analyzed with the generic prompt and completes normally
