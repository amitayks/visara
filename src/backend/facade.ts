import NativeMediaIndexer from "@native-modules/NativeMediaIndexer";
import NativeThermalObserver from "@native-modules/NativeThermalObserver";
import { invalidationBus } from "./db/invalidation";
import { runLegacyCleanup } from "./db/legacyCleanup";
import { getDb } from "./db/open";
import { createGemmaEmbed } from "./engine/GemmaEmbed";
import { createGemmaVision } from "./engine/GemmaVision";
import { useVisibleMedia } from "./feed";
import {
	cleanupInferenceTemp,
	toInferenceJpeg,
	wipeInferenceDir,
} from "./media/ImagePrep";
import { LibrarySync } from "./media/LibrarySync";
import { GemmaModelDeliveryService, getModelDir } from "./model/Delivery";
import { Pipeline } from "./pipeline/Pipeline";
import { AlbumRepo } from "./repo/AlbumRepo";
import { EnrichmentRepo } from "./repo/EnrichmentRepo";
import { MediaRepo } from "./repo/MediaRepo";
import { wipeAllData as wipeAllRows } from "./repo/maintenance";
import { SyncStateRepo } from "./repo/syncState";
import { VectorRepo } from "./repo/VectorRepo";
import { search, suggest as suggestQuery } from "./search/Search";
import type {
	AccessStatus,
	AlbumRow,
	EmbedEngine,
	MediaMetadata,
	MediaRow,
} from "./types";

/**
 * The v2 backend facade (services-ui-facade spec): the ONLY sanctioned import
 * surface for screens/features/state. Composition root: repositories, sync,
 * pipeline, delivery, engines, and search are wired here exactly once.
 */

// --- Composition root ---------------------------------------------------------

const mediaRepo = new MediaRepo();
const enrichmentRepo = new EnrichmentRepo();
const vectorRepo = new VectorRepo();
const albumRepo = new AlbumRepo();
const syncState = new SyncStateRepo();

/**
 * Resident embedder singleton (design D4/D10): shared between the pipeline's
 * inline embed step and query-time search so both sides embed in one space.
 */
let residentEmbedder: EmbedEngine | null = null;
function getEmbedder(): EmbedEngine {
	if (!residentEmbedder) {
		residentEmbedder = createGemmaEmbed(getModelDir());
	}
	return residentEmbedder;
}

/** Query embedding — available whenever the embedder artifact is verified. */
async function embedQuery(q: string): Promise<Float32Array | null> {
	const artifact = GemmaModelDeliveryService.getState().artifacts.find(
		(a) => a.key === "embedder",
	);
	if (!artifact?.verified) return null;
	try {
		return await getEmbedder().embedQuery(q);
	} catch (error) {
		console.warn("[facade] query embedding failed (lexical-only)", error);
		return null;
	}
}

let configured = false;
function configureOnce(): void {
	if (configured) return;
	configured = true;

	LibrarySync.configure({
		mediaRepo,
		enrichmentRepo,
		syncState,
		bus: invalidationBus,
	});

	Pipeline.configure({
		mediaRepo,
		enrichmentRepo,
		vectorRepo,
		syncStateService: syncState,
		vision: () => createGemmaVision(getModelDir()),
		embed: () => getEmbedder(),
		delivery: GemmaModelDeliveryService,
		librarySync: LibrarySync,
		imagePrep: { toInferenceJpeg, cleanupInferenceTemp },
		// Live additions re-kick an idle (completed) pipeline (D9).
		bus: invalidationBus,
	});
}

/**
 * One-shot backend init, called from the app bootstrap BEFORE any other
 * facade use: legacy WatermelonDB/MMKV cleanup, crash-straggler temp sweep,
 * and the sync/pipeline composition. Never throws.
 */
export async function initializeBackend(): Promise<void> {
	configureOnce();
	try {
		await runLegacyCleanup();
	} catch (error) {
		console.warn("[facade] legacy cleanup failed (continuing)", error);
	}
	try {
		await wipeInferenceDir();
	} catch (error) {
		console.warn("[facade] inference temp sweep failed (continuing)", error);
	}
}

// --- Gallery feed ---------------------------------------------------------------

export { useVisibleMedia };
export type { MediaRow };

// --- Search ----------------------------------------------------------------------

/**
 * Hybrid search returning fully hydrated rows in fused ranking order
 * (hybrid-search spec). Ids deleted between ranking and hydration drop out
 * order-preserving; degradation to lexical-only happens inside `search`.
 */
export async function searchMedia(query: string): Promise<MediaRow[]> {
	configureOnce();
	const ids = await search(getDb(), embedQuery, query);
	if (ids.length === 0) return [];
	const rows = await mediaRepo.byIds(ids);
	const byId = new Map(rows.map((r) => [r.id, r]));
	const ordered: MediaRow[] = [];
	for (const id of ids) {
		const row = byId.get(id);
		if (row) ordered.push(row);
	}
	return ordered;
}

/** Prefix suggestions (tags by frequency + filename stems). */
export function suggest(prefix: string): Promise<string[]> {
	return suggestQuery(getDb(), prefix);
}

/** Hydrated rows for arbitrary ids (membership sets, dev tooling). */
export function getMediaRowsByIds(ids: string[]): Promise<MediaRow[]> {
	if (ids.length === 0) return Promise.resolve([]);
	return mediaRepo.byIds(ids);
}

/** All currently visible rows (dev/QA tooling; the UI uses useVisibleMedia). */
export function getVisibleMediaRows(): Promise<MediaRow[]> {
	return mediaRepo.visibleRows();
}

/** Failed enrichment rows with stored errors (dev/QA diagnostics). */
export async function getEnrichFailures(
	limit = 10,
): Promise<{ id: string; filename: string; error: string }[]> {
	const result = await getDb().execute(
		"SELECT id, filename, enrich_error FROM media WHERE enrich_status = 'failed' LIMIT ?",
		[limit],
	);
	return result.rows.map((row) => ({
		id: String(row.id ?? ""),
		filename: String(row.filename ?? ""),
		error: String(row.enrich_error ?? ""),
	}));
}

// --- Removal / metadata ------------------------------------------------------------

/**
 * The single removal path (services-ui-facade spec). Non-permanent hides the
 * row (reversible). Permanent requests OS deletion via the system-confirmed
 * flow and purges all traces only for ids the user actually confirmed.
 */
export async function removeMedia(
	media: Pick<MediaRow, "id" | "uri">,
	options: { permanent: boolean },
): Promise<void> {
	if (!options.permanent) {
		await mediaRepo.setHidden(media.id, true);
		return;
	}
	const indexer = NativeMediaIndexer;
	if (!indexer) {
		throw new Error("MediaIndexer unavailable");
	}
	let deleted: string[] = [];
	try {
		const result = await indexer.deleteAssets([media.id]);
		deleted = result.deleted;
	} catch (error) {
		// Non-cancel native failure (spec allows rejection): surface upward.
		throw new Error(
			`Device deletion failed: ${error instanceof Error ? error.message : "unknown"}`,
		);
	}
	if (deleted.includes(media.id)) {
		await mediaRepo.purgeByIds([media.id]);
	}
}

/** Viewer metadata from the enrichment row (empty values pre-enrichment). */
export function loadMediaMetadata(mediaId: string): Promise<MediaMetadata> {
	return enrichmentRepo.metadataFor(mediaId);
}

// --- Data management -----------------------------------------------------------------

/**
 * Full data wipe (settings action): quiesce the drain, delete all rows while
 * observers stay alive, then restart discovery fire-and-forget so the gallery
 * re-populates without an app restart (dataActions contract).
 */
export async function wipeAllData(): Promise<void> {
	try {
		await Pipeline.stop();
	} catch (error) {
		console.warn("[facade] pipeline stop failed (continuing wipe)", error);
	}
	LibrarySync.stop();
	await wipeAllRows({ enrichment: enrichmentRepo });
	void LibrarySync.start()
		.then(() => Pipeline.start())
		.catch((error) => {
			console.warn("[facade] post-wipe re-discovery failed", error);
		});
}

// --- Albums --------------------------------------------------------------------------

export type { AlbumRow };

export function getManualAlbums(): Promise<AlbumRow[]> {
	return albumRepo.getManualAlbums();
}

export function findAlbumById(id: string): Promise<AlbumRow | null> {
	return albumRepo.findById(id);
}

export function createAlbum(
	name: string,
	sortOrder: number,
): Promise<AlbumRow> {
	return albumRepo.create(name, sortOrder);
}

export function updateAlbum(
	id: string,
	patch: { name?: string; sortOrder?: number },
): Promise<void> {
	return albumRepo.update(id, patch);
}

export function deleteAlbum(id: string): Promise<void> {
	return albumRepo.delete(id);
}

export function addMediaToAlbum(
	albumId: string,
	mediaIds: string[],
): Promise<void> {
	return albumRepo.addMedia(albumId, mediaIds);
}

export function removeMediaFromAlbum(
	albumId: string,
	mediaIds: string[],
): Promise<void> {
	return albumRepo.removeMedia(albumId, mediaIds);
}

/** Hydrated member rows of a custom album (membership order). */
export async function getAlbumMediaRows(albumId: string): Promise<MediaRow[]> {
	const ids = await albumRepo.mediaIdsIn(albumId);
	if (ids.length === 0) return [];
	const rows = await mediaRepo.byIds(ids);
	const byId = new Map(rows.map((r) => [r.id, r]));
	const ordered: MediaRow[] = [];
	for (const id of ids) {
		const row = byId.get(id);
		if (row) ordered.push(row);
	}
	return ordered;
}

/** Albums (shells) containing a given media id. */
export async function getAlbumsForMedia(mediaId: string): Promise<AlbumRow[]> {
	const albums = await albumRepo.getManualAlbums();
	const result: AlbumRow[] = [];
	for (const album of albums) {
		const ids = await albumRepo.mediaIdsIn(album.id);
		if (ids.includes(mediaId)) result.push(album);
	}
	return result;
}

/**
 * Smart-album membership: union of substring patterns over enrichment tags
 * (legacy label-LIKE parity).
 */
export async function getSmartAlbumMediaIdsByPatterns(
	patterns: readonly string[],
): Promise<Set<string>> {
	const perPattern = await Promise.all(
		patterns.map((p) => albumRepo.smartMediaIdsLike(p)),
	);
	const ids = new Set<string>();
	for (const list of perPattern) {
		for (const id of list) ids.add(id);
	}
	return ids;
}

// --- Media access (permissions) ---------------------------------------------------------

const ACCESS_TIMEOUT_MS = 8000;

/**
 * Platform photo-library authorization via the MediaIndexer module,
 * timeout-raced so boot can never wedge on a stuck native prompt path
 * (legacy MediaPermissions behavior preserved).
 */
export async function requestMediaAccess(): Promise<AccessStatus> {
	const indexer = NativeMediaIndexer;
	if (!indexer) return "denied";
	try {
		const status = await Promise.race<string>([
			indexer.requestAccess(),
			new Promise<string>((resolve) => {
				setTimeout(() => resolve("__timeout__"), ACCESS_TIMEOUT_MS);
			}),
		]);
		if (status === "__timeout__") {
			// Wedged native await: fall back to a non-prompting status read.
			const current = await indexer.getAccessStatus();
			return normalizeAccess(current);
		}
		return normalizeAccess(status);
	} catch (error) {
		console.warn("[facade] requestMediaAccess failed", error);
		return "denied";
	}
}

function normalizeAccess(raw: string): AccessStatus {
	return raw === "granted" || raw === "limited" ? raw : "denied";
}

// --- Thermal (settings display) -----------------------------------------------------------

/**
 * Thin thermal read for the Settings pause-reason derivation (level >= 2 =
 * throttled), cached from the last read; fail-open false.
 */
let lastThermalThrottled = false;
export const ThermalService = {
	isThrottledForDrain(): boolean {
		NativeThermalObserver?.getThermalState()
			.then((payload) => {
				lastThermalThrottled = (payload?.level ?? 0) >= 2;
			})
			.catch(() => {});
		return lastThermalThrottled;
	},
};

// --- Service re-exports --------------------------------------------------------------------

export { GemmaModelDeliveryService, LibrarySync, Pipeline };
export type {
	DeliveryState,
	DeliveryStatus,
	PipelineEvent,
	PipelineSnapshot,
} from "./types";
