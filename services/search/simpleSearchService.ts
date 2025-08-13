import { documentStorage } from "../database/documentStorage";
import type Document from "../database/models/Document";
import { DateParser } from "./dateParser";
import { PhoneticMatcher } from "./phoneticMatcher";

interface SearchResult {
	documents: Document[];
	query: any;
	confidence: number;
}

export class SimpleSearchService {
	async search(query: string): Promise<SearchResult> {
		console.log(`[SearchService] Searching for: "${query}"`);

		const allDocuments = await documentStorage.getAllDocuments();
		console.log(
			`[SearchService] Total documents in database: ${allDocuments.length}`,
		);

		// Parse the query
		const parsedQuery = this.parseQuery(query);
		console.log("[SearchService] Parsed query:", parsedQuery);

		// Start with all documents
		let results = [...allDocuments];

		// Apply date filter
		if (parsedQuery.dateRange) {
			console.log(
				"[SearchService] Applying date filter:",
				parsedQuery.dateRange,
			);
			results = results.filter((doc) => {
				// Check all possible date fields
				const dates = [
					doc.date ? new Date(doc.date) : null,
					doc.processedAt ? new Date(doc.processedAt) : null,
					doc.createdAt ? new Date(doc.createdAt) : null,
					doc.imageTakenDate ? new Date(doc.imageTakenDate) : null,
				].filter((d) => d !== null) as Date[];

				if (dates.length === 0) {
					console.log(`[SearchService] No dates found for document ${doc.id}`);
					return false;
				}

				// Check if any date falls within range
				const inRange = dates.some(
					(date) =>
						date >= parsedQuery.dateRange.start &&
						date <= parsedQuery.dateRange.end,
				);

				if (inRange) {
					console.log(`[SearchService] Document ${doc.id} matches date range`);
				}

				return inRange;
			});
		}

		// Apply amount filter
		if (parsedQuery.amounts.length > 0) {
			results = results.filter((doc) => {
				if (!doc.totalAmount) return false;

				return parsedQuery.amounts.some((amount: any) => {
					const tolerance = amount.value * 0.2; // 20% tolerance
					return Math.abs((doc.totalAmount || 0) - amount.value) <= tolerance;
				});
			});
		}

		// Apply document type filter
		if (parsedQuery.documentTypes.length > 0) {
			results = results.filter((doc) =>
				parsedQuery.documentTypes.includes(doc.documentType),
			);
		}

		// Text search if no other filters or in addition to filters
		if (parsedQuery.searchTerms.length > 0) {
			console.log(
				"[SearchService] Applying text search for terms:",
				parsedQuery.searchTerms,
			);

			results = results.filter((doc) => {
				const searchableText = this.getSearchableText(doc).toLowerCase();

				// Check if any search term matches
				return parsedQuery.searchTerms.some((term: string) => {
					const termLower = term.toLowerCase();

					// Exact match
					if (searchableText.includes(termLower)) {
						console.log(
							`[SearchService] Found exact match for "${term}" in document ${doc.id}`,
						);
						return true;
					}

					// Phonetic match for vendor
					if (doc.vendor) {
						const vendorWords = doc.vendor.split(/\s+/);
						const termWords = term.split(/\s+/);

						const phoneticMatch = vendorWords.some((vw) =>
							termWords.some((tw) => PhoneticMatcher.similarity(vw, tw) > 0.75),
						);

						if (phoneticMatch) {
							console.log(
								`[SearchService] Found phonetic match for "${term}" in vendor "${doc.vendor}"`,
							);
							return true;
						}
					}

					return false;
				});
			});
		}

		// Sort by relevance (most recent first for now)
		results.sort((a, b) => {
			const dateA = this.getDocumentDate(a);
			const dateB = this.getDocumentDate(b);
			return dateB.getTime() - dateA.getTime();
		});

		console.log(`[SearchService] Found ${results.length} matching documents`);

		return {
			documents: results,
			query: parsedQuery,
			confidence: results.length > 0 ? 0.8 : 0.2,
		};
	}

	private parseQuery(query: string): any {
		const parsed: any = {
			text: query,
			searchTerms: [],
			dateRange: null,
			amounts: [],
			documentTypes: [],
			vendors: [],
		};

		// Parse date range
		parsed.dateRange = DateParser.parse(query);

		// Extract amounts
		const amountMatches = query.match(/[₪$€£]?\s*(\d+(?:[.,]\d+)?)/g);
		if (amountMatches) {
			parsed.amounts = amountMatches.map((match) => {
				const value = parseFloat(match.replace(/[₪$€£,]/g, ""));
				return { value, currency: "USD" };
			});
		}

		// Extract document types
		const docTypes = [
			"receipt",
			"invoice",
			"id",
			"form",
			"letter",
			"screenshot",
		];
		const lowerQuery = query.toLowerCase();
		parsed.documentTypes = docTypes.filter((type) => lowerQuery.includes(type));

		// Extract search terms (remove common words)
		const commonWords = new Set([
			"show",
			"find",
			"search",
			"get",
			"from",
			"the",
			"a",
			"an",
			"for",
			"me",
			"my",
			"all",
			"with",
			"in",
			"on",
			"at",
			"today",
			"yesterday",
			"week",
			"month",
			"last",
			"this",
		]);

		const words = query.toLowerCase().split(/\s+/);
		parsed.searchTerms = words.filter(
			(word) =>
				word.length > 2 && !commonWords.has(word) && !docTypes.includes(word),
		);

		// Add the full query as a search term if it's short
		if (query.length < 20 && parsed.searchTerms.length === 0) {
			parsed.searchTerms = [query];
		}

		return parsed;
	}

	private getSearchableText(doc: Document): string {
		return [
			doc.ocrText || "",
			doc.vendor || "",
			doc.documentType || "",
			(doc.keywords || []).join(" "),
			doc.totalAmount ? doc.totalAmount.toString() : "",
		].join(" ");
	}

	private getDocumentDate(doc: Document): Date {
		// Priority: document date > image taken date > processed date > created date
		if (doc.date) return new Date(doc.date);
		if (doc.imageTakenDate) return new Date(doc.imageTakenDate);
		if (doc.processedAt) return new Date(doc.processedAt);
		return new Date(doc.createdAt);
	}

	generateResponse(result: SearchResult): string {
		const { documents, query } = result;

		if (documents.length === 0) {
			let response = "I couldn't find any documents";

			if (query.dateRange) {
				response += ` from ${query.dateRange.start.toLocaleDateString()} to ${query.dateRange.end.toLocaleDateString()}`;
			}

			response +=
				". Try different search terms or check if the documents have been scanned.";
			return response;
		}

		let response = `Found ${documents.length} document${documents.length > 1 ? "s" : ""}`;

		// Add context about the search
		if (query.dateRange) {
			const start = query.dateRange.start;
			const end = query.dateRange.end;

			// Check if it's a single day
			if (start.toDateString() === end.toDateString()) {
				if (start.toDateString() === new Date().toDateString()) {
					response += " from today";
				} else {
					response += ` from ${start.toLocaleDateString()}`;
				}
			} else {
				response += ` from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
			}
		}

		if (query.documentTypes.length > 0) {
			response += ` (${query.documentTypes.join(", ")})`;
		}

		response += ".";

		// Add document type breakdown
		const typeCount: Record<string, number> = {};
		documents.forEach((doc) => {
			typeCount[doc.documentType] = (typeCount[doc.documentType] || 0) + 1;
		});

		const types = Object.entries(typeCount)
			.map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
			.join(", ");

		if (types && documents.length > 1) {
			response += ` Types: ${types}.`;
		}

		return response;
	}
}

export const searchService = new SimpleSearchService();
