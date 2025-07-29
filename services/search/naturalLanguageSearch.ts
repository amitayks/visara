import {
	format,
	isWithinInterval,
	parse,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks,
} from "date-fns";
import { documentStorage } from "../database/documentStorage";
import type Document from "../database/models/Document";

export interface SearchQuery {
	text: string;
	dateRange?: {
		start: Date;
		end: Date;
	};
	vendors?: string[];
	amountRange?: {
		min?: number;
		max?: number;
		currency?: string;
	};
	documentTypes?: string[];
}

export interface SearchResult {
	documents: Document[];
	query: SearchQuery;
	confidence: number;
}

export class NaturalLanguageSearchService {
	private readonly datePatterns = {
		today: () => ({ start: new Date(), end: new Date() }),
		yesterday: () => ({
			start: subDays(new Date(), 1),
			end: subDays(new Date(), 1),
		}),
		"this week": () => ({
			start: startOfWeek(new Date()),
			end: new Date(),
		}),
		"last week": () => ({
			start: startOfWeek(subWeeks(new Date(), 1)),
			end: subDays(startOfWeek(new Date()), 1),
		}),
		"this month": () => ({
			start: startOfMonth(new Date()),
			end: new Date(),
		}),
		"last month": () => ({
			start: startOfMonth(subMonths(new Date(), 1)),
			end: subDays(startOfMonth(new Date()), 1),
		}),
	};

	private readonly hebrewDatePatterns = {
		היום: "today",
		אתמול: "yesterday",
		השבוע: "this week",
		"שבוע שעבר": "last week",
		החודש: "this month",
		"חודש שעבר": "last month",
	};

	private readonly currencySymbols = {
		"₪": "ILS",
		שקל: "ILS",
		שקלים: "ILS",
		$: "USD",
		דולר: "USD",
		"€": "EUR",
		יורו: "EUR",
	};

	async search(query: string): Promise<SearchResult> {
		const parsedQuery = this.parseQuery(query);
		const documents = await this.executeSearch(parsedQuery);

		return {
			documents,
			query: parsedQuery,
			confidence: this.calculateConfidence(parsedQuery, documents),
		};
	}

	private parseQuery(query: string): SearchQuery {
		const parsedQuery: SearchQuery = { text: query };

		// Parse dates
		const dateRange = this.extractDateRange(query);
		if (dateRange) {
			parsedQuery.dateRange = dateRange;
		}

		// Parse amounts
		const amountRange = this.extractAmountRange(query);
		if (amountRange) {
			parsedQuery.amountRange = amountRange;
		}

		// Parse vendors using simple word extraction
		const vendors = this.extractVendors(query);
		if (vendors.length > 0) {
			parsedQuery.vendors = vendors;
		}

		// Parse document types
		const types = this.extractDocumentTypes(query);
		if (types.length > 0) {
			parsedQuery.documentTypes = types;
		}

		return parsedQuery;
	}

	private extractDateRange(query: string): { start: Date; end: Date } | null {
		const lowerQuery = query.toLowerCase();

		// Check Hebrew patterns first
		for (const [hebrew, english] of Object.entries(this.hebrewDatePatterns)) {
			if (query.includes(hebrew)) {
				const pattern =
					this.datePatterns[english as keyof typeof this.datePatterns];
				if (pattern) {
					return pattern();
				}
			}
		}

		// Check English patterns
		for (const [pattern, getRange] of Object.entries(this.datePatterns)) {
			if (lowerQuery.includes(pattern)) {
				return getRange();
			}
		}

		// Try to parse specific dates
		const dateMatch = query.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
		if (dateMatch) {
			try {
				const date = parse(dateMatch[0], "dd/MM/yyyy", new Date());
				return { start: date, end: date };
			} catch {
				// Ignore parse errors
			}
		}

		// Parse relative dates like "past 3 days"
		const relativeDaysMatch = query.match(
			/past (\d+) days?|(\d+) ימים אחרונים/i,
		);
		if (relativeDaysMatch) {
			const days = parseInt(relativeDaysMatch[1] || relativeDaysMatch[2]);
			return {
				start: subDays(new Date(), days),
				end: new Date(),
			};
		}

		return null;
	}

	private extractAmountRange(query: string): SearchQuery["amountRange"] | null {
		const amountRange: SearchQuery["amountRange"] = {};

		// Extract currency
		for (const [symbol, code] of Object.entries(this.currencySymbols)) {
			if (query.includes(symbol)) {
				amountRange.currency = code;
				break;
			}
		}

		// Extract amount patterns
		const amountPatterns = [
			/(\d+(?:[.,]\d+)?)\s*(?:₪|שקל|שקלים|\$|דולר|€|יורו)/g,
			/(?:מעל|above|over)\s*(\d+(?:[.,]\d+)?)/g,
			/(?:מתחת|below|under)\s*(\d+(?:[.,]\d+)?)/g,
			/(?:בין|between)\s*(\d+(?:[.,]\d+)?)\s*(?:ל|to)\s*(\d+(?:[.,]\d+)?)/g,
		];

		for (const pattern of amountPatterns) {
			const matches = Array.from(query.matchAll(pattern));
			if (matches.length > 0) {
				if (pattern.source.includes("above|over|מעל")) {
					amountRange.min = parseFloat(matches[0][1].replace(",", "."));
				} else if (pattern.source.includes("below|under|מתחת")) {
					amountRange.max = parseFloat(matches[0][1].replace(",", "."));
				} else if (pattern.source.includes("between|בין")) {
					amountRange.min = parseFloat(matches[0][1].replace(",", "."));
					amountRange.max = parseFloat(matches[0][2].replace(",", "."));
				} else {
					// Single amount - search for similar amounts (±10%)
					const amount = parseFloat(matches[0][1].replace(",", "."));
					amountRange.min = amount * 0.9;
					amountRange.max = amount * 1.1;
				}
			}
		}

		return Object.keys(amountRange).length > 0 ? amountRange : null;
	}

	private extractVendors(query: string): string[] {
		const vendors: string[] = [];

		// Extract quoted strings as potential vendor names
		const quotedMatch = query.match(/"([^"]+)"|'([^']+)'/g);
		if (quotedMatch) {
			vendors.push(...quotedMatch.map((m) => m.replace(/["']/g, "")));
		}

		// Extract words after "from" or "at"
		const fromMatch = query.match(
			/(?:from|at|של|מ)\s+([A-Za-z\u0590-\u05FF]+(?:\s+[A-Za-z\u0590-\u05FF]+)?)/gi,
		);
		if (fromMatch) {
			fromMatch.forEach((match) => {
				const vendor = match.replace(/^(from|at|של|מ)\s+/i, "").trim();
				if (vendor && !this.isCommonWord(vendor)) {
					vendors.push(vendor);
				}
			});
		}

		// Common vendor keywords in Hebrew
		const hebrewVendorKeywords = ["סופר", "חנות", "בית", "מסעדה", "קפה"];

		for (const keyword of hebrewVendorKeywords) {
			const regex = new RegExp(`${keyword}\\s+([א-ת]+(?:\\s+[א-ת]+)?)`, "g");
			const matches = query.matchAll(regex);
			for (const match of matches) {
				vendors.push(match[1]);
			}
		}

		// Look for capitalized words (potential vendor names)
		const capitalizedWords = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g);
		if (capitalizedWords) {
			capitalizedWords.forEach((word) => {
				if (!this.isCommonWord(word) && !this.isDateWord(word)) {
					vendors.push(word);
				}
			});
		}

		return [...new Set(vendors)]; // Remove duplicates
	}

	private isCommonWord(word: string): boolean {
		const commonWords = [
			"the",
			"from",
			"at",
			"in",
			"on",
			"and",
			"or",
			"for",
			"with",
		];
		return commonWords.includes(word.toLowerCase());
	}

	private isDateWord(word: string): boolean {
		const dateWords = [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
			"Sunday",
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		];
		return dateWords.includes(word);
	}

	private extractDocumentTypes(query: string): string[] {
		const types: string[] = [];
		const lowerQuery = query.toLowerCase();

		const typeMapping = {
			receipt: ["receipt", "קבלה", "חשבונית"],
			invoice: ["invoice", "חשבונית מס", "חשבון"],
			id: ["id", "תעודת זהות", "דרכון", "passport"],
			form: ["form", "טופס"],
			letter: ["letter", "מכתב"],
		};

		for (const [type, keywords] of Object.entries(typeMapping)) {
			if (keywords.some((keyword) => query.includes(keyword))) {
				types.push(type);
			}
		}

		return types;
	}

	private async executeSearch(query: SearchQuery): Promise<Document[]> {
		let documents = await documentStorage.getAllDocuments();

		// Filter by date range
		if (query.dateRange) {
			documents = documents.filter((doc) => {
				const docDate = doc.date
					? new Date(doc.date)
					: new Date(doc.processedAt);
				return isWithinInterval(docDate, {
					start: query.dateRange!.start,
					end: query.dateRange!.end,
				});
			});
		}

		// Filter by amount range
		if (query.amountRange) {
			documents = documents.filter((doc) => {
				if (!doc.totalAmount) return false;

				if (
					query.amountRange!.currency &&
					doc.currency !== query.amountRange!.currency
				) {
					return false;
				}

				if (
					query.amountRange!.min &&
					doc.totalAmount < query.amountRange!.min
				) {
					return false;
				}

				if (
					query.amountRange!.max &&
					doc.totalAmount > query.amountRange!.max
				) {
					return false;
				}

				return true;
			});
		}

		// Filter by vendors (fuzzy matching)
		if (query.vendors && query.vendors.length > 0) {
			documents = documents.filter((doc) => {
				if (!doc.vendor) return false;

				const vendorLower = doc.vendor.toLowerCase();
				return query.vendors!.some((queryVendor) => {
					const queryLower = queryVendor.toLowerCase();
					return (
						vendorLower.includes(queryLower) ||
						this.fuzzyMatch(vendorLower, queryLower)
					);
				});
			});
		}

		// Filter by document types
		if (query.documentTypes && query.documentTypes.length > 0) {
			documents = documents.filter((doc) =>
				query.documentTypes!.includes(doc.documentType),
			);
		}

		// If no specific filters, do a text search
		if (
			!query.dateRange &&
			!query.amountRange &&
			!query.vendors &&
			!query.documentTypes
		) {
			documents = await documentStorage.searchDocuments(query.text);
		}

		// Sort by relevance/date
		documents.sort((a, b) => {
			const dateA = a.date ? new Date(a.date) : new Date(a.processedAt);
			const dateB = b.date ? new Date(b.date) : new Date(b.processedAt);
			return dateB.getTime() - dateA.getTime();
		});

		return documents;
	}

	private fuzzyMatch(str1: string, str2: string): boolean {
		// Simple fuzzy matching - can be improved with Levenshtein distance
		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;

		if (longer.length === 0) return true;

		const editDistance = this.getEditDistance(longer, shorter);
		return (longer.length - editDistance) / longer.length > 0.7;
	}

	private getEditDistance(s1: string, s2: string): number {
		const costs: number[] = [];
		for (let i = 0; i <= s1.length; i++) {
			let lastValue = i;
			for (let j = 0; j <= s2.length; j++) {
				if (i === 0) {
					costs[j] = j;
				} else if (j > 0) {
					let newValue = costs[j - 1];
					if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
						newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
					}
					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}
			if (i > 0) costs[s2.length] = lastValue;
		}
		return costs[s2.length];
	}

	private calculateConfidence(query: SearchQuery, results: Document[]): number {
		let confidence = 0.5; // Base confidence

		// Increase confidence based on filter specificity
		if (query.dateRange) confidence += 0.1;
		if (query.amountRange) confidence += 0.15;
		if (query.vendors) confidence += 0.15;
		if (query.documentTypes) confidence += 0.1;

		// Adjust based on results
		if (results.length > 0 && results.length < 10) {
			confidence += 0.1; // Good result count
		} else if (results.length === 0) {
			confidence -= 0.2; // No results
		}

		return Math.min(Math.max(confidence, 0), 1);
	}

	// Helper method to generate natural language response
	generateResponse(result: SearchResult): string {
		const { documents, query } = result;

		if (documents.length === 0) {
			return "I couldn't find any documents matching your search. Try different keywords or date ranges.";
		}

		let response = `Found ${documents.length} document${documents.length > 1 ? "s" : ""}`;

		if (query.dateRange) {
			response += ` from ${format(query.dateRange.start, "MMM d")} to ${format(query.dateRange.end, "MMM d")}`;
		}

		if (query.vendors && query.vendors.length > 0) {
			response += ` from ${query.vendors.join(", ")}`;
		}

		if (query.amountRange) {
			if (query.amountRange.min && query.amountRange.max) {
				response += ` between ${query.amountRange.currency || ""} ${query.amountRange.min}-${query.amountRange.max}`;
			} else if (query.amountRange.min) {
				response += ` over ${query.amountRange.currency || ""} ${query.amountRange.min}`;
			} else if (query.amountRange.max) {
				response += ` under ${query.amountRange.currency || ""} ${query.amountRange.max}`;
			}
		}

		return response + ".";
	}
}

export const nlSearchService = new NaturalLanguageSearchService();
