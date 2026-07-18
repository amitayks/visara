import type { InvalidationBus, MediaRepoContract } from "@backend/contracts";
import { invalidationBus } from "@backend/db/invalidation";
import { type DbProvider, getDb } from "@backend/db/open";
import type {
	EnrichStatus,
	MediaItem,
	MediaKind,
	MediaRow,
} from "@backend/types";
import type { Scalar, SQLBatchTuple } from "@op-engineering/op-sqlite";
import { asNumber, asString, idListParam } from "./rows";

/**
 * Media table repository (sqlite-storage-core spec). Media ids always come
 * from the native indexer (platform asset identifiers) — this repo never
 * invents ids. All multi-row writes go through `executeBatch`, which runs as
 * one native transaction.
 */

const MEDIA_KINDS: readonly MediaKind[] = ["image", "video", "pdf"];
const ENRICH_STATUSES: readonly EnrichStatus[] = [
	"pending",
	"processing",
	"done",
	"failed",
	"skipped",
];

function asKind(value: Scalar | undefined): MediaKind {
	return typeof value === "string" &&
		(MEDIA_KINDS as readonly string[]).includes(value)
		? (value as MediaKind)
		: "image";
}

function asEnrichStatus(value: Scalar | undefined): EnrichStatus {
	return typeof value === "string" &&
		(ENRICH_STATUSES as readonly string[]).includes(value)
		? (value as EnrichStatus)
		: "pending";
}

const MEDIA_COLUMNS =
	"id, uri, filename, mime, width, height, size, taken_at, kind, hidden, enrich_status";

/** Maps a raw media row to the UI-facing MediaRow shape (design D13). */
export function toMediaRow(row: Record<string, Scalar>): MediaRow {
	const status = asEnrichStatus(row.enrich_status);
	return {
		id: asString(row.id),
		uri: asString(row.uri),
		thumbnailUri: null,
		filename: asString(row.filename),
		mimeType: asString(row.mime),
		creationDate: asNumber(row.taken_at),
		isHidden: asNumber(row.hidden) !== 0,
		isProcessed: status === "done",
		width: asNumber(row.width),
		height: asNumber(row.height),
		fileSize: asNumber(row.size),
		kind: asKind(row.kind),
		enrichStatus: status,
	};
}

const UPSERT_SQL = `INSERT INTO media (id, uri, filename, mime, width, height, size, taken_at, added_at, kind)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
	uri = excluded.uri,
	filename = excluded.filename,
	mime = excluded.mime,
	width = excluded.width,
	height = excluded.height,
	size = excluded.size,
	taken_at = excluded.taken_at,
	kind = excluded.kind,
	deleted = 0
ON CONFLICT(uri) DO UPDATE SET
	filename = excluded.filename,
	mime = excluded.mime,
	width = excluded.width,
	height = excluded.height,
	size = excluded.size,
	taken_at = excluded.taken_at,
	kind = excluded.kind,
	deleted = 0`;

export class MediaRepo implements MediaRepoContract {
	private readonly db: DbProvider;
	private readonly bus: InvalidationBus;

	constructor(db: DbProvider = getDb, bus: InvalidationBus = invalidationBus) {
		this.db = db;
		this.bus = bus;
	}

	/**
	 * Metadata-only upsert keyed on the platform id / uri — enrichment state
	 * (status, retries, provenance, added_at) is never touched on conflict, so
	 * re-discovery never resets pipeline progress (design D8).
	 */
	async upsertBatch(items: MediaItem[]): Promise<void> {
		if (items.length === 0) {
			return;
		}
		const now = Date.now();
		const params: Scalar[][] = items.map((item) => [
			item.id,
			item.uri,
			item.filename,
			item.mimeType,
			item.width,
			item.height,
			item.fileSize,
			item.takenAt,
			now,
			item.kind,
		]);
		await this.db().executeBatch([[UPSERT_SQL, params]]);
		this.bus.notify("media");
	}

	async allIds(): Promise<Map<string, string>> {
		const result = await this.db().execute(
			"SELECT id, uri FROM media WHERE deleted = 0",
		);
		const map = new Map<string, string>();
		for (const row of result.rows) {
			map.set(asString(row.id), asString(row.uri));
		}
		return map;
	}

	/**
	 * Cascading purge in ONE transaction (design D14): album memberships, FTS
	 * rows (addressed via media.rowid BEFORE the media rows go), vectors,
	 * embedding provenance, enrichment, then the media rows themselves.
	 */
	async purgeByIds(ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}
		const list = idListParam(ids);
		const inList = "IN (SELECT value FROM json_each(?))";
		const commands: SQLBatchTuple[] = [
			[`DELETE FROM album_media WHERE media_id ${inList}`, [list]],
			[`DELETE FROM entity_media WHERE media_id ${inList}`, [list]],
			[
				`DELETE FROM media_fts WHERE rowid IN (SELECT rowid FROM media WHERE id ${inList})`,
				[list],
			],
			[`DELETE FROM vec_media WHERE media_id ${inList}`, [list]],
			[`DELETE FROM embedding_meta WHERE media_id ${inList}`, [list]],
			[`DELETE FROM enrichment WHERE media_id ${inList}`, [list]],
			[`DELETE FROM media WHERE id ${inList}`, [list]],
		];
		await this.db().executeBatch(commands);
		this.bus.notify("media", "enrichment", "albums");
	}

	async visibleRows(): Promise<MediaRow[]> {
		const result = await this.db().execute(
			`SELECT ${MEDIA_COLUMNS} FROM media
			 WHERE deleted = 0 AND hidden = 0
			 ORDER BY taken_at DESC, id DESC`,
		);
		return result.rows.map(toMediaRow);
	}

	async byIds(ids: string[]): Promise<MediaRow[]> {
		if (ids.length === 0) {
			return [];
		}
		const result = await this.db().execute(
			`SELECT ${MEDIA_COLUMNS} FROM media WHERE id IN (SELECT value FROM json_each(?))`,
			[idListParam(ids)],
		);
		const byId = new Map<string, MediaRow>();
		for (const raw of result.rows) {
			const row = toMediaRow(raw);
			byId.set(row.id, row);
		}
		// Preserve caller ordering (search ranking depends on it).
		const ordered: MediaRow[] = [];
		for (const id of ids) {
			const row = byId.get(id);
			if (row !== undefined) {
				ordered.push(row);
			}
		}
		return ordered;
	}

	async byId(id: string): Promise<MediaRow | null> {
		const result = await this.db().execute(
			`SELECT ${MEDIA_COLUMNS} FROM media WHERE id = ?`,
			[id],
		);
		const raw = result.rows[0];
		return raw === undefined ? null : toMediaRow(raw);
	}

	async setHidden(id: string, hidden: boolean): Promise<void> {
		await this.db().execute("UPDATE media SET hidden = ? WHERE id = ?", [
			hidden ? 1 : 0,
			id,
		]);
		this.bus.notify("media");
	}

	async nextPending(): Promise<MediaRow | null> {
		const result = await this.db().execute(
			`SELECT ${MEDIA_COLUMNS} FROM media
			 WHERE enrich_status = 'pending' AND kind = 'image' AND deleted = 0
			 ORDER BY taken_at DESC, id DESC
			 LIMIT 1`,
		);
		const raw = result.rows[0];
		return raw === undefined ? null : toMediaRow(raw);
	}

	async markProcessing(id: string): Promise<void> {
		await this.db().execute(
			"UPDATE media SET enrich_status = 'processing' WHERE id = ?",
			[id],
		);
		this.bus.notify("media");
	}

	async markFailed(
		id: string,
		error: string,
		maxRetries: number,
	): Promise<void> {
		await this.db().execute(
			`UPDATE media SET
				retry_count = retry_count + 1,
				enrich_error = ?,
				enrich_status = CASE
					WHEN retry_count + 1 >= ? THEN 'failed'
					ELSE 'pending'
				END
			 WHERE id = ?`,
			[error, maxRetries, id],
		);
		this.bus.notify("media");
	}

	async resetStaleProcessing(): Promise<void> {
		const result = await this.db().execute(
			"UPDATE media SET enrich_status = 'pending' WHERE enrich_status = 'processing'",
		);
		if (result.rowsAffected > 0) {
			this.bus.notify("media");
		}
	}

	async pendingCount(): Promise<number> {
		const result = await this.db().execute(
			`SELECT COUNT(*) AS n FROM media
			 WHERE enrich_status = 'pending' AND kind = 'image' AND deleted = 0`,
		);
		return asNumber(result.rows[0]?.n);
	}

	async doneCount(): Promise<number> {
		const result = await this.db().execute(
			"SELECT COUNT(*) AS n FROM media WHERE enrich_status = 'done' AND deleted = 0",
		);
		return asNumber(result.rows[0]?.n);
	}

	async failedCount(): Promise<number> {
		const result = await this.db().execute(
			"SELECT COUNT(*) AS n FROM media WHERE enrich_status = 'failed' AND deleted = 0",
		);
		return asNumber(result.rows[0]?.n);
	}

	async sweepForReprocess(currentModelVersion: string): Promise<number> {
		const result = await this.db().execute(
			`UPDATE media SET enrich_status = 'pending', retry_count = 0, enrich_error = NULL
			 WHERE deleted = 0 AND kind = 'image'
				AND (
					enrich_status = 'failed'
					OR (enrich_status = 'done' AND (model_version IS NULL OR model_version <> ?))
				)`,
			[currentModelVersion],
		);
		if (result.rowsAffected > 0) {
			this.bus.notify("media");
		}
		return result.rowsAffected;
	}

	/**
	 * Teach→re-analyze loop (user-entity-store spec): targeted rows flip back
	 * to pending with retry/error reset; deleted rows are excluded. Unlike
	 * sweepForReprocess this ignores model_version — the trigger is a
	 * knowledge change, not a model change.
	 */
	async resetForReanalysis(ids: string[]): Promise<number> {
		if (ids.length === 0) {
			return 0;
		}
		const result = await this.db().execute(
			`UPDATE media SET enrich_status = 'pending', retry_count = 0, enrich_error = NULL
			 WHERE deleted = 0 AND kind = 'image'
				AND id IN (SELECT value FROM json_each(?))`,
			[idListParam(ids)],
		);
		if (result.rowsAffected > 0) {
			this.bus.notify("media");
		}
		return result.rowsAffected;
	}

	async markSkipped(ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}
		await this.db().execute(
			"UPDATE media SET enrich_status = 'skipped' WHERE id IN (SELECT value FROM json_each(?))",
			[idListParam(ids)],
		);
		this.bus.notify("media");
	}
}
