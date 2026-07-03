## Why

Visara's on-device library persists Tier-0 ML Kit output against a fixed WatermelonDB schema (`src/services/database/schema.ts`, `version: 1`) that has **no migration path**: the `SQLiteAdapter` in `src/services/database/database.ts` is constructed without a `migrations` option, so any column added today would wipe every user's on-device SQLite database on the next launch. Before the ML→Gemma-4 migration can add multimodal captions, provenance-tagged tags/entities, tiered scheduling, and semantic vector search, we must first stand up non-destructive migration infrastructure and extend the schema **additively** so a Gemma pass can be re-run idempotently without disturbing the fast Tier-0 data users already have.

## What Changes

- **Migration infrastructure (foundation):** add `src/services/database/migrations.ts` using WatermelonDB `schemaMigrations`, bump `schema.ts` to `version: 2`, and pass `migrations` into the `SQLiteAdapter`. Every schema change below ships a matching migration step so no on-device data is wiped.
- **`media_files` enrichment:** add `caption` and `description` (long text) plus processing metadata `ai_model_version`, `ai_schema_version`, `processed_at`. Keep `is_processed` for back-compat but derive its meaning from `processed_at`.
- **`labels` provenance:** add `source`, `type`, and optional `model_version` so ML Kit and Gemma tags/entities coexist and stay distinguishable.
- **`processing_queue` tiers:** add `task_type` and `model_version` so distinct Tier-0/Tier-1 passes can be scheduled independently.
- **New `embeddings` table:** `media_file_id`, `vector`, `dim`, `model_version`, `created_at` for on-device semantic/vector search.
- **Model + type updates:** update WatermelonDB model classes `MediaFile`, `Label`, `ProcessingQueue`, add new `Embedding`, register it in `database.ts` `modelClasses`, and extend `src/shared-types/display.ts` for the new display fields.
- **Additive / non-breaking:** existing repositories, queries, and the `SearchService` MiniSearch index keep working unchanged; every new column is optional to read.

## Capabilities

### New Capabilities
- `database-migrations`: versioned, non-destructive WatermelonDB migration infrastructure — every schema-version bump has a matching `schemaMigrations` step and the adapter runs migrations in place on upgrade.
- `media-enrichment-schema`: MediaFile caption/description plus AI processing metadata (`ai_model_version`, `ai_schema_version`, `processed_at`) that makes Gemma enrichment re-runnable and idempotent while keeping `is_processed` back-compat.
- `label-provenance`: `source`/`type`/`model_version` on labels so Tier-0 (ML Kit) and Tier-1 (Gemma) annotations coexist without collision and are query-distinguishable.
- `processing-queue-tiers`: `task_type`/`model_version` on the processing queue so Tier-0 and Tier-1 work is enqueued and scheduled as distinct passes.
- `semantic-embeddings`: an `embeddings` table + `Embedding` model for storing per-media vectors that will power on-device semantic search.

### Modified Capabilities
<!-- None. openspec/specs/ is empty; this is the first spec-driven change, so no existing requirements change. -->

## Impact

- **Code:** `src/services/database/schema.ts` (v1→v2), `src/services/database/database.ts` (wire `migrations`, register `Embedding`), new `src/services/database/migrations.ts`; models `src/models/MediaFile.ts`, `src/models/Label.ts`, `src/models/ProcessingQueue.ts`, new `src/models/Embedding.ts`; `src/shared-types/display.ts`.
- **Data:** on-device SQLite upgrades v1→v2 in place; existing rows receive WatermelonDB defaults for new required columns (`''` / `0` / `false`) and `null` for optional columns.
- **Dependencies:** none added — `@nozbe/watermelondb@^0.28.0` already ships `schemaMigrations` / `createTable` / `addColumns`; no `@shared-types` alias change needed (glob `@shared-types/*` already covers new files in `tsconfig.json` and `babel.config.js`).
- **Consumers:** `MediaFileRepository`, `LabelRepository`, `ProcessingQueueRepository`, `OcrTextRepository`, and `SearchService` continue to compile and run; new fields are additive.
- **Out of scope (later waves):** Gemma inference service, caption/embedding generation, vector KNN search, and repository write-path changes that populate the new columns.
