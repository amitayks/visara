## 1. Bump schema to v2 (`src/services/database/schema.ts`)

- [x] 1.1 Change `appSchema({ version: 1, ... })` to `version: 2`.
- [x] 1.2 In the `media_files` `tableSchema`, add columns: `{ name: "caption", type: "string", isOptional: true }`, `{ name: "description", type: "string", isOptional: true }`, `{ name: "ai_model_version", type: "string", isOptional: true }`, `{ name: "ai_schema_version", type: "number", isOptional: true }`, `{ name: "processed_at", type: "number", isOptional: true, isIndexed: true }`. Leave the existing `is_processed` column in place.
- [x] 1.3 In the `labels` `tableSchema`, add columns: `{ name: "source", type: "string", isIndexed: true }`, `{ name: "type", type: "string", isIndexed: true }`, `{ name: "model_version", type: "string", isOptional: true }`.
- [x] 1.4 In the `processing_queue` `tableSchema`, add columns: `{ name: "task_type", type: "string", isIndexed: true }`, `{ name: "model_version", type: "string", isOptional: true }`.
- [x] 1.5 Add a new `tableSchema` for `embeddings` with columns: `{ name: "media_file_id", type: "string", isIndexed: true }`, `{ name: "vector", type: "string" }`, `{ name: "dim", type: "number" }`, `{ name: "model_version", type: "string" }`, `{ name: "created_at", type: "number" }`.

## 2. Create the migration (`src/services/database/migrations.ts`)

- [x] 2.1 Create `src/services/database/migrations.ts` importing `schemaMigrations`, `createTable`, `addColumns`, `unsafeExecuteSql` from `@nozbe/watermelondb/Schema/migrations`.
- [x] 2.2 Export `const migrations = schemaMigrations({ migrations: [{ toVersion: 2, steps: [...] }] })`.
- [x] 2.3 Add an `addColumns({ table: "media_files", columns: [...] })` step whose columns exactly mirror the five new `media_files` columns from task 1.2 (same names/types/`isOptional`/`isIndexed`).
- [x] 2.4 Add an `addColumns({ table: "labels", columns: [...] })` step mirroring the three new `labels` columns from task 1.3.
- [x] 2.5 Add an `addColumns({ table: "processing_queue", columns: [...] })` step mirroring the two new `processing_queue` columns from task 1.4.
- [x] 2.6 Add a `createTable({ name: "embeddings", columns: [...] })` step whose columns exactly match the `embeddings` `tableSchema` from task 1.5.
- [x] 2.7 Add backfill `unsafeExecuteSql` steps (each must end with `;`): `"UPDATE labels SET source = 'mlkit' WHERE source IS NULL OR source = '';"`, `"UPDATE labels SET type = 'tag' WHERE type IS NULL OR type = '';"`, `"UPDATE processing_queue SET task_type = 'tier0_mlkit' WHERE task_type IS NULL OR task_type = '';"`, `"UPDATE media_files SET processed_at = updated_at WHERE is_processed = 1 AND processed_at IS NULL;"`.
- [x] 2.8 Confirm the ordering runs `addColumns`/`createTable` before the `unsafeExecuteSql` backfills, and that no step deletes rows or drops columns/tables.

## 3. Wire the adapter and register the model (`src/services/database/database.ts`)

- [x] 3.1 Import `{ migrations } from "./migrations"` and pass `migrations` into the `new SQLiteAdapter({ schema, migrations, jsi: true, onSetUpError })` options (keep `jsi` and `onSetUpError`).
- [x] 3.2 Import `{ Embedding } from "@models/Embedding"` and add `Embedding` to the `modelClasses` array of the `Database` constructor.

## 4. Update WatermelonDB model classes (`src/models/`)

- [x] 4.1 `MediaFile.ts`: add `@field("caption") caption?: string;`, `@field("description") description?: string;`, `@field("ai_model_version") aiModelVersion?: string;`, `@field("ai_schema_version") aiSchemaVersion?: number;`, and `@date("processed_at") processedAt?: Date;` (the `date` decorator is already imported). Keep `@field("is_processed") isProcessed!: boolean;`.
- [x] 4.2 `MediaFile.ts`: add `embeddings: { type: "has_many", foreignKey: "media_file_id" }` to `static associations`.
- [x] 4.3 `Label.ts`: add `@field("source") source!: string;`, `@field("type") type!: string;`, `@field("model_version") modelVersion?: string;`.
- [x] 4.4 `ProcessingQueue.ts`: add `@field("task_type") taskType!: string;`, `@field("model_version") modelVersion?: string;`.
- [x] 4.5 Create `src/models/Embedding.ts`: `class Embedding extends Model` with `static table = "embeddings"`, `static associations = { media_files: { type: "belongs_to", key: "media_file_id" } } as const`, fields `@field("media_file_id") mediaFileId!: string;`, `@field("vector") vector!: string;`, `@field("dim") dim!: number;`, `@field("model_version") modelVersion!: string;`, `@readonly @date("created_at") createdAt!: Date;`, and `@relation("media_files", "media_file_id") mediaFile!: MediaFile;` (import `MediaFile` as a type). Use decorators from `@nozbe/watermelondb/decorators`.

## 5. Tag existing ML Kit label writes with provenance (`src/services/database/MediaFileRepository.ts`)

- [x] 5.1 In `createWithProcessingResult` (label creation around `MediaFileRepository.ts:201-205`), set `label.source = "mlkit";` and `label.type = "tag";` on each created label.
- [x] 5.2 In `updateWithProcessingResult` (label creation around `MediaFileRepository.ts:251-258`), set `label.source = "mlkit";` and `label.type = "tag";` on each created label. Do not change the OCR-text writes.

## 6. Update shared display types (`src/shared-types/display.ts`)

- [x] 6.1 Extend `DisplayLabel` with optional provenance fields `source?: string;` and `type?: string;` (keep existing `id`/`label`/`confidence`).
- [x] 6.2 Add a `DisplayEnrichment` interface exposing `caption?: string;` and `description?: string;` for UI rendering of Gemma enrichment. (No `tsconfig.json`/`babel.config.js` change is needed — `@shared-types/*` is already an alias.)

## 7. Consistency checks and verification

- [x] 7.1 Verify schema/migration lockstep: every column in the task-2 `addColumns`/`createTable` steps has an identical entry (name, type, `isOptional`, `isIndexed`) in the corresponding `tableSchema` in `schema.ts`, and vice versa.
- [x] 7.2 Verify `appSchema.version` (2) equals the highest `toVersion` in `migrations.ts` (2), with migrations contiguous from 2.
- [x] 7.3 Run `npm run typecheck` (`tsc --noEmit`) and fix any type errors (respect `noExplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`).
- [x] 7.4 Run `npm run lint` (`biome check .`) and fix formatting/lint (tabs, double quotes).
- [ ] 7.5 Sanity-check a v1→v2 upgrade on a seeded device/build: existing `media_files`/`labels`/`processing_queue` rows persist; migrated labels read `source = "mlkit"`/`type = "tag"`; already-processed media have non-null `processed_at`; the app starts without a WatermelonDB reset.
