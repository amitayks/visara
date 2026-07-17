import {
	MIGRATIONS,
	pendingMigrations,
	readUserVersion,
	runMigrations,
	SCHEMA_V1,
	SCHEMA_VERSION,
	type SqlRunner,
} from "@backend/db/migrations";
import { describe, expect, it } from "@jest/globals";

/**
 * Pure DDL/runner assertions — op-sqlite is never imported (the native
 * module does not exist under jest). The real connection is exercised by
 * the integrator's on-device verification.
 */

const allDdl = SCHEMA_V1.join("\n");

describe("schema v1 DDL", () => {
	it("targets schema version 1 via a single migration", () => {
		expect(SCHEMA_VERSION).toBe(1);
		expect(MIGRATIONS).toHaveLength(1);
		expect(MIGRATIONS[0].toVersion).toBe(1);
		expect(MIGRATIONS[0].statements).toBe(SCHEMA_V1);
	});

	it.each([
		"media",
		"enrichment",
		"embedding_meta",
		"albums",
		"album_media",
		"sync_state",
	])("creates table %s", (table) => {
		expect(allDdl).toMatch(new RegExp(`CREATE TABLE ${table}\\s*\\(`));
	});

	it("creates the FTS5 virtual table with the mandated tokenizer", () => {
		expect(allDdl).toContain("CREATE VIRTUAL TABLE media_fts USING fts5(");
		expect(allDdl).toContain("tokenize='unicode61 remove_diacritics 2'");
		// media_id is the join key, deliberately not tokenized.
		expect(allDdl).toContain("media_id UNINDEXED");
		for (const column of [
			"caption",
			"description",
			"tags",
			"ocr_text",
			"filename",
		]) {
			expect(allDdl).toContain(column);
		}
	});

	it("creates the vec0 virtual table with a 256-d cosine embedding", () => {
		expect(allDdl).toContain("CREATE VIRTUAL TABLE vec_media USING vec0(");
		expect(allDdl).toContain("embedding float[256] distance_metric=cosine");
		expect(allDdl).toContain("media_id TEXT PRIMARY KEY");
	});

	it("creates the three media indexes", () => {
		expect(allDdl).toContain(
			"CREATE INDEX idx_media_visible ON media (deleted, hidden, taken_at DESC)",
		);
		expect(allDdl).toContain(
			"CREATE INDEX idx_media_status_kind ON media (enrich_status, kind)",
		);
		expect(allDdl).toContain("CREATE INDEX idx_media_uri ON media (uri)");
	});

	it("constrains media kind and enrich_status to the contract unions", () => {
		expect(allDdl).toContain(
			"kind TEXT CHECK(kind IN ('image','video','pdf'))",
		);
		expect(allDdl).toContain(
			"CHECK(enrich_status IN ('pending','processing','done','failed','skipped'))",
		);
		expect(allDdl).toContain("enrich_status TEXT DEFAULT 'pending'");
	});

	it("cascades enrichment deletion from media", () => {
		expect(allDdl).toContain(
			"media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE",
		);
	});

	it("declares media invariants (PK, unique uri, defaults)", () => {
		expect(allDdl).toContain("id TEXT PRIMARY KEY");
		expect(allDdl).toContain("uri TEXT UNIQUE NOT NULL");
		expect(allDdl).toContain("hidden INT DEFAULT 0");
		expect(allDdl).toContain("deleted INT DEFAULT 0");
		expect(allDdl).toContain("retry_count INT DEFAULT 0");
	});

	it("keys album_media on (album_id, media_id)", () => {
		expect(allDdl).toContain("PRIMARY KEY (album_id, media_id)");
	});
});

describe("pendingMigrations", () => {
	it("returns everything for a fresh database", () => {
		expect(pendingMigrations(0)).toEqual([...MIGRATIONS]);
	});

	it("returns nothing when already at the current version", () => {
		expect(pendingMigrations(SCHEMA_VERSION)).toEqual([]);
	});

	it("sorts ascending and filters already-applied versions", () => {
		const fake = [
			{ toVersion: 3, statements: ["c"] },
			{ toVersion: 1, statements: ["a"] },
			{ toVersion: 2, statements: ["b"] },
		];
		expect(pendingMigrations(1, fake).map((m) => m.toVersion)).toEqual([2, 3]);
	});
});

class FakeDb implements SqlRunner {
	log: string[] = [];
	version = 0;
	failOn: string | null = null;

	executeSync(query: string): { rows: Array<Record<string, unknown>> } {
		this.log.push(query);
		if (this.failOn !== null && query.includes(this.failOn)) {
			throw new Error(`fake failure on: ${this.failOn}`);
		}
		if (query === "PRAGMA user_version") {
			return { rows: [{ user_version: this.version }] };
		}
		const bump = query.match(/^PRAGMA user_version = (\d+)$/);
		if (bump !== null) {
			this.version = Number(bump[1]);
		}
		return { rows: [] };
	}
}

describe("runMigrations", () => {
	it("applies v1 inside one transaction and bumps user_version", () => {
		const db = new FakeDb();
		runMigrations(db);

		expect(db.version).toBe(1);
		expect(db.log[0]).toBe("PRAGMA user_version");
		expect(db.log[1]).toBe("BEGIN IMMEDIATE");
		for (const statement of SCHEMA_V1) {
			expect(db.log).toContain(statement);
		}
		expect(db.log[db.log.length - 2]).toBe("PRAGMA user_version = 1");
		expect(db.log[db.log.length - 1]).toBe("COMMIT");
	});

	it("is idempotent — a second run executes no DDL", () => {
		const db = new FakeDb();
		runMigrations(db);
		const lengthAfterFirst = db.log.length;

		runMigrations(db);
		expect(db.log.length).toBe(lengthAfterFirst + 1);
		expect(db.log[db.log.length - 1]).toBe("PRAGMA user_version");
		expect(db.version).toBe(1);
	});

	it("rolls back and rethrows when a statement fails", () => {
		const db = new FakeDb();
		db.failOn = "vec0";

		expect(() => runMigrations(db)).toThrow("fake failure on: vec0");
		expect(db.log[db.log.length - 1]).toBe("ROLLBACK");
		expect(db.log).not.toContain("COMMIT");
		expect(db.version).toBe(0);
	});
});

describe("readUserVersion", () => {
	it("reads the pragma value and defaults to 0 on odd shapes", () => {
		const db = new FakeDb();
		db.version = 7;
		expect(readUserVersion(db)).toBe(7);

		const weird: SqlRunner = {
			executeSync: () => ({ rows: [] }),
		};
		expect(readUserVersion(weird)).toBe(0);
	});
});
