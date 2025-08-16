import { create } from "zustand";
import { database } from "../services/database";
import { SearchOrchestrator } from "../services/search/searchOrchestrator";
import type { Document } from "../app/components/DocumentGrid";
import type { QueryChip } from "../app/components/SearchContainer";

interface SearchStore {
	searchQuery: string;
	queryChips: QueryChip[];
	isSearching: boolean;
	searchOrchestrator: SearchOrchestrator;

	// Computed
	isSearchActive: boolean;

	// Actions
	setSearchQuery: (query: string) => void;
	addQueryChip: (text: string) => Promise<Document[]>;
	removeQueryChip: (chipId: string) => Promise<Document[]>;
	performSearch: () => Promise<Document[]>;
	clearSearch: () => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
	searchQuery: "",
	queryChips: [],
	isSearching: false,
	searchOrchestrator: new SearchOrchestrator(database),

	get isSearchActive() {
		return get().queryChips.length > 0;
	},

	setSearchQuery: (query: string) => {
		set({ searchQuery: query });
	},

	addQueryChip: async (text: string) => {
		const { queryChips, searchOrchestrator } = get();
		
		// Add chip immediately for better UX
		const newChip: QueryChip = {
			id: Date.now().toString(),
			text,
			type: "search",
		};
		set({ queryChips: [...queryChips, newChip], searchQuery: "" });

		// Small delay for animation
		await new Promise((resolve) => setTimeout(resolve, 200));

		set({ isSearching: true });
		try {
			// Build combined search query from all chips
			const allChips = [...queryChips, newChip];
			const combinedQuery = allChips.map((chip) => chip.text).join(" ");

			const result = await searchOrchestrator.search(combinedQuery, {
				useSemanticSearch: true,
				usePhoneticMatching: true,
				useFuzzyMatching: true,
				maxResults: 50,
			});

			const docs: Document[] = result.documents.map((scored) => ({
				id: scored.document.id,
				imageUri: scored.document.imageUri,
				documentType: scored.document.documentType,
				vendor: scored.document.vendor,
				date: scored.document.date ? new Date(scored.document.date) : undefined,
				totalAmount: scored.document.totalAmount,
				metadata: scored.document.metadata,
				createdAt: new Date(scored.document.createdAt),
			}));

			return docs;
		} catch (error) {
			console.error("Search error:", error);
			// Remove the chip if search failed
			set({ queryChips: queryChips });
			throw error;
		} finally {
			set({ isSearching: false });
		}
	},

	removeQueryChip: async (chipId: string) => {
		const { queryChips, searchOrchestrator } = get();
		const updatedChips = queryChips.filter((chip) => chip.id !== chipId);
		set({ queryChips: updatedChips });

		// If no chips left, return empty array to signal clear search
		if (updatedChips.length === 0) {
			set({ searchQuery: "" });
			return [];
		}

		// Re-search with remaining chips
		try {
			set({ isSearching: true });
			const combinedQuery = updatedChips.map((chip) => chip.text).join(" ");

			const result = await searchOrchestrator.search(combinedQuery, {
				useSemanticSearch: true,
				usePhoneticMatching: true,
				useFuzzyMatching: true,
				maxResults: 50,
			});

			const docs: Document[] = result.documents.map((scored) => ({
				id: scored.document.id,
				imageUri: scored.document.imageUri,
				documentType: scored.document.documentType,
				vendor: scored.document.vendor,
				date: scored.document.date ? new Date(scored.document.date) : undefined,
				totalAmount: scored.document.totalAmount,
				metadata: scored.document.metadata,
				createdAt: new Date(scored.document.createdAt),
			}));

			return docs;
		} catch (error) {
			console.error("Re-search error:", error);
			throw error;
		} finally {
			set({ isSearching: false });
		}
	},

	performSearch: async () => {
		const { searchQuery } = get();
		if (!searchQuery.trim()) return [];

		return get().addQueryChip(searchQuery);
	},

	clearSearch: () => {
		set({ 
			searchQuery: "", 
			queryChips: [], 
			isSearching: false 
		});
	},
}));