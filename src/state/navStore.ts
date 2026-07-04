import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export const PAGE = { gallery: 0, albums: 1 } as const;
export type PageIndex = (typeof PAGE)[keyof typeof PAGE];

export interface NavState {
	currentPage: PageIndex;
	searchMode: boolean;
	documentMode: boolean;
}

/**
 * Pure transition table (page-navigation-core spec, preserved from the old
 * NavigationContext reducer): page changes exit search mode; document mode
 * persists across page swipes; toggling documents from Albums redirects to
 * Gallery and forces the filter on; search activates only on Gallery.
 */
export const transitions = {
	setPage(state: NavState, page: PageIndex): NavState {
		if (page === state.currentPage) return state;
		return { ...state, currentPage: page, searchMode: false };
	},
	activateSearch(state: NavState): NavState {
		return { ...state, currentPage: PAGE.gallery, searchMode: true };
	},
	deactivateSearch(state: NavState): NavState {
		return { ...state, searchMode: false };
	},
	toggleDocuments(state: NavState): NavState {
		if (state.currentPage === PAGE.albums) {
			return { ...state, currentPage: PAGE.gallery, documentMode: true };
		}
		return { ...state, documentMode: !state.documentMode };
	},
} as const;

interface NavStore extends NavState {
	setPage: (page: PageIndex) => void;
	goToGallery: () => void;
	goToAlbums: () => void;
	activateSearch: () => void;
	deactivateSearch: () => void;
	toggleSearch: () => void;
	toggleDocuments: () => void;
}

export const useNavStore = create<NavStore>()(
	subscribeWithSelector((set, get) => ({
		currentPage: PAGE.gallery,
		searchMode: false,
		documentMode: false,

		setPage: (page) => set((s) => transitions.setPage(s, page)),
		goToGallery: () => set((s) => transitions.setPage(s, PAGE.gallery)),
		goToAlbums: () => set((s) => transitions.setPage(s, PAGE.albums)),
		activateSearch: () => set((s) => transitions.activateSearch(s)),
		deactivateSearch: () => set((s) => transitions.deactivateSearch(s)),
		toggleSearch: () => {
			const s = get();
			set(
				s.searchMode ? transitions.deactivateSearch(s) : transitions.activateSearch(s),
			);
		},
		toggleDocuments: () => set((s) => transitions.toggleDocuments(s)),
	})),
);
