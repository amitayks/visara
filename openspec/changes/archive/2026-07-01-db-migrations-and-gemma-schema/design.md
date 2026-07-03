## Context

Visara persists its on-device library in WatermelonDB (`@nozbe/watermelondb@^0.28.0`). The schema is declared once in `src/services/database/schema.ts` as `appSchema({ version: 1, tables: [...] })` and the store is created in `src/services/database/database.ts` with:

```ts
const adapter = new SQLiteAdapter({ schema, jsi: true, onSetUpError: ... });
```

There is **no `migrations` option** on the adapter (`database.ts:12-18`). WatermelonDB's default behavior when the on-disk schema version is lower than the code version and no matching migration exists is to **reset the database** — so any additive column shipped today wipes every user's library. This change is Wave-A foundation #1 of the ML→Gemma-4 migration; it must stand up migration infrastructure **before** any schema growth.

Current data model (all in `src/models/`): `MediaFile` (labels/ocr_texts/album_media/processing_queue `has_many`), `Label` (`media_file_id`, `label`, `confidence`), `OcrText`, `ProcessingQueue` (`status`, `priority`, `retry_count`, `error_message`), `Album`, `AlbumMedia`, `AppSettings`. Tier-0 writes flow through `MediaFileRepository.createWithProcessingResult` / `updateWithProcessingResult`, which set `isProcessed = processingResult.success` (`MediaFileRepository.ts:192,232`) and rebuild `labels`/`ocr_texts`. Read paths that matter for back-compat: `MediaFileRepository.getUnprocessed()` filters `Q.where("is_processed", false)` (`MediaFileRepository.ts:80`); `SearchService.index()` builds a per-media MiniSearch document from `filename` + joined `labels` + joined `ocrText` (`SearchService.ts:47-67`).

Constraints: Biome (tabs, double quotes), `noExplicitAny: error`, strict TS with `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`, legacy decorators (`experimentalDecorators` + `@babel/plugin-proposal-decorators { legacy: true }`), all-static service classes (`noStaticOnlyClass: off` in `biome.json`). WatermelonDB column types are limited to `string` / `number` / `boolean` — there is no `blob` type.

## Goals / Non-Goals

**Goals:**
- Stand up versioned, **non-destructive** migration infrastructure: `migrations.ts`, `schema.ts` → `version: 2`, adapter wired with `migrations`.
- Extend the schema additively for Gemma-4 hybrid enrichment: MediaFile caption/description + processing provenance; label source/type/model_version; processing-queue task_type/model_version; a new `embeddings` table.
- Keep every existing repository, query, and the `SearchService` index working unchanged (additive only).
- Make Gemma re-runs idempotent via version columns, and keep legacy data consistent through in-migration backfills.
- Update the WatermelonDB model classes and `@shared-types/display.ts` to expose the new fields with correct legacy decorators.

**Non-Goals:**
- No Gemma inference, caption generation, embedding generation, or vector KNN search (later waves).
- No **new** producer write paths (Gemma labels/captions, embeddings). The only write-path touch in this wave is tagging the **existing** ML Kit label writes in `MediaFileRepository` with `source = "mlkit"` / `type = "tag"` so new rows match the legacy backfill; all other producers are later waves.
- No new npm dependency and no new path alias (the `@shared-types/*` glob already covers new files in `tsconfig.json` and `babel.config.js`).
- No native SQLite vector extension (e.g., sqlite-vec) in this wave.

## Decisions

### D1: Migration mechanism — `schemaMigrations` + adapter `migrations`, schema/migration lockstep
Create `src/services/database/migrations.ts` exporting `schemaMigrations({ migrations: [{ toVersion: 2, steps: [...] }] })` using `createTable` / `addColumns` / `unsafeExecuteSql` from `@nozbe/watermelondb/Schema/migrations`. Bump `schema.ts` to `version: 2` with the **final** shape (old + new columns), and pass `migrations` into the `SQLiteAdapter` in `database.ts`. `appSchema.version` MUST equal the highest `toVersion`.
- **Why:** This is WatermelonDB's only supported non-destructive upgrade path; the adapter runs migrations in place. `schema.ts` describes the current shape, `migrations.ts` describes the delta to reach it — both must agree or reads/writes desync.
- **Alternatives:** (a) Drop-and-recreate — rejected, wipes user data. (b) Hand-rolled SQL outside WatermelonDB — rejected, bypasses the record cache and sync layer.

### D2: Column types under WatermelonDB's string/number/boolean limit
- `caption`, `description` → `string`, `isOptional: true` ("long text" is just SQLite `TEXT`; there is no separate text type).
- `ai_model_version` → `string`, optional (model identifier, e.g., `gemma-4-2b-int4`).
- `ai_schema_version` → **`number`**, optional (our internal enrichment-output contract version; numeric so "newer schema → re-enrich" is a simple `>` comparison).
- `processed_at` → `number` (epoch-ms), optional, modeled with `@date('processed_at')`.
- `labels.source`, `labels.type` → `string` (required, defaulted via backfill); `labels.model_version` → `string`, optional.
- `processing_queue.task_type` → `string`, indexed; `processing_queue.model_version` → `string`, optional.
- `embeddings.vector` → `string` (serialized payload — see D5); `dim` → `number`; `model_version` → `string`; `created_at` → `number`.
- **Why:** Keeps every column inside WatermelonDB's supported types so the ORM's sanitizers, observers, and JSI adapter keep working.

### D3: `is_processed` derived from `processed_at`, with legacy backfill
Keep the `is_processed` boolean column (still indexed) so existing queries — notably `getUnprocessed()` at `MediaFileRepository.ts:80` and any `observe` — keep working. Establish the invariant `is_processed === (processed_at !== null)`: any pass that stamps `processed_at` also sets `is_processed = true` in the same write. To make legacy data satisfy the invariant, the v2 migration backfills `processed_at` from `updated_at` for already-processed rows via `unsafeExecuteSql("UPDATE media_files SET processed_at = updated_at WHERE is_processed = 1 AND processed_at IS NULL;")`.
- **Why:** Preserves back-compat for all `is_processed` consumers while making `processed_at` the semantic source of truth the prompt requires. `updated_at` is the best available proxy for the original processing time.
- **Alternatives:** (a) Drop `is_processed`, rewrite `getUnprocessed()` to `Q.where("processed_at", null)` — rejected for this wave to keep the change additive and avoid touching read paths. (b) Leave legacy rows with `processed_at = null` — rejected, breaks the invariant for already-processed media.

### D4: Label provenance required-with-backfill vs optional
Add `source` and `type` as **required** columns and backfill existing rows to `mlkit` / `tag` (all v1 labels are ML Kit image labels by construction) via `unsafeExecuteSql("UPDATE labels SET source = 'mlkit' WHERE source IS NULL OR source = '';")` and the analogous `type = 'tag'` update. `model_version` stays optional (null for ML Kit, set for Gemma).
- **Why:** Provenance filtering (`Q.where("source", "gemma")`) becomes null-free and index-friendly. Backfill is safe because the only pre-existing labels are ML Kit tags. To keep **new** ML Kit rows consistent with the backfill, the existing label writes in `MediaFileRepository.createWithProcessingResult` (`MediaFileRepository.ts:201-205`) and `updateWithProcessingResult` (`MediaFileRepository.ts:251-258`) set `source = "mlkit"` / `type = "tag"`. Idempotency of Gemma-derived labels is by-source replace: a Gemma re-run deletes+recreates only `source = 'gemma'` rows, mirroring today's delete-all-then-recreate in `updateWithProcessingResult` (`MediaFileRepository.ts:234-260`) but scoped by source (a later wave).
- **Alternatives:** Optional `source` interpreted as ML Kit at read time — rejected; pushes null handling into every query and the model layer.

### D5: Embeddings as their own table; vector serialized to a string
Create a dedicated `embeddings` table (`media_file_id` indexed, `vector` string, `dim` number, `model_version` string, `created_at` number) with a new `Embedding` model (`belongs_to` `media_files`; `MediaFile` gains a `has_many` `embeddings` association) registered in `database.ts` `modelClasses`. The vector is stored as a serialized string — base64-encoded little-endian `Float32` bytes (compact) or a JSON number array — with `dim` recording the length for validation.
- **Why:** Embeddings are 1-per-(media, model) and grow independently of `media_files`; a child table avoids widening the hot `media_files` row with a large blob and lets a future embedding model version add rows without touching media. WatermelonDB has no blob type, so serialization is mandatory; `dim` guards decode.
- **Alternatives:** (a) Vector column on `media_files` — rejected, bloats the row read on every gallery query. (b) Native sqlite-vec shadow table for KNN — out of scope; would bypass the ORM. Keeping the payload in a WatermelonDB-managed string column preserves consistency now; a native index can be layered later.

### D6: Captions on `MediaFile`, NOT a separate `captions` table
Store the primary `caption` + `description` directly on `media_files` rather than a child `captions` table.
- **Why:** Wave-A enrichment yields exactly one caption + one description per file (1:1). A child table adds a join for `SearchService` indexing (`SearchService.ts:47-67` already reads per-media fields) and turns idempotent re-runs into delete+insert instead of a single-row `UPDATE`. Caption "history"/versioning is already captured by `ai_model_version` / `ai_schema_version` on the same row. A `captions` table would only be justified for concurrent multi-caption needs (multi-lingual, multi-model A/B), which is a later-wave concern.
- **Alternatives:** `captions` child table — deferred; documented here so the decision is explicit.

### D7: Idempotency contract for Gemma re-runs
A Tier-1 pass reads `ai_model_version` / `ai_schema_version` before work: skip when both equal the target; otherwise update the same `media_files` row (caption/description/processed_at + version columns) and replace only `source='gemma'` labels. No new media rows, no accumulation.
- **Why:** Makes re-processing safe to retry and safe to re-run after a model/prompt upgrade — required by the prompt.

### D8: Indexing — minimal but query-aligned
Index `processed_at` (enrichment-candidate scans: `processed_at IS NULL`), `labels.source` and `labels.type` (provenance filters), `processing_queue.task_type` (tier scheduling), and `embeddings.media_file_id` (per-media lookup / FK). Leave `caption`/`description` and the various `model_version` columns unindexed.
- **Why:** Indexes match the real query shapes (D3/D4/D5) without over-indexing long text or low-selectivity version strings.

### D9: Model decorators and shared types
New model fields use `@field(...)` from `@nozbe/watermelondb/decorators`, except `processed_at`/`created_at` which use `@date(...)` (and `@readonly @date` for the auto-managed `created_at` on `Embedding`, matching the existing models). `src/shared-types/display.ts` gains optional caption/source/type display fields (e.g., extend `DisplayLabel` with `source`/`type`; add a `DisplayCaption`/caption field) so UI can render provenance without importing the full model. No `tsconfig.json`/`babel.config.js` change is needed because `@shared-types/*` is already a glob alias.

## Risks / Trade-offs

- **Schema/migration drift** (columns added in one file but not the other) → desynced reads/writes. **Mitigation:** tasks include a lockstep checklist and `npm run typecheck`; every `addColumns`/`createTable` in `migrations.ts` has a mirrored entry in `schema.ts`.
- **`unsafeExecuteSql` bypasses the record cache** → stale in-memory records. **Mitigation:** backfills run only at migration time, before any record is loaded; they only `UPDATE` existing rows (never delete/drop), and match WatermelonDB's documented backfill pattern.
- **`addColumns` leaves legacy rows NULL until backfilled** → required columns momentarily NULL at the SQLite level. **Mitigation:** the model read-sanitizer coerces NULL→default, and backfills target `WHERE ... IS NULL`, so post-migration reads are consistent.
- **Vector-as-string** → storage overhead and no native KNN. **Mitigation:** base64 `Float32` keeps size ~1.33× raw bytes; `dim` validates decode; native vector search is an explicit later-wave layer.
- **No downgrade path** — WatermelonDB resets on a version *downgrade* (running an old v1 build against a v2 DB). **Mitigation:** changes are additive and forward-only; document forward-fix as the rollback strategy (see below).
- **JSI adapter + migrations** → migration must run cleanly under `jsi: true`. **Mitigation:** keep `onSetUpError` logging; migrations execute automatically on adapter setup; verify on a seeded v1 device build.

## Migration Plan

Deploy order (also the tasks order):
1. Add new columns to the existing `tableSchema`s and the new `embeddings` `tableSchema` in `schema.ts`; bump `version` to `2`.
2. Create `migrations.ts` with the single `toVersion: 2` migration: `addColumns` for `media_files`, `labels`, `processing_queue`; `createTable` for `embeddings`; `unsafeExecuteSql` backfills for `labels` (source/type), `processing_queue` (task_type), and `media_files` (`processed_at` from `updated_at`).
3. Wire `migrations` into the `SQLiteAdapter` in `database.ts` and register `Embedding` in `modelClasses`.
4. Update models (`MediaFile`, `Label`, `ProcessingQueue`, new `Embedding`) and `display.ts`.
5. Verify with `npm run typecheck` and `npm run lint`.

**Rollback:** forward-only. Because all steps are additive and non-destructive, a defect is fixed by shipping a corrected v2 (or a v3 migration), never by downgrading — a v1 build against a v2 DB would trigger a WatermelonDB reset. Keep the migration steps small so a follow-up `toVersion: 3` can correct any mistake.

## Open Questions

- **Embedding model & dimensionality** (which model, `dim` value, base64 vs JSON encoding) — deferred to the embedding-generation wave; this wave only fixes the storage contract (`vector` string + `dim`).
- **`ai_schema_version` numeric vs semver string** — chosen numeric for simple ordering; revisit if the enrichment contract needs channel tags (e.g., beta).
- **Whether Tier-0 completion should also stamp `processed_at`** or only Tier-1 — this wave establishes the invariant and columns; which pass writes them is a producer-wave decision, though D3's backfill assumes "processed" means enrichment-complete.
