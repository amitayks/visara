import { type DB, open } from "@op-engineering/op-sqlite";
import { runMigrations } from "./migrations";

/**
 * Single database connection for the v2 backend (sqlite-storage-core spec).
 * The file is deliberately namespaced `visara-v2.db` — the legacy
 * WatermelonDB file is abandoned and removed by `legacyCleanup`.
 */
export const DB_NAME = "visara-v2.db";

/** Lazy provider seam so repos can be constructed without opening the DB. */
export type DbProvider = () => DB;

let singleton: DB | null = null;

/**
 * Opens (once) and returns the shared connection: WAL journal, foreign keys
 * ON, schema migrated to the current version. Synchronous so the schema is
 * guaranteed before the first query; op-sqlite's `open` and `executeSync`
 * are native-synchronous calls.
 */
export function getDb(): DB {
	if (singleton === null) {
		const db = open({ name: DB_NAME });
		db.executeSync("PRAGMA journal_mode = WAL");
		db.executeSync("PRAGMA foreign_keys = ON");
		runMigrations(db);
		singleton = db;
	}
	return singleton;
}

/** Closes and clears the singleton (tests / teardown). Safe when not open. */
export function closeDb(): void {
	if (singleton !== null) {
		singleton.close();
		singleton = null;
	}
}
