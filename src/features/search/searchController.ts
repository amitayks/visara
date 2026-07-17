/**
 * Search controller (search-experience spec): the ONLY driver of query
 * execution. Subscribes to searchStore.query, debounces 250ms, dispatches
 * straight to the facade (no index lifecycle exists in v2), and routes
 * responses through the store's monotonic request guard. An empty
 * query dispatches nothing and clears the current results. Headless plain
 * TS — started once from App, torn down on unmount; unit-testable through
 * injected deps.
 */

import { searchMedia } from "@backend/facade";
import type { MediaRow as MediaFile } from "@backend/types";
import { useNavStore } from "@state/navStore";
import { useSearchStore } from "@state/searchStore";

export const SEARCH_DEBOUNCE_MS = 250;

export interface SearchControllerDeps {
	/** Subscribe to query-text changes; returns the unsubscribe function. */
	subscribeToQuery: (onChange: (query: string) => void) => () => void;
	searchMedia: (query: string) => Promise<MediaFile[]>;
	beginRequest: () => number;
	completeRequest: (requestId: number, results: MediaFile[]) => void;
	failRequest: (requestId: number) => void;
	/** Empty-query path: clear results/status without touching the facade. */
	clearResults: () => void;
	/**
	 * Subscribe to search-mode changes; returns unsubscribe. Every exit path
	 * (cancel, back, page-swipe) flips searchMode false, so clearing here is
	 * the single place that guarantees the bounded result snapshot is dropped
	 * on exit (ui-state-management + search-experience specs).
	 */
	subscribeToSearchMode: (onChange: (active: boolean) => void) => () => void;
	debounceMs: number;
}

function defaultDeps(): SearchControllerDeps {
	return {
		subscribeToQuery: (onChange) =>
			useSearchStore.subscribe((state) => state.query, onChange),
		searchMedia,
		beginRequest: () => useSearchStore.getState().beginRequest(),
		completeRequest: (requestId, results) =>
			useSearchStore.getState().completeRequest(requestId, results),
		failRequest: (requestId) =>
			useSearchStore.getState().failRequest(requestId),
		clearResults: () => useSearchStore.getState().clear(),
		subscribeToSearchMode: (onChange) =>
			useNavStore.subscribe((state) => state.searchMode, onChange),
		debounceMs: SEARCH_DEBOUNCE_MS,
	};
}

/**
 * Start the controller; returns its teardown. Deps are injectable for unit
 * tests (fake timers + fakes); production callers pass nothing.
 */
export function startSearchController(
	overrides: Partial<SearchControllerDeps> = {},
): () => void {
	const deps: SearchControllerDeps = { ...defaultDeps(), ...overrides };

	let timer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	/**
	 * Controller-side supersession guard ON TOP of the store's monotonic ids:
	 * searchStore.clear() resets latestRequestId, so a request begun before a
	 * clear could collide with the id of one begun after it and apply stale
	 * results. Dispatch sequence numbers never reset, closing that hole.
	 */
	let dispatchSeq = 0;

	const cancelPending = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const dispatch = async (query: string, seq: number): Promise<void> => {
		// v2: no index lifecycle — the facade queries live FTS5/vec0 tables
		// directly (hybrid-search spec), so dispatch goes straight to search.
		const requestId = deps.beginRequest();
		try {
			const results = await deps.searchMedia(query);
			if (stopped || seq !== dispatchSeq) return;
			deps.completeRequest(requestId, results);
		} catch {
			if (stopped || seq !== dispatchSeq) return;
			deps.failRequest(requestId);
		}
	};

	const onQueryChange = (query: string): void => {
		cancelPending();
		const trimmed = query.trim();
		if (trimmed.length === 0) {
			// Spec: empty query dispatches no search and clears current results.
			// The seq bump drops any in-flight response on arrival.
			dispatchSeq += 1;
			deps.clearResults();
			return;
		}
		const seq = ++dispatchSeq;
		timer = setTimeout(() => {
			timer = null;
			void dispatch(trimmed, seq);
		}, deps.debounceMs);
	};

	const onSearchModeChange = (active: boolean): void => {
		if (active) return;
		// Exiting search (any path) drops the bounded snapshot so re-entry
		// starts empty; the seq bump discards any in-flight response.
		cancelPending();
		dispatchSeq += 1;
		deps.clearResults();
	};

	const unsubscribeQuery = deps.subscribeToQuery(onQueryChange);
	const unsubscribeMode = deps.subscribeToSearchMode(onSearchModeChange);

	return () => {
		stopped = true;
		dispatchSeq += 1;
		cancelPending();
		unsubscribeQuery();
		unsubscribeMode();
	};
}
