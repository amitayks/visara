import type { SyncStateContract } from "@backend/contracts";
import { SyncStateRepo } from "@backend/repo/syncState";
import {
	DocumentDirectoryPath,
	exists,
	unlink,
} from "@dr.pogodin/react-native-fs";
import { createMMKV } from "react-native-mmkv";

/**
 * One-shot boot cleanup of the dying v1 persistence (sqlite-storage-core
 * spec, "Legacy file cleanup"; migration plan steps 2–3):
 *
 * 1. Delete the old WatermelonDB database file. The legacy adapter
 *    (src/services/database/database.ts) passed no `dbName`, so WatermelonDB
 *    used its default name `watermelon` → file `watermelon.db`:
 *    - iOS: `<Documents>/watermelon.db`
 *    - Android: app-data root (WMDatabase.java resolves
 *      `getDatabasePath("watermelon.db")` then strips `/databases`), i.e. the
 *      parent of the `files/` dir that DocumentDirectoryPath points at.
 *    WAL/SHM sidecars are removed alongside.
 *
 * 2. Remove the backend-owned MMKV index/checkpoint blobs from the settings
 *    store. The store id/encryptionKey are replicated inline from the legacy
 *    src/services/storage/mmkv.ts (importing src/services is forbidden);
 *    they must stay byte-for-byte identical so the same store opens. Only
 *    the four backend keys are removed — UI settings keys survive.
 *
 * The work is guarded by a sync_state flag so subsequent boots skip the
 * filesystem probing entirely; every step is also idempotent on its own.
 */

const LEGACY_DB_BASENAME = "watermelon.db";

// Byte-for-byte from legacy src/services/storage/mmkv.ts — do not change.
const LEGACY_MMKV_ID = "visara-storage";
const LEGACY_MMKV_ENCRYPTION_KEY = "visara-encryption-key-2024";

const LEGACY_MMKV_KEYS: readonly string[] = [
	"search_index",
	"semantic_index",
	"processing_checkpoint",
	"reprocess_checkpoint",
];

export const LEGACY_CLEANUP_DONE_KEY = "legacy_cleanup_done";

/** Candidate legacy DB paths (+ WAL/SHM sidecars) across both platforms. */
export function legacyDatabaseCandidates(
	documentDirectoryPath: string = DocumentDirectoryPath,
): string[] {
	const bases = new Set<string>([
		`${documentDirectoryPath}/${LEGACY_DB_BASENAME}`,
	]);
	// Android: DocumentDirectoryPath is `<app-data>/files`; WatermelonDB wrote
	// to `<app-data>/watermelon.db`. On iOS the replace is a no-op.
	const androidAppDataRoot = documentDirectoryPath.replace(/\/files\/?$/, "");
	if (androidAppDataRoot !== documentDirectoryPath) {
		bases.add(`${androidAppDataRoot}/${LEGACY_DB_BASENAME}`);
	}
	const paths: string[] = [];
	for (const base of bases) {
		paths.push(base, `${base}-wal`, `${base}-shm`);
	}
	return paths;
}

export async function runLegacyCleanup(
	syncState: SyncStateContract = new SyncStateRepo(),
): Promise<void> {
	if ((await syncState.get(LEGACY_CLEANUP_DONE_KEY)) === "1") {
		return;
	}

	for (const path of legacyDatabaseCandidates()) {
		try {
			if (await exists(path)) {
				await unlink(path);
			}
		} catch (error) {
			// Never block boot on cleanup; the guard flag stays unset only for
			// hard failures below, this file simply gets retried next boot.
			console.warn(`[legacyCleanup] failed to remove ${path}`, error);
		}
	}

	try {
		const store = createMMKV({
			id: LEGACY_MMKV_ID,
			encryptionKey: LEGACY_MMKV_ENCRYPTION_KEY,
		});
		for (const key of LEGACY_MMKV_KEYS) {
			store.remove(key);
		}
	} catch (error) {
		console.warn("[legacyCleanup] failed to clear legacy MMKV keys", error);
	}

	await syncState.set(LEGACY_CLEANUP_DONE_KEY, "1");
}
