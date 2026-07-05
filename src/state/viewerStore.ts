import type { MediaRow as MediaFile } from "@backend/types";
import { create } from "zustand";

interface ViewerState {
	/** In-memory Model references (no param serialization — design D2). */
	items: MediaFile[];
	index: number;
	isOpen: boolean;
	open: (items: MediaFile[], index: number) => void;
	setIndex: (index: number) => void;
	close: () => void;
}

/**
 * Transient photo-viewer session: whichever dataset launched the viewer
 * (gallery, search, document filter, album) snapshots its items here at open;
 * the snapshot is never observation-updated and clears on exit.
 */
export const useViewerStore = create<ViewerState>()((set) => ({
	items: [],
	index: 0,
	isOpen: false,

	open: (items, index) =>
		set({
			items,
			index: Math.max(0, Math.min(index, items.length - 1)),
			isOpen: true,
		}),
	setIndex: (index) =>
		set((s) => ({
			index: Math.max(0, Math.min(index, Math.max(0, s.items.length - 1))),
		})),
	close: () => set({ items: [], index: 0, isOpen: false }),
}));
