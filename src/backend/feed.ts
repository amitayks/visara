import { invalidationBus } from "@backend/db/invalidation";
import { MediaRepo } from "@backend/repo/MediaRepo";
import { RowCache } from "@backend/repo/rowCache";
import type { MediaRow } from "@backend/types";
import { useEffect, useRef, useState } from "react";

/**
 * Gallery feed (sqlite-storage-core spec "Reactive queries with
 * reference-stable rows"; replaces src/state/useVisibleMedia.ts):
 *
 * - First emission is immediate (one direct query, no throttle) and flips
 *   `ready` so launch isn't delayed.
 * - Afterwards the invalidation bus re-runs the query on media/enrichment
 *   commits with the bus's 250 ms TRAILING throttle, so drain-speed writes
 *   coalesce and the final database state always renders.
 * - Rows pass through a RowCache: unchanged rows keep object identity across
 *   emissions (React.memo cells keep skipping), and a fully-identical
 *   emission returns the previous array so setState is skipped entirely.
 */

let sharedRepo: MediaRepo | null = null;

function feedRepo(): MediaRepo {
	if (sharedRepo === null) {
		sharedRepo = new MediaRepo();
	}
	return sharedRepo;
}

export function useVisibleMedia(): { media: MediaRow[]; ready: boolean } {
	const [media, setMedia] = useState<MediaRow[]>([]);
	const [ready, setReady] = useState(false);
	const cacheRef = useRef<RowCache | null>(null);
	if (cacheRef.current === null) {
		cacheRef.current = new RowCache();
	}

	useEffect(() => {
		const cache = cacheRef.current ?? new RowCache();
		let disposed = false;
		let runSeq = 0;

		const refresh = (isFirst: boolean): void => {
			runSeq += 1;
			const seq = runSeq;
			feedRepo()
				.visibleRows()
				.then((rows) => {
					if (disposed || seq !== runSeq) {
						return;
					}
					const stable = cache.apply(rows);
					setMedia((previous) => (previous === stable ? previous : stable));
					if (isFirst) {
						setReady(true);
					}
				})
				.catch((error: unknown) => {
					console.error("[feed] visibleRows failed", error);
					if (isFirst && !disposed) {
						// Surface an empty-but-ready grid instead of hanging on launch.
						setReady(true);
					}
				});
		};

		refresh(true);
		const unwatch = invalidationBus.watch(["media", "enrichment"], () => {
			refresh(false);
		});

		return () => {
			disposed = true;
			unwatch();
		};
	}, []);

	return { media, ready };
}
