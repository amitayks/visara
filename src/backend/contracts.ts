import type {
	AlbumRow,
	EnrichmentResult,
	EntityBrief,
	EntityKind,
	EntityRow,
	MediaItem,
	MediaMetadata,
	MediaRow,
	WatchedTable,
} from "@backend/types";

/**
 * Repository + bus contracts shared across backend modules so they can be
 * built and tested independently (design D5/D6). `db/` and `repo/` implement
 * these; pipeline/search/sync consume them. All methods are async over the
 * op-sqlite connection unless noted.
 */

export interface InvalidationBus {
	/** Fire after COMMIT of a write touching `tables`. */
	notify(...tables: WatchedTable[]): void;
	/** Re-run `run` on any notification of `tables`, 250 ms trailing throttle. */
	watch(tables: WatchedTable[], onChange: () => void): () => void;
}

export interface MediaRepoContract {
	/** ON CONFLICT(uri) metadata-only upsert; one tx per batch. Returns ids seen. */
	upsertBatch(items: MediaItem[]): Promise<void>;
	/** All non-deleted uri→id pairs (reconciliation input). */
	allIds(): Promise<Map<string, string>>; // id -> uri
	/** Purge rows + enrichment + FTS + vectors + album memberships, one tx. */
	purgeByIds(ids: string[]): Promise<void>;
	visibleRows(): Promise<MediaRow[]>;
	byIds(ids: string[]): Promise<MediaRow[]>;
	byId(id: string): Promise<MediaRow | null>;
	setHidden(id: string, hidden: boolean): Promise<void>;
	/** Next pending image, newest taken_at first. */
	nextPending(): Promise<MediaRow | null>;
	markProcessing(id: string): Promise<void>;
	/** Failure bookkeeping: retry_count++, → failed at >= maxRetries. */
	markFailed(id: string, error: string, maxRetries: number): Promise<void>;
	/** processing → pending (crash recovery at pipeline start). */
	resetStaleProcessing(): Promise<void>;
	/** Rows needing work under the current model version. */
	pendingCount(): Promise<number>;
	doneCount(): Promise<number>;
	failedCount(): Promise<number>;
	/** Flip stale/failed rows to pending for reprocess (returns affected). */
	sweepForReprocess(currentModelVersion: string): Promise<number>;
	/** Mark non-image or capability-excluded rows skipped. */
	markSkipped(ids: string[]): Promise<void>;
	/**
	 * Flip specific rows back to pending (teach→re-analyze loop,
	 * personalized-vision-context): status/retry/error reset, deleted rows
	 * excluded. Returns affected count.
	 */
	resetForReanalysis(ids: string[]): Promise<number>;
}

/**
 * User-taught entity store (user-entity-store spec). All writes notify the
 * bus under "entities"; link writes distinguish user exemplars from
 * model detections via `source`.
 */
export interface EntityRepoContract {
	create(
		kind: EntityKind,
		name: string,
		description: string,
	): Promise<EntityRow>;
	update(
		id: string,
		patch: { kind?: EntityKind; name?: string; description?: string },
	): Promise<void>;
	/** Removes the entity and ALL its links; returns the linked media ids. */
	delete(id: string): Promise<string[]>;
	/** Most-recently-updated first. */
	list(): Promise<EntityRow[]>;
	byId(id: string): Promise<EntityRow | null>;
	/** Upsert user exemplar links (source 'user' wins over a prior 'vlm'). */
	addExamples(entityId: string, mediaIds: string[]): Promise<void>;
	removeExample(entityId: string, mediaId: string): Promise<void>;
	/** Media ids linked to the entity (both sources). */
	linkedMediaIds(entityId: string): Promise<string[]>;
	/** Entities linked to a media id, user links first (viewer display). */
	entitiesForMedia(mediaId: string): Promise<EntityRow[]>;
	/** Prompt briefs, most-recently-updated first, capped at `limit`. */
	promptContext(limit: number): Promise<EntityBrief[]>;
	/**
	 * Resolve model-reported names (case-insensitive; unknown names dropped)
	 * and replace this media's 'vlm' links with the matches, preserving all
	 * 'user' links (user-entity-store spec).
	 */
	recordDetections(mediaId: string, names: string[]): Promise<void>;
}

export interface EnrichmentRepoContract {
	/**
	 * Persist enrichment + FTS row + media status 'done' + provenance stamp in
	 * ONE transaction (sqlite-storage-core spec).
	 */
	saveResult(
		mediaId: string,
		result: EnrichmentResult,
		modelVersion: string,
		durationMs: number,
	): Promise<void>;
	metadataFor(mediaId: string): Promise<MediaMetadata>;
	/** Distinct tag values by frequency (suggest + smart albums). */
	uniqueTags(limit: number): Promise<string[]>;
	/** Text used for document embedding (caption. description. tags. ocr). */
	embeddingTextFor(mediaId: string): Promise<string | null>;
	/** Discovery-time FTS filename row (empty enrichment columns). */
	indexFilename(mediaId: string, filename: string): Promise<void>;
	rebuildFts(): Promise<void>;
}

export interface VectorRepoContract {
	/** DELETE+INSERT + embedding_meta version, one tx. vec is 256-d normalized. */
	upsert(mediaId: string, vec: Float32Array, version: string): Promise<void>;
	/** KNN media ids by cosine distance, ascending. */
	knn(query: Float32Array, k: number): Promise<{ id: string; dist: number }[]>;
	/** media ids with enrichment done but no (or stale-version) vector. */
	missingOrStale(version: string, limit: number): Promise<string[]>;
	removeFor(mediaId: string): Promise<void>;
}

export interface AlbumRepoContract {
	getManualAlbums(): Promise<AlbumRow[]>;
	findById(id: string): Promise<AlbumRow | null>;
	create(name: string, sortOrder: number): Promise<AlbumRow>;
	update(
		id: string,
		patch: { name?: string; sortOrder?: number },
	): Promise<void>;
	delete(id: string): Promise<void>;
	addMedia(albumId: string, mediaIds: string[]): Promise<void>;
	removeMedia(albumId: string, mediaIds: string[]): Promise<void>;
	mediaIdsIn(albumId: string): Promise<string[]>;
	/** Smart album membership: media ids whose tags contain smartTag. */
	smartMediaIds(tag: string): Promise<string[]>;
	countIn(albumId: string): Promise<number>;
}

export interface SyncStateContract {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

/** sync_state keys (single registry). */
export const SYNC_KEYS = {
	changeToken: "indexer_change_token",
} as const;
