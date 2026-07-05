import type { AlbumRepoContract, InvalidationBus } from "@backend/contracts";
import { invalidationBus } from "@backend/db/invalidation";
import { type DbProvider, getDb } from "@backend/db/open";
import type { AlbumRow } from "@backend/types";
import type { Scalar, SQLBatchTuple } from "@op-engineering/op-sqlite";
import {
	asBoolean,
	asNullableString,
	asNumber,
	asString,
	idListParam,
} from "./rows";

/**
 * Album repository (surface parity with the v1 repos; sqlite-storage-core
 * spec). Album ids are generated locally — the only ids this backend ever
 * invents — via a dependency-free uid (media ids always come from the
 * native indexer).
 */

let uidCounter = 0;

/** timestamp + counter + Math.random uid — no crypto dependency needed. */
function uid(): string {
	uidCounter = (uidCounter + 1) % 46656; // 36^3, keeps the segment short
	const time = Date.now().toString(36);
	const counter = uidCounter.toString(36).padStart(3, "0");
	const random = Math.floor(Math.random() * 2176782336).toString(36); // 36^6
	return `alb_${time}${counter}${random}`;
}

const ALBUM_COLUMNS = "id, name, is_smart, smart_tag, sort_order, created_at";

function toAlbumRow(row: Record<string, Scalar>): AlbumRow {
	return {
		id: asString(row.id),
		name: asString(row.name),
		isSmart: asBoolean(row.is_smart),
		smartTag: asNullableString(row.smart_tag),
		sortOrder: asNumber(row.sort_order),
		createdAt: asNumber(row.created_at),
	};
}

export class AlbumRepo implements AlbumRepoContract {
	private readonly db: DbProvider;
	private readonly bus: InvalidationBus;

	constructor(db: DbProvider = getDb, bus: InvalidationBus = invalidationBus) {
		this.db = db;
		this.bus = bus;
	}

	async getManualAlbums(): Promise<AlbumRow[]> {
		const result = await this.db().execute(
			`SELECT ${ALBUM_COLUMNS} FROM albums
			 WHERE is_smart = 0
			 ORDER BY sort_order ASC, created_at ASC`,
		);
		return result.rows.map(toAlbumRow);
	}

	async findById(id: string): Promise<AlbumRow | null> {
		const result = await this.db().execute(
			`SELECT ${ALBUM_COLUMNS} FROM albums WHERE id = ?`,
			[id],
		);
		const raw = result.rows[0];
		return raw === undefined ? null : toAlbumRow(raw);
	}

	async create(name: string, sortOrder: number): Promise<AlbumRow> {
		const row: AlbumRow = {
			id: uid(),
			name,
			isSmart: false,
			smartTag: null,
			sortOrder,
			createdAt: Date.now(),
		};
		await this.db().execute(
			`INSERT INTO albums (id, name, is_smart, smart_tag, sort_order, created_at)
			 VALUES (?, ?, 0, NULL, ?, ?)`,
			[row.id, row.name, row.sortOrder, row.createdAt],
		);
		this.bus.notify("albums");
		return row;
	}

	async update(
		id: string,
		patch: { name?: string; sortOrder?: number },
	): Promise<void> {
		const sets: string[] = [];
		const params: Scalar[] = [];
		if (patch.name !== undefined) {
			sets.push("name = ?");
			params.push(patch.name);
		}
		if (patch.sortOrder !== undefined) {
			sets.push("sort_order = ?");
			params.push(patch.sortOrder);
		}
		if (sets.length === 0) {
			return;
		}
		params.push(id);
		await this.db().execute(
			`UPDATE albums SET ${sets.join(", ")} WHERE id = ?`,
			params,
		);
		this.bus.notify("albums");
	}

	async delete(id: string): Promise<void> {
		const commands: SQLBatchTuple[] = [
			["DELETE FROM album_media WHERE album_id = ?", [id]],
			["DELETE FROM albums WHERE id = ?", [id]],
		];
		await this.db().executeBatch(commands);
		this.bus.notify("albums");
	}

	async addMedia(albumId: string, mediaIds: string[]): Promise<void> {
		if (mediaIds.length === 0) {
			return;
		}
		const maxResult = await this.db().execute(
			"SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM album_media WHERE album_id = ?",
			[albumId],
		);
		const base = asNumber(maxResult.rows[0]?.max_order, -1);
		const now = Date.now();
		const params: Scalar[][] = mediaIds.map((mediaId, index) => [
			albumId,
			mediaId,
			base + 1 + index,
			now,
		]);
		await this.db().executeBatch([
			[
				`INSERT OR IGNORE INTO album_media (album_id, media_id, sort_order, added_at)
				 VALUES (?, ?, ?, ?)`,
				params,
			],
		]);
		this.bus.notify("albums");
	}

	async removeMedia(albumId: string, mediaIds: string[]): Promise<void> {
		if (mediaIds.length === 0) {
			return;
		}
		await this.db().execute(
			`DELETE FROM album_media
			 WHERE album_id = ? AND media_id IN (SELECT value FROM json_each(?))`,
			[albumId, idListParam(mediaIds)],
		);
		this.bus.notify("albums");
	}

	async mediaIdsIn(albumId: string): Promise<string[]> {
		const result = await this.db().execute(
			`SELECT media_id FROM album_media
			 WHERE album_id = ?
			 ORDER BY sort_order ASC, added_at ASC`,
			[albumId],
		);
		return result.rows.map((row) => asString(row.media_id));
	}

	/** Smart album membership: visible media whose tags contain `tag`. */
	async smartMediaIds(tag: string): Promise<string[]> {
		const result = await this.db().execute(
			`SELECT e.media_id FROM enrichment e, json_each(e.tags) je
			 JOIN media m ON m.id = e.media_id
			 WHERE je.value = ? AND m.deleted = 0 AND m.hidden = 0
			 ORDER BY m.taken_at DESC, m.id DESC`,
			[tag],
		);
		return result.rows.map((row) => asString(row.media_id));
	}

	/**
	 * Smart-album membership by SUBSTRING pattern (legacy `findByLabelLike`
	 * parity: `handwrit` matches a `handwritten note` tag). ASCII
	 * case-insensitive via SQLite LIKE defaults.
	 */
	async smartMediaIdsLike(pattern: string): Promise<string[]> {
		const result = await this.db().execute(
			`SELECT DISTINCT e.media_id FROM enrichment e, json_each(e.tags) je
			 JOIN media m ON m.id = e.media_id
			 WHERE je.value LIKE '%' || ? || '%' AND m.deleted = 0 AND m.hidden = 0`,
			[pattern],
		);
		return result.rows.map((row) => asString(row.media_id));
	}

	async countIn(albumId: string): Promise<number> {
		const result = await this.db().execute(
			"SELECT COUNT(*) AS n FROM album_media WHERE album_id = ?",
			[albumId],
		);
		return asNumber(result.rows[0]?.n);
	}
}
