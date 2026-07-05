import type { SyncStateContract } from "@backend/contracts";
import { type DbProvider, getDb } from "@backend/db/open";
import { asNullableString } from "./rows";

/**
 * Key/value durable state (change tokens, checkpoints, counters) over the
 * `sync_state` table (design D5). Not a watched table — nothing in the UI
 * observes it, so writes emit no invalidations.
 */
export class SyncStateRepo implements SyncStateContract {
	private readonly db: DbProvider;

	constructor(db: DbProvider = getDb) {
		this.db = db;
	}

	async get(key: string): Promise<string | null> {
		const result = await this.db().execute(
			"SELECT value FROM sync_state WHERE key = ?",
			[key],
		);
		return asNullableString(result.rows[0]?.value);
	}

	async set(key: string, value: string): Promise<void> {
		await this.db().execute(
			`INSERT INTO sync_state (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[key, value],
		);
	}

	async delete(key: string): Promise<void> {
		await this.db().execute("DELETE FROM sync_state WHERE key = ?", [key]);
	}
}
