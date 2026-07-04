import type { MediaFile } from "@models/MediaFile";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type SearchStatus = "idle" | "searching" | "done" | "error";

interface SearchState {
	query: string;
	status: SearchStatus;
	results: MediaFile[];
	/** Monotonic request id — the stale-response guard (search-experience spec). */
	latestRequestId: number;
	setQuery: (query: string) => void;
	beginRequest: () => number;
	completeRequest: (requestId: number, results: MediaFile[]) => void;
	failRequest: (requestId: number) => void;
	clear: () => void;
}

export const useSearchStore = create<SearchState>()(
	subscribeWithSelector((set, get) => ({
		query: "",
		status: "idle",
		results: [],
		latestRequestId: 0,

		setQuery: (query) => set({ query }),
		beginRequest: () => {
			const id = get().latestRequestId + 1;
			set({ latestRequestId: id, status: "searching" });
			return id;
		},
		completeRequest: (requestId, results) => {
			// Older responses never overwrite newer ones.
			if (requestId !== get().latestRequestId) return;
			set({ results, status: "done" });
		},
		failRequest: (requestId) => {
			if (requestId !== get().latestRequestId) return;
			set({ status: "error" });
		},
		clear: () =>
			set({ query: "", status: "idle", results: [], latestRequestId: 0 }),
	})),
);
