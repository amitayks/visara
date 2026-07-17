/**
 * Data Management actions for the Settings screen (settings-experience spec):
 * cache clearing and the typed-confirm full data wipe, routed through the v2
 * backend facade (services-ui-facade spec).
 */

import { wipeAllData as wipeBackendData } from "@backend/facade";
import { Image } from "expo-image";

/** The exact phrase the user must type before the wipe is allowed to run. */
export const DELETE_ALL_CONFIRM_PHRASE = "DELETE";

/**
 * Clear cached image data (expo-image memory + disk caches — the caches the
 * UI renders from). Never touches photos in the device library, the
 * database, or settings.
 */
export async function clearImageCaches(): Promise<void> {
	await Image.clearMemoryCache();
	await Image.clearDiskCache();
}

/**
 * Delete all media-derived data, then restart discovery fire-and-forget.
 *
 * Wipes: media rows, enrichment, FTS, vectors, album memberships, and sync
 * tokens (next launch performs a full scan). Preserves: MMKV settings + the
 * onboarding flag, user-created album shells, downloaded model files, and
 * every photo in the device library. The backend wipe deletes ROWS (never
 * tables) so the gallery's live feed subscription survives and simply
 * emits empty, then re-populates as discovery streams back in
 * (sqlite-storage-core spec).
 */
export async function deleteAllData(): Promise<void> {
	await wipeBackendData();
}
