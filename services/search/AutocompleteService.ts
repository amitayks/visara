import { AppStorage } from "../../storage/MMKVStorage";

export interface Suggestion {
	id: string;
	title: string;
	type: "history" | "keyword" | "document" | "smart";
	metadata?: {
		count?: number;
		documentType?: string;
		lastUsed?: string;
	};
}

interface SearchHistoryItem {
	query: string;
	timestamp: number;
	resultCount: number;
}

interface PopularKeyword {
	keyword: string;
	count: number;
	lastUsed: number;
}

export class AutocompleteService {
	private static instance: AutocompleteService;
	private searchHistory: SearchHistoryItem[] = [];
	private popularKeywords: Map<string, PopularKeyword> = new Map();
	private readonly HISTORY_KEY = "search_history";
	private readonly KEYWORDS_KEY = "popular_keywords";
	private readonly MAX_HISTORY = 50;
	private readonly MAX_KEYWORDS = 100;

	private constructor() {
		this.loadData();
	}

	static getInstance(): AutocompleteService {
		if (!AutocompleteService.instance) {
			AutocompleteService.instance = new AutocompleteService();
		}
		return AutocompleteService.instance;
	}

	// Load persisted data
	private async loadData(): Promise<void> {
		try {
			// Load search history
			const historyData = await AppStorage.getObject(this.HISTORY_KEY) as SearchHistoryItem[];
			if (historyData) {
				this.searchHistory = historyData;
			}

			// Load popular keywords
			const keywordsArray = await AppStorage.getObject(this.KEYWORDS_KEY) as PopularKeyword[];
			if (keywordsArray) {
				this.popularKeywords = new Map(
					keywordsArray.map((k) => [k.keyword, k]),
				);
			}
		} catch (error) {
			console.error("[AutocompleteService] Failed to load data:", error);
		}
	}

	// Save data to storage
	private async saveData(): Promise<void> {
		try {
			// Save search history
			await AppStorage.setObject(
				this.HISTORY_KEY,
				this.searchHistory.slice(0, this.MAX_HISTORY)
			);

			// Save popular keywords
			const keywordsArray = Array.from(this.popularKeywords.values())
				.sort((a, b) => b.count - a.count)
				.slice(0, this.MAX_KEYWORDS);

			await AppStorage.setObject(this.KEYWORDS_KEY, keywordsArray);
		} catch (error) {
			console.error("[AutocompleteService] Failed to save data:", error);
		}
	}

	// Add search to history
	async addToHistory(query: string, resultCount: number): Promise<void> {
		if (!query || query.trim().length === 0) return;

		const trimmedQuery = query.trim().toLowerCase();

		// Remove existing entry if present
		this.searchHistory = this.searchHistory.filter(
			(item) => item.query !== trimmedQuery,
		);

		// Add to beginning
		this.searchHistory.unshift({
			query: trimmedQuery,
			timestamp: Date.now(),
			resultCount,
		});

		// Limit history size
		this.searchHistory = this.searchHistory.slice(0, this.MAX_HISTORY);

		// Update keywords
		this.updateKeywords(trimmedQuery);

		// Save to storage
		await this.saveData();
	}

	// Update popular keywords
	private updateKeywords(query: string): void {
		const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

		for (const word of words) {
			const existing = this.popularKeywords.get(word);
			if (existing) {
				existing.count++;
				existing.lastUsed = Date.now();
			} else {
				this.popularKeywords.set(word, {
					keyword: word,
					count: 1,
					lastUsed: Date.now(),
				});
			}
		}
	}

	// Get suggestions based on partial input
	async getSuggestions(
		input: string,
		options: {
			includeHistory?: boolean;
			includeKeywords?: boolean;
			includeSmart?: boolean;
			limit?: number;
		} = {},
	): Promise<Suggestion[]> {
		const {
			includeHistory = true,
			includeKeywords = true,
			includeSmart = true,
			limit = 10,
		} = options;

		const suggestions: Suggestion[] = [];
		const lowerInput = input.toLowerCase().trim();

		// If empty input, show recent searches
		if (!lowerInput) {
			if (includeHistory) {
				const recentSearches = this.searchHistory.slice(0, 5).map((item) => ({
					id: `history-${item.query}`,
					title: item.query,
					type: "history" as const,
					metadata: {
						count: item.resultCount,
						lastUsed: new Date(item.timestamp).toISOString(),
					},
				}));
				suggestions.push(...recentSearches);
			}
			return suggestions.slice(0, limit);
		}

		// Add matching history items
		if (includeHistory) {
			const historyMatches = this.searchHistory
				.filter((item) => item.query.includes(lowerInput))
				.slice(0, 3)
				.map((item) => ({
					id: `history-${item.query}`,
					title: item.query,
					type: "history" as const,
					metadata: {
						count: item.resultCount,
						lastUsed: new Date(item.timestamp).toISOString(),
					},
				}));
			suggestions.push(...historyMatches);
		}

		// Add matching keywords
		if (includeKeywords) {
			const keywordMatches = Array.from(this.popularKeywords.values())
				.filter((kw) => kw.keyword.startsWith(lowerInput))
				.sort((a, b) => b.count - a.count)
				.slice(0, 3)
				.map((kw) => ({
					id: `keyword-${kw.keyword}`,
					title: kw.keyword,
					type: "keyword" as const,
					metadata: {
						count: kw.count,
					},
				}));
			suggestions.push(...keywordMatches);
		}

		// Add smart suggestions
		if (includeSmart) {
			const smartSuggestions = this.generateSmartSuggestions(lowerInput);
			suggestions.push(...smartSuggestions);
		}

		// Remove duplicates and limit
		const seen = new Set<string>();
		const uniqueSuggestions = suggestions.filter((s) => {
			if (seen.has(s.title)) return false;
			seen.add(s.title);
			return true;
		});

		return uniqueSuggestions.slice(0, limit);
	}

	// Generate smart contextual suggestions
	private generateSmartSuggestions(input: string): Suggestion[] {
		const suggestions: Suggestion[] = [];

		// Date-based suggestions
		if (input.includes("today") || input.includes("yesterday")) {
			suggestions.push({
				id: "smart-date-today",
				title: "Documents from today",
				type: "smart",
				metadata: { documentType: "date-filter" },
			});
		}

		if (input.includes("week")) {
			suggestions.push({
				id: "smart-date-week",
				title: "Documents from this week",
				type: "smart",
				metadata: { documentType: "date-filter" },
			});
		}

		// Document type suggestions
		const docTypes = ["invoice", "receipt", "contract", "id", "passport"];
		for (const docType of docTypes) {
			if (input.includes(docType.substring(0, 3))) {
				suggestions.push({
					id: `smart-type-${docType}`,
					title: `${docType}s`,
					type: "smart",
					metadata: { documentType: docType },
				});
			}
		}

		// Amount-based suggestions
		if (/\d/.test(input)) {
			suggestions.push({
				id: "smart-amount",
				title: `Documents with amount ${input}`,
				type: "smart",
				metadata: { documentType: "amount-filter" },
			});
		}

		return suggestions;
	}

	// Clear history
	async clearHistory(): Promise<void> {
		this.searchHistory = [];
		await AppStorage.removeItem(this.HISTORY_KEY);
	}

	// Clear keywords
	async clearKeywords(): Promise<void> {
		this.popularKeywords.clear();
		await AppStorage.removeItem(this.KEYWORDS_KEY);
	}

	// Get recent searches
	getRecentSearches(limit = 10): string[] {
		return this.searchHistory.slice(0, limit).map((item) => item.query);
	}

	// Get popular keywords
	getPopularKeywords(limit = 10): Array<{ keyword: string; count: number }> {
		return Array.from(this.popularKeywords.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, limit)
			.map((kw) => ({ keyword: kw.keyword, count: kw.count }));
	}

	// Remove specific item from history
	async removeFromHistory(query: string): Promise<void> {
		this.searchHistory = this.searchHistory.filter(
			(item) => item.query !== query.toLowerCase(),
		);
		await this.saveData();
	}

	// Analytics: Get search statistics
	getSearchStats(): {
		totalSearches: number;
		uniqueSearches: number;
		averageResultCount: number;
		mostPopularSearches: string[];
	} {
		const totalSearches = this.searchHistory.length;
		const uniqueSearches = new Set(this.searchHistory.map((s) => s.query)).size;
		const averageResultCount =
			totalSearches > 0
				? this.searchHistory.reduce((sum, s) => sum + s.resultCount, 0) /
					totalSearches
				: 0;

		// Count frequency of searches
		const searchCounts = new Map<string, number>();
		for (const search of this.searchHistory) {
			searchCounts.set(search.query, (searchCounts.get(search.query) || 0) + 1);
		}

		const mostPopularSearches = Array.from(searchCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([query]) => query);

		return {
			totalSearches,
			uniqueSearches,
			averageResultCount: Math.round(averageResultCount),
			mostPopularSearches,
		};
	}
}