import type { VectorRepoContract } from "@backend/contracts";
import { type DbProvider, getDb } from "@backend/db/open";
import type { SQLBatchTuple } from "@op-engineering/op-sqlite";
import { asNumber, asString } from "./rows";

/**
 * vec0 vector repository (sqlite-storage-core spec, design D4/D5).
 *
 * The bundled sqlite-vec build is 0.1.9-era and does NOT support
 * `INSERT OR REPLACE` on vec0 tables — every write is DELETE + INSERT inside
 * one transaction, with `embedding_meta.model_version` written in the same
 * transaction. Staleness checks read `embedding_meta` only (it is written
 * and deleted atomically with the vec row, and joining a vec0 virtual table
 * keeps the query planner out of unproven territory).
 *
 * No invalidation notifications: vectors feed search only, and search is
 * request/response — `WatchedTable` deliberately has no member for them.
 */

export const EMBEDDING_DIM = 256;

/** Raw little-endian float32 bytes for binding into the vec0 column. */
function vectorBytes(vec: Float32Array): Uint8Array {
	if (vec.length !== EMBEDDING_DIM) {
		throw new Error(
			`VectorRepo: expected ${EMBEDDING_DIM}-d vector, got ${vec.length}`,
		);
	}
	return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

export class VectorRepo implements VectorRepoContract {
	private readonly db: DbProvider;

	constructor(db: DbProvider = getDb) {
		this.db = db;
	}

	async upsert(
		mediaId: string,
		vec: Float32Array,
		version: string,
	): Promise<void> {
		const bytes = vectorBytes(vec);
		const commands: SQLBatchTuple[] = [
			["DELETE FROM vec_media WHERE media_id = ?", [mediaId]],
			[
				"INSERT INTO vec_media (media_id, embedding) VALUES (?, ?)",
				[mediaId, bytes],
			],
			[
				`INSERT INTO embedding_meta (media_id, model_version) VALUES (?, ?)
				 ON CONFLICT(media_id) DO UPDATE SET model_version = excluded.model_version`,
				[mediaId, version],
			],
		];
		await this.db().executeBatch(commands);
	}

	async knn(
		query: Float32Array,
		k: number,
	): Promise<{ id: string; dist: number }[]> {
		if (k <= 0) {
			return [];
		}
		const result = await this.db().execute(
			`SELECT media_id, distance FROM vec_media
			 WHERE embedding MATCH ? AND k = ?
			 ORDER BY distance`,
			[vectorBytes(query), k],
		);
		return result.rows.map((row) => ({
			id: asString(row.media_id),
			dist: asNumber(row.distance),
		}));
	}

	async missingOrStale(version: string, limit: number): Promise<string[]> {
		const result = await this.db().execute(
			`SELECT m.id FROM media m
			 LEFT JOIN embedding_meta em ON em.media_id = m.id
			 WHERE m.enrich_status = 'done' AND m.deleted = 0
				AND (em.media_id IS NULL OR em.model_version <> ?)
			 ORDER BY m.taken_at DESC, m.id DESC
			 LIMIT ?`,
			[version, limit],
		);
		return result.rows.map((row) => asString(row.id));
	}

	async removeFor(mediaId: string): Promise<void> {
		const commands: SQLBatchTuple[] = [
			["DELETE FROM vec_media WHERE media_id = ?", [mediaId]],
			["DELETE FROM embedding_meta WHERE media_id = ?", [mediaId]],
		];
		await this.db().executeBatch(commands);
	}
}
