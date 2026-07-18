/**
 * Schema migrations for visara-v2.db (sqlite-storage-core spec, design D5).
 *
 * The DDL is exported as plain data so the statement list and the
 * user_version bump logic are pure-testable without op-sqlite (the native
 * module does not exist under jest). `runMigrations` codes against a minimal
 * structural `SqlRunner` which the real op-sqlite `DB` satisfies.
 *
 * DEVIATION NOTE (documented per spec): `media_fts` is an ORDINARY FTS5 table
 * — not `content=`/external-content — with `media_id` as the first UNINDEXED
 * column. Rows are kept in sync by repository writes (delete+insert inside
 * the same transaction as the enrichment/media write; `rebuildFts()` is the
 * escape hatch). Write addressing uses the FTS rowid mirrored from
 * `media.rowid` so point deletes/inserts are indexed instead of scanning the
 * UNINDEXED column. Caveat: `media` has a TEXT primary key, so its implicit
 * rowids are only stable while the database is never VACUUMed — nothing in
 * this backend VACUUMs; if that ever changes, run `rebuildFts()` afterwards.
 */

export interface Migration {
	readonly toVersion: number;
	readonly statements: readonly string[];
}

/** Minimal sync-execution surface of an op-sqlite DB (structural). */
export interface SqlRunner {
	executeSync(query: string): { rows: Array<Record<string, unknown>> };
}

export const SCHEMA_VERSION = 2;

export const SCHEMA_V1: readonly string[] = [
	`CREATE TABLE media (
		id TEXT PRIMARY KEY,
		uri TEXT UNIQUE NOT NULL,
		filename TEXT,
		mime TEXT,
		width INT,
		height INT,
		size INT,
		taken_at INT,
		added_at INT,
		kind TEXT CHECK(kind IN ('image','video','pdf')),
		hidden INT DEFAULT 0,
		favorite INT DEFAULT 0,
		deleted INT DEFAULT 0,
		enrich_status TEXT DEFAULT 'pending' CHECK(enrich_status IN ('pending','processing','done','failed','skipped')),
		enrich_error TEXT,
		retry_count INT DEFAULT 0,
		model_version TEXT,
		processed_at INT
	)`,
	"CREATE INDEX idx_media_visible ON media (deleted, hidden, taken_at DESC)",
	"CREATE INDEX idx_media_status_kind ON media (enrich_status, kind)",
	"CREATE INDEX idx_media_uri ON media (uri)",
	`CREATE TABLE enrichment (
		media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
		caption TEXT,
		description TEXT,
		tags TEXT,
		ocr_text TEXT,
		duration_ms INT
	)`,
	`CREATE VIRTUAL TABLE media_fts USING fts5(
		media_id UNINDEXED,
		caption,
		description,
		tags,
		ocr_text,
		filename,
		tokenize='unicode61 remove_diacritics 2'
	)`,
	`CREATE VIRTUAL TABLE vec_media USING vec0(
		media_id TEXT PRIMARY KEY,
		embedding float[256] distance_metric=cosine
	)`,
	`CREATE TABLE embedding_meta (
		media_id TEXT PRIMARY KEY,
		model_version TEXT
	)`,
	`CREATE TABLE albums (
		id TEXT PRIMARY KEY,
		name TEXT,
		is_smart INT,
		smart_tag TEXT,
		sort_order INT,
		created_at INT
	)`,
	`CREATE TABLE album_media (
		album_id TEXT,
		media_id TEXT,
		sort_order INT,
		added_at INT,
		PRIMARY KEY (album_id, media_id)
	)`,
	`CREATE TABLE sync_state (
		key TEXT PRIMARY KEY,
		value TEXT
	)`,
];

/**
 * v2 (personalized-vision-context, design D6): user-taught entity store.
 * Additive only. No FK-cascade reliance (repo-wide posture): EntityRepo
 * deletes its own links, MediaRepo.purgeByIds covers entity_media, and the
 * full wipe clears both tables.
 */
export const SCHEMA_V2: readonly string[] = [
	`CREATE TABLE entity (
		id TEXT PRIMARY KEY,
		kind TEXT CHECK(kind IN ('person','pet','brand','event','place','other')),
		name TEXT NOT NULL,
		description TEXT DEFAULT '',
		created_at INT,
		updated_at INT
	)`,
	"CREATE INDEX idx_entity_updated ON entity (updated_at DESC)",
	`CREATE TABLE entity_media (
		entity_id TEXT,
		media_id TEXT,
		source TEXT DEFAULT 'user' CHECK(source IN ('user','vlm')),
		added_at INT,
		PRIMARY KEY (entity_id, media_id)
	)`,
	"CREATE INDEX idx_entity_media_media ON entity_media (media_id)",
];

export const MIGRATIONS: readonly Migration[] = [
	{ toVersion: 1, statements: SCHEMA_V1 },
	{ toVersion: 2, statements: SCHEMA_V2 },
];

/** Migrations still to apply on a database currently at `currentVersion`. */
export function pendingMigrations(
	currentVersion: number,
	migrations: readonly Migration[] = MIGRATIONS,
): Migration[] {
	return migrations
		.filter((m) => m.toVersion > currentVersion)
		.sort((a, b) => a.toVersion - b.toVersion);
}

export function readUserVersion(db: SqlRunner): number {
	const result = db.executeSync("PRAGMA user_version");
	const value = result.rows[0]?.user_version;
	return typeof value === "number" ? value : 0;
}

/**
 * Idempotent runner: applies each pending migration and its user_version
 * bump inside one transaction (user_version participates in transactions, so
 * a crash mid-migration rolls back to the previous version cleanly).
 */
export function runMigrations(db: SqlRunner): void {
	const current = readUserVersion(db);
	for (const migration of pendingMigrations(current)) {
		if (!Number.isSafeInteger(migration.toVersion) || migration.toVersion < 1) {
			throw new Error(
				`Invalid migration target version: ${migration.toVersion}`,
			);
		}
		db.executeSync("BEGIN IMMEDIATE");
		try {
			for (const statement of migration.statements) {
				db.executeSync(statement);
			}
			db.executeSync(`PRAGMA user_version = ${migration.toVersion}`);
			db.executeSync("COMMIT");
		} catch (error) {
			try {
				db.executeSync("ROLLBACK");
			} catch {
				// Connection-level failure — the original error is the one to surface.
			}
			throw error;
		}
	}
}
