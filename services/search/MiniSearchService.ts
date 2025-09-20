import MiniSearch, { SearchResult as MiniSearchResult } from "minisearch";
import Document from "../database/models/Document";

// Enhanced search document interface
export interface SearchDocument {
	id: string;
	title: string;
	content: string;
	keywords: string;
	ocrText: string;
	documentType: string;
	createdAt: string;
	// Additional metadata stored for display
	thumbnailUri?: string;
	confidence?: number;
}

// Search result with highlighting
export interface SearchResult extends MiniSearchResult {
	id: string;
	title: string;
	documentType: string;
	thumbnailUri?: string;
	highlight?: {
		title?: string;
		content?: string;
	};
	createdAt: string;
}

// Advanced search options
export interface SearchOptions {
	fuzzy?: number;
	prefix?: boolean;
	fields?: string[];
	filter?: (result: SearchResult) => boolean;
	limit?: number;
}

export class MiniSearchService {
	private static instance: MiniSearchService;
	private miniSearch: MiniSearch<SearchDocument>;
	private isInitialized = false;

	private constructor() {
		// Configure MiniSearch with optimized settings
		this.miniSearch = new MiniSearch<SearchDocument>({
			fields: ["title", "content", "keywords", "ocrText", "documentType"],
			storeFields: ["title", "documentType", "createdAt", "thumbnailUri"],
			searchOptions: {
				boost: {
					title: 2, // Title matches are most important
					keywords: 1.5, // Keywords are quite important
					content: 1, // Base weight for content
					ocrText: 0.8, // OCR text slightly less reliable
					documentType: 0.5, // Document type is least important
				},
				fuzzy: 0.2, // Allow typos (20% edit distance)
				prefix: true, // Enable search-as-you-type
			},
		});
	}

	static getInstance(): MiniSearchService {
		if (!MiniSearchService.instance) {
			MiniSearchService.instance = new MiniSearchService();
		}
		return MiniSearchService.instance;
	}

	// Initialize with existing documents
	async initialize(documents?: Document[]): Promise<void> {
		if (this.isInitialized) {
			console.log("[MiniSearchService] Already initialized");
			return;
		}

		try {
			if (documents && documents.length > 0) {
				const searchDocs = documents.map(this.documentToSearchDoc);
				this.miniSearch.addAll(searchDocs);
				console.log(
					`[MiniSearchService] Initialized with ${documents.length} documents`,
				);
			}

			this.isInitialized = true;
		} catch (error) {
			console.error("[MiniSearchService] Initialization failed:", error);
			throw error;
		}
	}

	// Convert Document to SearchDocument
	private documentToSearchDoc(doc: any): SearchDocument {
		// Safely extract text with length limits
		const extractText = (text?: string | null, maxLength = 10000): string => {
			if (!text) return "";
			return text.length > maxLength ? text.substring(0, maxLength) : text;
		};

		// Build keywords from various fields
		const keywords = [
			...(doc.keywords || []),
			doc.documentType || "",
			// Extract potential keywords from title
			...(doc.title ? doc.title.toLowerCase().split(/\s+/) : []),
		]
			.filter(Boolean)
			.join(" ");

		return {
			id: doc.id,
			title: doc.title || "Untitled",
			content: extractText(doc.content, 5000), // Limit content for performance
			keywords,
			ocrText: extractText(doc.ocrText, 5000), // Limit OCR text
			documentType: doc.documentType || "unknown",
			createdAt: doc.createdAt.toISOString(),
			thumbnailUri: doc.thumbnailUri || undefined,
			confidence: doc.confidence || undefined,
		};
	}

	// Main search function with advanced options
	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchResult[]> {
		if (!this.isInitialized) {
			console.warn("[MiniSearchService] Not initialized, returning empty results");
			return [];
		}

		if (!query || query.trim().length === 0) {
			return [];
		}

		try {
			// Prepare search options
			const searchOptions: any = {
				fuzzy: options.fuzzy ?? 0.2,
				prefix: options.prefix ?? true,
				fields: options.fields,
			};

			// Perform search
			const results = this.miniSearch.search(query, searchOptions);

			// Process and enhance results
			let enhancedResults: SearchResult[] = results
				.map((result) => {
					const storedFields = result as any;
					return {
						...result,
						id: result.id,
						title: storedFields.title || "Untitled",
						documentType: storedFields.documentType || "unknown",
						thumbnailUri: storedFields.thumbnailUri,
						createdAt: storedFields.createdAt,
						highlight: this.generateHighlight(query, storedFields),
					};
				});

			// Apply custom filter if provided
			if (options.filter) {
				enhancedResults = enhancedResults.filter(options.filter);
			}

			// Apply limit
			enhancedResults = enhancedResults.slice(0, options.limit || 50);

			return enhancedResults;
		} catch (error) {
			console.error("[MiniSearchService] Search error:", error);
			return [];
		}
	}

	// Generate highlighted snippets
	private generateHighlight(
		query: string,
		doc: any,
	): { title?: string; content?: string } {
		const highlight: { title?: string; content?: string } = {};

		// Simple highlighting (can be enhanced with proper highlighting library)
		const terms = query.toLowerCase().split(/\s+/);

		// Highlight title
		if (doc.title) {
			let highlightedTitle = doc.title;
			for (const term of terms) {
				const regex = new RegExp(`(${term})`, "gi");
				highlightedTitle = highlightedTitle.replace(regex, "**$1**");
			}
			if (highlightedTitle !== doc.title) {
				highlight.title = highlightedTitle;
			}
		}

		// Highlight content snippet (first 100 chars around match)
		if (doc.content) {
			const lowerContent = doc.content.toLowerCase();
			for (const term of terms) {
				const index = lowerContent.indexOf(term);
				if (index !== -1) {
					const start = Math.max(0, index - 50);
					const end = Math.min(doc.content.length, index + term.length + 50);
					let snippet = doc.content.substring(start, end);

					// Add ellipsis if needed
					if (start > 0) snippet = "..." + snippet;
					if (end < doc.content.length) snippet = snippet + "...";

					// Highlight the term
					const regex = new RegExp(`(${term})`, "gi");
					snippet = snippet.replace(regex, "**$1**");

					highlight.content = snippet;
					break; // Use first match
				}
			}
		}

		return highlight;
	}

	// Add a single document
	async addDocument(doc: Document): Promise<void> {
		try {
			const searchDoc = this.documentToSearchDoc(doc);
			
			// Check if document already exists and replace if needed
			if (this.miniSearch.has(doc.id)) {
				this.miniSearch.replace(searchDoc);
				console.log(`[MiniSearchService] Updated document: ${doc.id}`);
			} else {
				this.miniSearch.add(searchDoc);
				console.log(`[MiniSearchService] Added document: ${doc.id}`);
			}
		} catch (error) {
			console.error(`[MiniSearchService] Failed to add document ${doc.id}:`, error);
		}
	}

	// Update a document
	async updateDocument(doc: Document): Promise<void> {
		try {
			// Remove old version
			await this.removeDocument(doc.id);
			// Add updated version
			await this.addDocument(doc);
			console.log(`[MiniSearchService] Updated document: ${doc.id}`);
		} catch (error) {
			console.error(`[MiniSearchService] Failed to update document ${doc.id}:`, error);
		}
	}

	// Remove a document
	async removeDocument(id: string): Promise<void> {
		try {
			this.miniSearch.remove({ id } as any);
			console.log(`[MiniSearchService] Removed document: ${id}`);
		} catch (error) {
			// Document might not exist in search index, which is okay - 
			// it may have been deleted before being indexed or the index wasn't initialized yet
			console.log(`[MiniSearchService] Document ${id} not in search index (already removed or never indexed)`);
		}
	}

	// Bulk operations
	async addDocuments(documents: Document[]): Promise<void> {
		try {
			const searchDocs = documents.map(this.documentToSearchDoc);
			this.miniSearch.addAll(searchDocs);
			console.log(`[MiniSearchService] Added ${documents.length} documents`);
		} catch (error) {
			console.error("[MiniSearchService] Failed to add documents:", error);
		}
	}

	// Re-index all documents (useful after major changes)
	async reindexAll(documents: Document[]): Promise<void> {
		try {
			// Prevent double re-indexing with the same document count
			const currentCount = this.miniSearch.documentCount;
			if (currentCount === documents.length) {
				console.log(`[MiniSearchService] Skipping re-index, already has ${documents.length} documents`);
				return;
			}

			// Clear existing index
			this.miniSearch.removeAll();

			// Add all documents
			const searchDocs = documents.map(this.documentToSearchDoc);
			this.miniSearch.addAll(searchDocs);

			console.log(`[MiniSearchService] Re-indexed ${documents.length} documents`);
		} catch (error) {
			console.error("[MiniSearchService] Re-indexing failed:", error);
			throw error;
		}
	}

	// Get search suggestions (autocomplete)
	async getSuggestions(
		prefix: string,
		limit = 10,
	): Promise<Array<{ suggestion: string; score: number }>> {
		if (!prefix || prefix.length < 2) {
			return [];
		}

		try {
			const results = this.miniSearch.autoSuggest(prefix, {
				fuzzy: 0.2,
				prefix: true,
			});

			return results.slice(0, limit).map((result) => ({
				suggestion: result.suggestion,
				score: result.score,
			}));
		} catch (error) {
			console.error("[MiniSearchService] Suggestion error:", error);
			return [];
		}
	}

	// Export index for persistence (optional)
	exportIndex(): string {
		return JSON.stringify(this.miniSearch.toJSON());
	}

	// Import index from persistence (optional)
	importIndex(indexData: string): void {
		try {
			const data = JSON.parse(indexData);
			this.miniSearch = MiniSearch.loadJS(data, {
				fields: ["title", "content", "keywords", "ocrText", "documentType"],
				storeFields: ["title", "documentType", "createdAt", "thumbnailUri"],
			});
			this.isInitialized = true;
			console.log("[MiniSearchService] Index imported successfully");
		} catch (error) {
			console.error("[MiniSearchService] Failed to import index:", error);
			throw error;
		}
	}

	// Get index statistics
	getStats(): {
		documentCount: number;
		termCount: number;
		isInitialized: boolean;
	} {
		return {
			documentCount: this.miniSearch.documentCount,
			termCount: this.miniSearch.termCount,
			isInitialized: this.isInitialized,
		};
	}

	// Clear all documents
	clear(): void {
		this.miniSearch.removeAll();
		console.log("[MiniSearchService] Index cleared");
	}
}