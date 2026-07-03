## ADDED Requirements

### Requirement: Versioned schema with an explicit migration path
The database SHALL declare its schema version in `src/services/database/schema.ts` and SHALL provide a matching `schemaMigrations` definition in `src/services/database/migrations.ts` for every version above 1. The `SQLiteAdapter` in `src/services/database/database.ts` MUST be constructed with the `migrations` option so on-device upgrades run in place instead of resetting the database.

#### Scenario: Adapter is wired with migrations
- **WHEN** the app constructs the `SQLiteAdapter`
- **THEN** the adapter options include both `schema` and `migrations`
- **AND** `migrations` is the `schemaMigrations` result exported from `migrations.ts`

#### Scenario: Schema version matches the highest migration
- **WHEN** `schema.version` is read
- **THEN** it equals `2`
- **AND** the highest `toVersion` in `migrations.ts` is also `2`

#### Scenario: Migrations cover every version without gaps
- **WHEN** WatermelonDB validates `schemaMigrations` at startup
- **THEN** the listed migrations have contiguous `toVersion` values starting at 2
- **AND** no migration validation error is thrown

### Requirement: Non-destructive in-place upgrade from v1 to v2
Upgrading an existing v1 database to v2 SHALL preserve all existing rows in every table. No table SHALL be dropped or recreated during the upgrade, and no user data SHALL be wiped.

#### Scenario: Existing rows survive the upgrade
- **WHEN** a device holding v1 data (`media_files`, `labels`, `ocr_texts`, `processing_queue` rows) launches the v2 build
- **THEN** every previously stored row is still present after migration
- **AND** previously stored column values are unchanged

#### Scenario: New required columns receive safe defaults
- **WHEN** the v1→v2 migration adds a new non-optional column to an existing table
- **THEN** pre-existing rows read the WatermelonDB default for that type (empty string, `0`, or `false`)
- **AND** the app does not crash reading legacy rows

### Requirement: One migration step per schema change
Every additive schema change in this change set SHALL be expressed as a `createTable` or `addColumns` step inside the v2 migration, and the identical columns/tables SHALL also appear in the current `appSchema` so `schema.ts` and `migrations.ts` stay in lockstep.

#### Scenario: Altered tables use addColumns
- **WHEN** the v2 migration is inspected
- **THEN** `media_files`, `labels`, and `processing_queue` each have an `addColumns` step listing exactly the new columns added to them
- **AND** those same columns exist in the corresponding `tableSchema` in `schema.ts`

#### Scenario: New embeddings table uses createTable
- **WHEN** the v2 migration is inspected
- **THEN** it contains a `createTable` step for `embeddings`
- **AND** the `embeddings` `tableSchema` in `schema.ts` matches the created table's columns

#### Scenario: Legacy backfills use safe SQL steps
- **WHEN** the v2 migration needs to backfill legacy rows (for provenance or the `is_processed`/`processed_at` invariant)
- **THEN** it uses `unsafeExecuteSql` steps that only `UPDATE` existing rows
- **AND** no backfill step deletes rows or drops columns
