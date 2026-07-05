import type { InvalidationBus } from "@backend/contracts";
import type { WatchedTable } from "@backend/types";

/**
 * Tiny in-process invalidation bus (design D6). Repositories call
 * `notify(...)` after COMMIT; consumers `watch(tables, cb)` and get called
 * back with a ~250 ms TRAILING throttle: the first notification in a quiet
 * window schedules one callback 250 ms later, further notifications inside
 * the window coalesce into that same callback. The trailing edge guarantees
 * the final database state is always re-queried after a write burst.
 *
 * There is deliberately NO immediate/leading emission here — callers that
 * need an unthrottled first result (e.g. `useVisibleMedia`) run their query
 * once directly and use the bus only for subsequent changes.
 */

interface Watcher {
	readonly tables: readonly WatchedTable[];
	readonly onChange: () => void;
	timer: ReturnType<typeof setTimeout> | null;
}

export const INVALIDATION_THROTTLE_MS = 250;

export class TableInvalidationBus implements InvalidationBus {
	private readonly versions: Record<WatchedTable, number> = {
		media: 0,
		enrichment: 0,
		albums: 0,
	};

	private readonly watchers = new Set<Watcher>();
	private readonly throttleMs: number;

	constructor(throttleMs: number = INVALIDATION_THROTTLE_MS) {
		this.throttleMs = throttleMs;
	}

	/** Monotonic per-table write counter (diagnostics / staleness checks). */
	version(table: WatchedTable): number {
		return this.versions[table];
	}

	notify(...tables: WatchedTable[]): void {
		for (const table of tables) {
			this.versions[table] += 1;
		}
		for (const watcher of this.watchers) {
			if (!watcher.tables.some((t) => tables.includes(t))) {
				continue;
			}
			if (watcher.timer !== null) {
				// A trailing callback is already scheduled — coalesce.
				continue;
			}
			watcher.timer = setTimeout(() => {
				watcher.timer = null;
				if (this.watchers.has(watcher)) {
					watcher.onChange();
				}
			}, this.throttleMs);
		}
	}

	watch(tables: WatchedTable[], onChange: () => void): () => void {
		const watcher: Watcher = { tables: [...tables], onChange, timer: null };
		this.watchers.add(watcher);
		return () => {
			this.watchers.delete(watcher);
			if (watcher.timer !== null) {
				clearTimeout(watcher.timer);
				watcher.timer = null;
			}
		};
	}
}

/** Process-wide bus instance shared by all repositories by default. */
export const invalidationBus = new TableInvalidationBus();
