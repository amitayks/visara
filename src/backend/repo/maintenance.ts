import type {
	EnrichmentRepoContract,
	InvalidationBus,
} from "@backend/contracts";
import { invalidationBus } from "@backend/db/invalidation";
import { type DbProvider, getDb } from "@backend/db/open";
import type { SQLBatchTuple } from "@op-engineering/op-sqlite";
import { EnrichmentRepo } from "./EnrichmentRepo";

export interface MaintenanceDeps {
	db?: DbProvider;
	bus?: InvalidationBus;
	enrichment?: EnrichmentRepoContract;
}

/**
 * Wipe-all-data (sqlite-storage-core spec "Wipe preserves schema and live
 * observers"; design D14): deletes ROWS, never tables, and never closes the
 * connection — active `watchQuery`/feed subscriptions stay alive and emit
 * empty result sets through the bus notification. Album shells and MMKV
 * settings survive; sync_state is cleared so the next launch performs a
 * full discovery scan; `rebuildFts()` runs afterwards as the consistency
 * escape hatch.
 */
export async function wipeAllData(deps: MaintenanceDeps = {}): Promise<void> {
	const dbProvider = deps.db ?? getDb;
	const bus = deps.bus ?? invalidationBus;
	const enrichment = deps.enrichment ?? new EnrichmentRepo(dbProvider, bus);

	const commands: SQLBatchTuple[] = [
		["DELETE FROM album_media"],
		["DELETE FROM media_fts"],
		["DELETE FROM vec_media"],
		["DELETE FROM embedding_meta"],
		["DELETE FROM enrichment"],
		["DELETE FROM media"],
		["DELETE FROM sync_state"],
	];
	await dbProvider().executeBatch(commands);

	await enrichment.rebuildFts();

	bus.notify("media", "enrichment", "albums");
}
