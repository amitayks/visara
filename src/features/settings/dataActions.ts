/**
 * Data Management actions for the Settings screen (settings-experience spec):
 * cache clearing and the typed-confirm full data wipe. Feature-side helper so
 * the services facade stays thin (services-ui-facade spec).
 */

import type { Model } from "@nozbe/watermelondb";
import { BackgroundTaskService } from "@services/background/BackgroundTaskService";
import { database } from "@services/database/database";
import { OrchestratorService } from "@services/orchestrator/OrchestratorService";
import { SearchService } from "@services/search/SearchService";
import { SemanticSearchService } from "@services/search/SemanticSearchService";
import { removeItem } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { Image } from "expo-image";

/** The exact phrase the user must type before the wipe is allowed to run. */
export const DELETE_ALL_CONFIRM_PHRASE = "DELETE";

/**
 * Tables wiped by "Delete all data": every media-derived row. Deliberately
 * excluded: `albums` (user-created shells survive; their memberships die with
 * the media they point at) and `app_settings` (settings are preserved by
 * spec). Order puts join/child rows before `media_files` for tidy semantics —
 * everything is destroyed in one batch regardless.
 */
const WIPE_TABLES = [
	"labels",
	"ocr_texts",
	"embeddings",
	"processing_queue",
	"album_media",
	"media_files",
] as const;

/**
 * Clear cached image data (expo-image memory + disk caches — the caches the
 * rebuilt UI renders from). Never touches photos in the device library, the
 * database, the search indexes, or settings.
 */
export async function clearImageCaches(): Promise<void> {
	await Image.clearMemoryCache();
	await Image.clearDiskCache();
}

/**
 * Delete all media-derived data, then restart discovery fire-and-forget.
 *
 * Wipes: media rows, labels, OCR texts, embeddings, processing-queue rows,
 * album memberships, and both search indexes (in-memory + persisted MMKV
 * snapshots). Preserves: MMKV settings + the onboarding flag (never written
 * here), user-created album shells, downloaded model files, and every photo
 * in the device library.
 *
 * Implementation note: batched `destroyPermanently` inside ONE writer block
 * instead of `unsafeResetDatabase()` — live observers (the gallery's
 * `observeVisible()` stays subscribed underneath the pushed Settings screen)
 * keep working and simply see the tables empty, which is what the spec's
 * "gallery re-populates as items are re-discovered" scenario requires.
 * WatermelonDB explicitly warns against resetting with active subscribers.
 */
export async function deleteAllData(): Promise<void> {
	// Quiesce the drain first so it stops writing while rows are destroyed.
	try {
		await OrchestratorService.stop();
	} catch (error) {
		console.warn("deleteAllData: drain stop failed (continuing)", error);
	}

	await database.write(async () => {
		const prepared: Model[] = [];
		for (const table of WIPE_TABLES) {
			const rows = await database.get(table).query().fetch();
			for (const row of rows) {
				prepared.push(row.prepareDestroyPermanently());
			}
		}
		await database.batch(prepared);
	});

	// Lexical index: clears MiniSearch in memory AND its persisted snapshot.
	await SearchService.clearIndex();

	// Semantic index: drop the persisted snapshot, then reload — the embeddings
	// table is empty now, so loadIndex() hydrates an empty in-memory index and
	// re-persists an empty snapshot via its public path.
	removeItem(STORAGE_KEYS.SEMANTIC_INDEX);
	await SemanticSearchService.loadIndex();

	// Zero the drain's processed/failed checkpoint so post-wipe progress
	// counters restart from scratch instead of resuming stale totals.
	await BackgroundTaskService.resetCheckpoint();

	// Restart discovery so the library re-populates without an app restart.
	// Fire-and-forget by contract — the wipe interaction never awaits the scan.
	void OrchestratorService.runInitialProcessing().catch((error) => {
		console.warn("deleteAllData: re-discovery start failed", error);
	});
}
