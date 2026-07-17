import type {
	EnrichmentRepoContract,
	InvalidationBus,
} from "@backend/contracts";
import { invalidationBus } from "@backend/db/invalidation";
import { type DbProvider, getDb } from "@backend/db/open";
import type { EnrichmentResult, MediaMetadata } from "@backend/types";
import type { SQLBatchTuple } from "@op-engineering/op-sqlite";
import { asNullableString, asString, parseStringArray } from "./rows";

/**
 * Enrichment + FTS repository (sqlite-storage-core spec).
 *
 * FTS write pattern (deviation documented in db/migrations.ts): `media_fts`
 * is an ordinary FTS5 table whose rowid mirrors `media.rowid`, giving
 * indexed point deletes/inserts; `media_id` rides along as the first
 * UNINDEXED column for hydration. Every FTS mutation happens in the same
 * transaction as its enrichment/media write, keeping the index drift-free;
 * `rebuildFts()` is the escape hatch.
 */

/** Space-joined tag text for the FTS `tags` column (tokenizable). */
function tagsFtsText(tags: readonly string[]): string {
	return tags.join(" ");
}

const FTS_DELETE_SQL =
	"DELETE FROM media_fts WHERE rowid = (SELECT rowid FROM media WHERE id = ?)";

const FTS_INSERT_SQL = `INSERT INTO media_fts (rowid, media_id, caption, description, tags, ocr_text, filename)
SELECT rowid, id, ?, ?, ?, ?, COALESCE(filename, '')
FROM media WHERE id = ?`;

export class EnrichmentRepo implements EnrichmentRepoContract {
	private readonly db: DbProvider;
	private readonly bus: InvalidationBus;

	constructor(db: DbProvider = getDb, bus: InvalidationBus = invalidationBus) {
		this.db = db;
		this.bus = bus;
	}

	/**
	 * Persists the enrichment row, its FTS entry, and the media row's
	 * status/provenance in ONE transaction — the process dying mid-write
	 * leaves the item fully pending or fully done, never half-written.
	 */
	async saveResult(
		mediaId: string,
		result: EnrichmentResult,
		modelVersion: string,
		durationMs: number,
	): Promise<void> {
		const commands: SQLBatchTuple[] = [
			[FTS_DELETE_SQL, [mediaId]],
			[
				FTS_INSERT_SQL,
				[
					result.caption,
					result.description,
					tagsFtsText(result.tags),
					result.text,
					mediaId,
				],
			],
			[
				`INSERT INTO enrichment (media_id, caption, description, tags, ocr_text, duration_ms)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(media_id) DO UPDATE SET
					caption = excluded.caption,
					description = excluded.description,
					tags = excluded.tags,
					ocr_text = excluded.ocr_text,
					duration_ms = excluded.duration_ms`,
				[
					mediaId,
					result.caption,
					result.description,
					JSON.stringify(result.tags),
					result.text,
					durationMs,
				],
			],
			[
				`UPDATE media SET
					enrich_status = 'done',
					enrich_error = NULL,
					model_version = ?,
					processed_at = ?
				 WHERE id = ?`,
				[modelVersion, Date.now(), mediaId],
			],
		];
		await this.db().executeBatch(commands);
		this.bus.notify("media", "enrichment");
	}

	async metadataFor(mediaId: string): Promise<MediaMetadata> {
		const result = await this.db().execute(
			"SELECT caption, description, tags, ocr_text FROM enrichment WHERE media_id = ?",
			[mediaId],
		);
		const row = result.rows[0];
		if (row === undefined) {
			return { labels: [], ocrText: null, caption: null, description: null };
		}
		return {
			labels: parseStringArray(row.tags),
			ocrText: asNullableString(row.ocr_text),
			caption: asNullableString(row.caption),
			description: asNullableString(row.description),
		};
	}

	async uniqueTags(limit: number): Promise<string[]> {
		const result = await this.db().execute(
			`SELECT je.value AS tag, COUNT(*) AS n
			 FROM enrichment e, json_each(e.tags) je
			 GROUP BY je.value
			 ORDER BY n DESC, tag ASC
			 LIMIT ?`,
			[limit],
		);
		return result.rows.map((row) => asString(row.tag));
	}

	async embeddingTextFor(mediaId: string): Promise<string | null> {
		const result = await this.db().execute(
			"SELECT caption, description, tags, ocr_text FROM enrichment WHERE media_id = ?",
			[mediaId],
		);
		const row = result.rows[0];
		if (row === undefined) {
			return null;
		}
		const parts = [
			asString(row.caption),
			asString(row.description),
			parseStringArray(row.tags).join(", "),
			asString(row.ocr_text),
		]
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
		return parts.length > 0 ? parts.join(". ") : null;
	}

	/**
	 * Discovery-time filename row with empty enrichment columns. Insert-only:
	 * an existing FTS row (filename stub OR full enrichment) is left alone, so
	 * re-discovery can never clobber enriched FTS content.
	 */
	async indexFilename(mediaId: string, filename: string): Promise<void> {
		await this.db().execute(
			`INSERT INTO media_fts (rowid, media_id, caption, description, tags, ocr_text, filename)
			 SELECT m.rowid, m.id, '', '', '', '', ?
			 FROM media m
			 WHERE m.id = ?
				AND NOT EXISTS (SELECT 1 FROM media_fts f WHERE f.rowid = m.rowid)`,
			[filename, mediaId],
		);
		this.bus.notify("enrichment");
	}

	/** Full FTS rebuild from media ⋈ enrichment (post-wipe / post-bulk). */
	async rebuildFts(): Promise<void> {
		const commands: SQLBatchTuple[] = [
			["DELETE FROM media_fts"],
			[
				`INSERT INTO media_fts (rowid, media_id, caption, description, tags, ocr_text, filename)
				 SELECT m.rowid, m.id,
					COALESCE(e.caption, ''),
					COALESCE(e.description, ''),
					COALESCE((SELECT group_concat(je.value, ' ') FROM json_each(e.tags) je), ''),
					COALESCE(e.ocr_text, ''),
					COALESCE(m.filename, '')
				 FROM media m
				 LEFT JOIN enrichment e ON e.media_id = m.id
				 WHERE m.deleted = 0`,
			],
		];
		await this.db().executeBatch(commands);
		this.bus.notify("enrichment");
	}
}
