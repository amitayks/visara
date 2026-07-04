import RNFS from "@dr.pogodin/react-native-fs";
import type { MediaFile } from "@models/MediaFile";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { OrchestratorService } from "@services/orchestrator/OrchestratorService";
import { HybridSearchService } from "@services/search/HybridSearchService";
import { SearchService } from "@services/search/SearchService";
import { SemanticSearchService } from "@services/search/SemanticSearchService";

/**
 * The thin UI-facing services surface (services-ui-facade spec). Screens call
 * these instead of composing repositories/services themselves.
 */

/**
 * Hybrid search returning fully hydrated media in fused ranking order via one
 * batched query. Ids deleted between indexing and hydration drop out
 * order-preserving. Degrades to lexical-only inside HybridSearchService.
 */
export async function searchMedia(query: string): Promise<MediaFile[]> {
	const ranked = await HybridSearchService.search(query);
	if (ranked.length === 0) return [];

	const ids = ranked.map((r) => r.id);
	const rows = await MediaFileRepository.findByIds(ids);
	const byId = new Map(rows.map((m) => [m.id, m]));
	const ordered: MediaFile[] = [];
	for (const id of ids) {
		const row = byId.get(id);
		if (row) ordered.push(row);
	}
	return ordered;
}

/**
 * Complete media removal — DB row, lexical index entry, semantic vector,
 * queue rows — via the orchestrator's public cleanup path. `permanent`
 * additionally deletes the underlying file from the device.
 */
export async function removeMedia(
	media: MediaFile,
	options: { permanent: boolean },
): Promise<void> {
	if (options.permanent) {
		try {
			await RNFS.unlink(media.uri);
		} catch (error) {
			// File may already be gone (or URI not unlink-able); app-side cleanup
			// still proceeds so the library stays consistent.
			console.warn("removeMedia: device file deletion failed", error);
		}
	}
	await OrchestratorService.removeMedia(media);
}

let ensureIndexPromise: Promise<void> | null = null;

/**
 * Idempotent load-or-rebuild of the search indexes. Screens never construct
 * indexes; first search intent calls this instead (search-experience spec).
 */
export function ensureSearchIndex(): Promise<void> {
	if (ensureIndexPromise) return ensureIndexPromise;
	ensureIndexPromise = (async () => {
		const loaded = await SearchService.loadIndex();
		if (!loaded) {
			await SearchService.index();
		}
		try {
			await SemanticSearchService.loadIndex();
		} catch (error) {
			// Semantic side is optional; lexical search must not be blocked.
			console.warn("ensureSearchIndex: semantic index load failed", error);
		}
	})().catch((error) => {
		// Allow a retry on the next call instead of caching the rejection.
		ensureIndexPromise = null;
		throw error;
	});
	return ensureIndexPromise;
}
