import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppStorage } from "../storage/MMKVStorage";
import type { SearchResult } from "../services/search/MiniSearchService";

interface SearchFilters {
	documentType?: string;
	dateRange?: {
		start: Date;
		end: Date;
	};
	hasOCR?: boolean;
	minConfidence?: number;
}

interface SearchState {
	// Current search state
	searchQuery: string;
	searchResults: SearchResult[];
	isSearching: boolean;
	searchError: string | null;

	// Search history (persisted)
	searchHistory: string[];

	// Filters
	filters: SearchFilters;

	// Actions
	setSearchQuery: (query: string) => void;
	setSearchResults: (results: SearchResult[]) => void;
	setIsSearching: (isSearching: boolean) => void;
	setSearchError: (error: string | null) => void;
	addToHistory: (query: string) => void;
	removeFromHistory: (query: string) => void;
	clearHistory: () => void;
	setFilters: (filters: SearchFilters) => void;
	clearFilters: () => void;
	clearSearch: () => void;
}

export const useSearchStore = create<SearchState>()(
	persist(
		(set, get) => ({
			// Initial state
			searchQuery: "",
			searchResults: [],
			isSearching: false,
			searchError: null,
			searchHistory: [],
			filters: {},

			// Actions
			setSearchQuery: (query) => set({ searchQuery: query }),

			setSearchResults: (results) => set({ searchResults: results }),

			setIsSearching: (isSearching) => set({ isSearching }),

			setSearchError: (error) => set({ searchError: error }),

			addToHistory: (query) =>
				set((state) => {
					const trimmedQuery = query.trim();
					if (!trimmedQuery) return state;

					// Remove if already exists, then add to front
					const newHistory = [
						trimmedQuery,
						...state.searchHistory.filter((q) => q !== trimmedQuery),
					].slice(0, 20); // Keep max 20 items

					return { searchHistory: newHistory };
				}),

			removeFromHistory: (query) =>
				set((state) => ({
					searchHistory: state.searchHistory.filter((q) => q !== query),
				})),

			clearHistory: () => set({ searchHistory: [] }),

			setFilters: (filters) => set({ filters }),

			clearFilters: () => set({ filters: {} }),

			clearSearch: () =>
				set({
					searchQuery: "",
					searchResults: [],
					isSearching: false,
					searchError: null,
				}),
		}),
		{
			name: "search-storage",
			storage: {
				getItem: async (name) => {
					const data = await AppStorage.getObject(name);
					return data as any;
				},
				setItem: async (name, value) => {
					await AppStorage.setObject(name, value);
				},
				removeItem: async (name) => {
					await AppStorage.removeItem(name);
				},
			},
			partialize: (state) => ({
				// Only persist search history
				searchHistory: state.searchHistory,
			}) as SearchState,
		},
	),
);