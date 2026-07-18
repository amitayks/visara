import type { EntityRepoContract, InvalidationBus } from "@backend/contracts";
import { invalidationBus } from "@backend/db/invalidation";
import { type DbProvider, getDb } from "@backend/db/open";
import type { EntityBrief, EntityKind, EntityRow } from "@backend/types";
import type { Scalar, SQLBatchTuple } from "@op-engineering/op-sqlite";
import { resolveDetectedNames } from "./resolveDetections";
import { asNumber, asString } from "./rows";

/**
 * User-taught entity repository (user-entity-store spec, design D3/D6).
 * Entity ids are locally generated (`ent_` uid, the album scheme). Links in
 * `entity_media` carry `source`: 'user' rows are the user's exemplar
 * teaching and are never overwritten by the model; 'vlm' rows are the most
 * recent analysis' detections and are replaced wholesale per photo.
 */

const ENTITY_KINDS: readonly EntityKind[] = [
	"person",
	"pet",
	"brand",
	"event",
	"place",
	"other",
];

let uidCounter = 0;

/** timestamp + counter + Math.random uid — no crypto dependency needed. */
function uid(): string {
	uidCounter = (uidCounter + 1) % 46656; // 36^3, keeps the segment short
	const time = Date.now().toString(36);
	const counter = uidCounter.toString(36).padStart(3, "0");
	const random = Math.floor(Math.random() * 2176782336).toString(36); // 36^6
	return `ent_${time}${counter}${random}`;
}

function asKind(value: Scalar | undefined): EntityKind {
	return typeof value === "string" &&
		(ENTITY_KINDS as readonly string[]).includes(value)
		? (value as EntityKind)
		: "other";
}

const ENTITY_COLUMNS = "id, kind, name, description, created_at, updated_at";

function toEntityRow(row: Record<string, Scalar>): EntityRow {
	return {
		id: asString(row.id),
		kind: asKind(row.kind),
		name: asString(row.name),
		description: asString(row.description),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export class EntityRepo implements EntityRepoContract {
	private readonly db: DbProvider;
	private readonly bus: InvalidationBus;

	constructor(db: DbProvider = getDb, bus: InvalidationBus = invalidationBus) {
		this.db = db;
		this.bus = bus;
	}

	async create(
		kind: EntityKind,
		name: string,
		description: string,
	): Promise<EntityRow> {
		const trimmedName = name.trim();
		if (trimmedName.length === 0) {
			throw new Error("EntityRepo: entity name must be non-empty");
		}
		const now = Date.now();
		const row: EntityRow = {
			id: uid(),
			kind,
			name: trimmedName,
			description: description.trim(),
			createdAt: now,
			updatedAt: now,
		};
		await this.db().execute(
			`INSERT INTO entity (${ENTITY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
			[
				row.id,
				row.kind,
				row.name,
				row.description,
				row.createdAt,
				row.updatedAt,
			],
		);
		this.bus.notify("entities");
		return row;
	}

	async update(
		id: string,
		patch: { kind?: EntityKind; name?: string; description?: string },
	): Promise<void> {
		const assignments: string[] = ["updated_at = ?"];
		const params: Scalar[] = [Date.now()];
		if (patch.kind !== undefined) {
			assignments.push("kind = ?");
			params.push(patch.kind);
		}
		if (patch.name !== undefined) {
			const trimmed = patch.name.trim();
			if (trimmed.length === 0) {
				throw new Error("EntityRepo: entity name must be non-empty");
			}
			assignments.push("name = ?");
			params.push(trimmed);
		}
		if (patch.description !== undefined) {
			assignments.push("description = ?");
			params.push(patch.description.trim());
		}
		params.push(id);
		await this.db().execute(
			`UPDATE entity SET ${assignments.join(", ")} WHERE id = ?`,
			params,
		);
		this.bus.notify("entities");
	}

	async delete(id: string): Promise<string[]> {
		const linked = await this.linkedMediaIds(id);
		const commands: SQLBatchTuple[] = [
			["DELETE FROM entity_media WHERE entity_id = ?", [id]],
			["DELETE FROM entity WHERE id = ?", [id]],
		];
		await this.db().executeBatch(commands);
		this.bus.notify("entities");
		return linked;
	}

	async list(): Promise<EntityRow[]> {
		const result = await this.db().execute(
			`SELECT ${ENTITY_COLUMNS} FROM entity ORDER BY updated_at DESC, id DESC`,
		);
		return result.rows.map(toEntityRow);
	}

	async byId(id: string): Promise<EntityRow | null> {
		const result = await this.db().execute(
			`SELECT ${ENTITY_COLUMNS} FROM entity WHERE id = ?`,
			[id],
		);
		const raw = result.rows[0];
		return raw === undefined ? null : toEntityRow(raw);
	}

	/** Exemplar teaching: 'user' source wins over any prior 'vlm' row. */
	async addExamples(entityId: string, mediaIds: string[]): Promise<void> {
		if (mediaIds.length === 0) {
			return;
		}
		const now = Date.now();
		const params: Scalar[][] = mediaIds.map((mediaId) => [
			entityId,
			mediaId,
			now,
		]);
		await this.db().executeBatch([
			[
				`INSERT INTO entity_media (entity_id, media_id, source, added_at)
				 VALUES (?, ?, 'user', ?)
				 ON CONFLICT(entity_id, media_id) DO UPDATE SET source = 'user'`,
				params,
			],
			// Teaching bumps recency so the entity stays inside the
			// recency-capped glossary window (design D1).
			["UPDATE entity SET updated_at = ? WHERE id = ?", [now, entityId]],
		]);
		this.bus.notify("entities");
	}

	async removeExample(entityId: string, mediaId: string): Promise<void> {
		await this.db().execute(
			"DELETE FROM entity_media WHERE entity_id = ? AND media_id = ?",
			[entityId, mediaId],
		);
		this.bus.notify("entities");
	}

	async linkedMediaIds(entityId: string): Promise<string[]> {
		const result = await this.db().execute(
			"SELECT media_id FROM entity_media WHERE entity_id = ? ORDER BY added_at DESC",
			[entityId],
		);
		return result.rows.map((row) => asString(row.media_id));
	}

	async entitiesForMedia(mediaId: string): Promise<EntityRow[]> {
		const result = await this.db().execute(
			`SELECT ${ENTITY_COLUMNS.split(", ")
				.map((c) => `e.${c}`)
				.join(", ")}
			 FROM entity e
			 JOIN entity_media em ON em.entity_id = e.id
			 WHERE em.media_id = ?
			 ORDER BY CASE em.source WHEN 'user' THEN 0 ELSE 1 END, e.updated_at DESC`,
			[mediaId],
		);
		return result.rows.map(toEntityRow);
	}

	async promptContext(limit: number): Promise<EntityBrief[]> {
		if (limit <= 0) {
			return [];
		}
		const result = await this.db().execute(
			`SELECT kind, name, description FROM entity
			 ORDER BY updated_at DESC, id DESC
			 LIMIT ?`,
			[limit],
		);
		return result.rows.map((row) => ({
			name: asString(row.name),
			kind: asKind(row.kind),
			description: asString(row.description),
		}));
	}

	async recordDetections(mediaId: string, names: string[]): Promise<void> {
		const known = await this.db().execute("SELECT id, name FROM entity");
		const entityIds = resolveDetectedNames(
			names,
			known.rows.map((row) => ({
				id: asString(row.id),
				name: asString(row.name),
			})),
		);
		const now = Date.now();
		const commands: SQLBatchTuple[] = [
			[
				"DELETE FROM entity_media WHERE media_id = ? AND source = 'vlm'",
				[mediaId],
			],
		];
		if (entityIds.length > 0) {
			// DO NOTHING: an existing 'user' exemplar link for the same pair is
			// the user's teaching — the model's opinion never overwrites it.
			commands.push([
				`INSERT INTO entity_media (entity_id, media_id, source, added_at)
				 VALUES (?, ?, 'vlm', ?)
				 ON CONFLICT(entity_id, media_id) DO NOTHING`,
				entityIds.map((entityId) => [entityId, mediaId, now]),
			]);
		}
		await this.db().executeBatch(commands);
		this.bus.notify("entities");
	}
}
