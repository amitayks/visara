import type Document from "../../database/models/Document";
import {
	ScoredDocument,
	ScoringFactors,
	RankingWeights,
	DEFAULT_RANKING_WEIGHTS,
	ParsedQuery,
	DocumentType,
} from "./searchTypes";

export class RankingEngine {
	private weights: RankingWeights;

	constructor(weights?: Partial<RankingWeights>) {
		this.weights = { ...DEFAULT_RANKING_WEIGHTS, ...weights };
	}

	rankDocuments(
		documents: Document[],
		query: ParsedQuery,
		searchVectors?: Map<string, number[]>,
		queryVector?: number[],
	): ScoredDocument[] {
		const scoredDocs: ScoredDocument[] = [];

		for (const doc of documents) {
			const scoringFactors = this.calculateScoringFactors(
				doc,
				query,
				searchVectors?.get(doc.id),
				queryVector,
			);

			const score = this.calculateFinalScore(scoringFactors);
			const matchedKeywords = this.extractMatchedKeywords(doc, query);
			const confidence = this.calculateConfidence(scoringFactors);

			scoredDocs.push({
				document: doc,
				score,
				scoringFactors,
				matchedKeywords,
				confidence,
			});
		}

		// Sort by score (descending) and apply any specific sorting
		return this.applySort(scoredDocs, query);
	}

	private calculateScoringFactors(
		doc: Document,
		query: ParsedQuery,
		docVector?: number[],
		queryVector?: number[],
	): ScoringFactors {
		const factors: ScoringFactors = {};

		// Semantic similarity (if vectors available)
		if (docVector && queryVector) {
			factors.semanticSimilarity = this.cosineSimilarity(
				docVector,
				queryVector,
			);
		}

		// Keyword matching
		factors.keywordMatch = this.calculateKeywordScore(doc, query.keywords);

		// Date relevance
		factors.dateRelevance = this.calculateDateRelevance(doc, query);

		// Document type matching
		if (query.documentTypes && query.documentTypes.length > 0) {
			factors.documentTypeMatch = this.calculateDocumentTypeScore(
				doc.documentType as DocumentType,
				query.documentTypes,
			);
		}

		// Phonetic matching for vendors
		if (query.vendor && query.vendor.length > 0) {
			factors.phoneticMatch = this.calculatePhoneticScore(
				doc.vendor || "",
				query.vendor,
			);
			factors.vendorMatch = this.calculateVendorScore(
				doc.vendor || "",
				query.vendor,
			);
		}

		// Amount matching
		if (query.amount && doc.totalAmount !== undefined) {
			factors.amountMatch = this.calculateAmountScore(
				doc.totalAmount,
				query.amount,
			);
		}

		return factors;
	}

	private calculateFinalScore(factors: ScoringFactors): number {
		let score = 0;
		let totalWeight = 0;

		// Calculate weighted sum
		if (factors.semanticSimilarity !== undefined) {
			score += factors.semanticSimilarity * this.weights.semantic;
			totalWeight += this.weights.semantic;
		}

		if (factors.keywordMatch !== undefined) {
			score += factors.keywordMatch * this.weights.keyword;
			totalWeight += this.weights.keyword;
		}

		if (factors.dateRelevance !== undefined) {
			score += factors.dateRelevance * this.weights.date;
			totalWeight += this.weights.date;
		}

		if (factors.documentTypeMatch !== undefined) {
			score += factors.documentTypeMatch * this.weights.documentType;
			totalWeight += this.weights.documentType;
		}

		if (factors.phoneticMatch !== undefined) {
			score += factors.phoneticMatch * this.weights.phonetic;
			totalWeight += this.weights.phonetic;
		}

		if (factors.amountMatch !== undefined) {
			score += factors.amountMatch * this.weights.amount;
			totalWeight += this.weights.amount;
		}

		if (factors.vendorMatch !== undefined) {
			score += factors.vendorMatch * this.weights.vendor;
			totalWeight += this.weights.vendor;
		}

		// Normalize score
		return totalWeight > 0 ? score / totalWeight : 0;
	}

	private cosineSimilarity(vec1: number[], vec2: number[]): number {
		if (vec1.length !== vec2.length) return 0;

		let dotProduct = 0;
		let norm1 = 0;
		let norm2 = 0;

		for (let i = 0; i < vec1.length; i++) {
			dotProduct += vec1[i] * vec2[i];
			norm1 += vec1[i] * vec1[i];
			norm2 += vec2[i] * vec2[i];
		}

		const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	private calculateKeywordScore(doc: Document, keywords: string[]): number {
		if (keywords.length === 0) return 0;

		const docText = this.getDocumentText(doc).toLowerCase();
		let matchCount = 0;
		let totalScore = 0;

		for (const keyword of keywords) {
			const normalizedKeyword = keyword.toLowerCase();

			// Exact match
			if (docText.includes(normalizedKeyword)) {
				matchCount++;
				totalScore += 1.0;
			}
			// Partial match (keyword is substring)
			else if (this.containsPartialMatch(docText, normalizedKeyword)) {
				matchCount++;
				totalScore += 0.5;
			}
		}

		// Return normalized score
		return keywords.length > 0 ? totalScore / keywords.length : 0;
	}

	private calculateDateRelevance(doc: Document, query: ParsedQuery): number {
		// If no temporal filter, prefer recent documents
		if (!query.temporal) {
			if (!doc.date) return 0.3; // Low score for documents without dates

			const daysSinceDoc = this.daysBetween(new Date(doc.date), new Date());
			// Exponential decay: more recent = higher score
			return Math.exp(-daysSinceDoc / 365); // Decay over a year
		}

		// Check if document falls within temporal range
		if (!doc.date) return 0;

		const docDate = new Date(doc.date);

		if (query.temporal.startDate && query.temporal.endDate) {
			if (
				docDate >= query.temporal.startDate &&
				docDate <= query.temporal.endDate
			) {
				// Within range - calculate position in range for scoring
				const rangeSize = this.daysBetween(
					query.temporal.startDate,
					query.temporal.endDate,
				);
				const position = this.daysBetween(query.temporal.startDate, docDate);

				// Prefer documents closer to the end of the range (more recent)
				return rangeSize > 0 ? 0.5 + (0.5 * position) / rangeSize : 1.0;
			}
			return 0; // Outside range
		}

		return 0.5; // Default moderate score
	}

	private calculateDocumentTypeScore(
		docType: DocumentType | string,
		queryTypes: DocumentType[],
	): number {
		// Exact match
		if (queryTypes.includes(docType as DocumentType)) {
			return 1.0;
		}

		// Check for related types
		const relatedTypes = this.getRelatedDocumentTypes(docType as DocumentType);
		for (const queryType of queryTypes) {
			if (relatedTypes.includes(queryType)) {
				return 0.5; // Partial score for related types
			}
		}

		return 0;
	}

	private calculatePhoneticScore(
		vendor: string,
		queryVendors: string[],
	): number {
		if (!vendor) return 0;

		const vendorSoundex = this.soundex(vendor.toLowerCase());
		let maxScore = 0;

		for (const queryVendor of queryVendors) {
			const querySoundex = this.soundex(queryVendor.toLowerCase());

			if (vendorSoundex === querySoundex) {
				maxScore = Math.max(maxScore, 0.8); // High score for phonetic match
			} else if (this.soundexSimilarity(vendorSoundex, querySoundex) > 0.5) {
				maxScore = Math.max(maxScore, 0.4); // Moderate score for similar soundex
			}
		}

		return maxScore;
	}

	private calculateVendorScore(vendor: string, queryVendors: string[]): number {
		if (!vendor) return 0;

		const normalizedVendor = vendor.toLowerCase().trim();
		let maxScore = 0;

		for (const queryVendor of queryVendors) {
			const normalizedQuery = queryVendor.toLowerCase().trim();

			// Exact match
			if (normalizedVendor === normalizedQuery) {
				return 1.0;
			}

			// Contains match
			if (
				normalizedVendor.includes(normalizedQuery) ||
				normalizedQuery.includes(normalizedVendor)
			) {
				maxScore = Math.max(maxScore, 0.7);
			}

			// Levenshtein distance for fuzzy matching
			const distance = this.levenshteinDistance(
				normalizedVendor,
				normalizedQuery,
			);
			const maxLength = Math.max(
				normalizedVendor.length,
				normalizedQuery.length,
			);
			const similarity = 1 - distance / maxLength;

			if (similarity > 0.7) {
				maxScore = Math.max(maxScore, similarity * 0.8);
			}
		}

		return maxScore;
	}

	private calculateAmountScore(docAmount: number, amountFilter: any): number {
		const { value, operator, tolerance = 0 } = amountFilter;

		switch (operator) {
			case "equals":
				const diff = Math.abs(docAmount - value);
				if (diff <= tolerance) return 1.0;
				// Gradual decay for close matches
				return Math.max(0, 1 - diff / value);

			case "greater":
				if (docAmount > value) {
					// Higher amounts get slightly better scores
					return Math.min(1.0, 0.8 + 0.2 * Math.log10(docAmount / value));
				}
				return 0;

			case "less":
				if (docAmount < value) {
					// Lower amounts get slightly better scores
					return Math.min(1.0, 0.8 + 0.2 * Math.log10(value / docAmount));
				}
				return 0;

			case "between":
				if (
					docAmount >= value &&
					docAmount <= (amountFilter.maxValue || value)
				) {
					// Score based on position in range
					const range = (amountFilter.maxValue || value) - value;
					const position = docAmount - value;
					return range > 0 ? 0.5 + (0.5 * position) / range : 1.0;
				}
				return 0;

			default:
				return 0;
		}
	}

	private extractMatchedKeywords(doc: Document, query: ParsedQuery): string[] {
		const matched: string[] = [];
		const docText = this.getDocumentText(doc).toLowerCase();

		for (const keyword of query.keywords) {
			if (docText.includes(keyword.toLowerCase())) {
				matched.push(keyword);
			}
		}

		// Add matched entities
		if (query.vendor && doc.vendor) {
			for (const vendor of query.vendor) {
				if (doc.vendor.toLowerCase().includes(vendor.toLowerCase())) {
					matched.push(vendor);
				}
			}
		}

		if (query.documentTypes && doc.documentType) {
			if (query.documentTypes.includes(doc.documentType as DocumentType)) {
				matched.push(doc.documentType);
			}
		}

		return [...new Set(matched)]; // Remove duplicates
	}

	private calculateConfidence(factors: ScoringFactors): number {
		const scores = Object.values(factors).filter((v) => v !== undefined);
		if (scores.length === 0) return 0;

		// Average of all factor scores
		const avgScore =
			scores.reduce((sum, score) => sum + score, 0) / scores.length;

		// Boost confidence if multiple factors are high
		const highScoreCount = scores.filter((s) => s > 0.7).length;
		const boost = highScoreCount > 2 ? 0.1 : 0;

		return Math.min(1.0, avgScore + boost);
	}

	private applySort(
		documents: ScoredDocument[],
		query: ParsedQuery,
	): ScoredDocument[] {
		const sortBy = query.sortBy || "relevance";
		const sortOrder = query.sortOrder || "desc";

		documents.sort((a, b) => {
			let comparison = 0;

			switch (sortBy) {
				case "date":
					const dateA = a.document.date || 0;
					const dateB = b.document.date || 0;
					comparison = dateA - dateB;
					break;

				case "amount":
					const amountA = a.document.totalAmount || 0;
					const amountB = b.document.totalAmount || 0;
					comparison = amountA - amountB;
					break;

				case "relevance":
				default:
					comparison = a.score - b.score;
					break;
			}

			return sortOrder === "desc" ? -comparison : comparison;
		});

		// Apply limit if specified
		if (query.limit && query.limit > 0) {
			return documents.slice(0, query.limit);
		}

		return documents;
	}

	private getDocumentText(doc: Document): string {
		const parts = [
			doc.ocrText || "",
			doc.vendor || "",
			doc.documentType || "",
			...(doc.keywords || []),
		];

		return parts.join(" ");
	}

	private containsPartialMatch(text: string, keyword: string): boolean {
		// Split text into words and check for partial matches
		const words = text.split(/\s+/);
		return words.some(
			(word) => word.includes(keyword) || keyword.includes(word),
		);
	}

	private daysBetween(date1: Date, date2: Date): number {
		const diffTime = Math.abs(date2.getTime() - date1.getTime());
		return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	}

	private getRelatedDocumentTypes(type: DocumentType): DocumentType[] {
		const relations: Record<DocumentType, DocumentType[]> = {
			receipt: ["invoice"],
			invoice: ["receipt"],
			tax: ["form", "invoice"],
			form: ["tax"],
			medical: ["insurance", "receipt"],
			insurance: ["medical", "form"],
			id: ["form"],
			letter: ["contract"],
			contract: ["letter", "form"],
			screenshot: [],
			other: [],
		};

		return relations[type] || [];
	}

	private soundex(str: string): string {
		const clean = str.toUpperCase().replace(/[^A-Z]/g, "");
		if (!clean) return "0000";

		const first = clean[0];
		const codes: Record<string, string> = {
			BFPV: "1",
			CGJKQSXZ: "2",
			DT: "3",
			L: "4",
			MN: "5",
			R: "6",
		};

		let soundex = first;
		let prevCode = "";

		for (let i = 1; i < clean.length && soundex.length < 4; i++) {
			const char = clean[i];
			let code = "0";

			for (const [letters, codeValue] of Object.entries(codes)) {
				if (letters.includes(char)) {
					code = codeValue;
					break;
				}
			}

			if (code !== "0" && code !== prevCode) {
				soundex += code;
				prevCode = code;
			}
		}

		return soundex.padEnd(4, "0");
	}

	private soundexSimilarity(s1: string, s2: string): number {
		let matches = 0;
		for (let i = 0; i < 4; i++) {
			if (s1[i] === s2[i]) matches++;
		}
		return matches / 4;
	}

	private levenshteinDistance(str1: string, str2: string): number {
		const matrix: number[][] = [];

		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2[i - 1] === str1[j - 1]) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1, // substitution
						matrix[i][j - 1] + 1, // insertion
						matrix[i - 1][j] + 1, // deletion
					);
				}
			}
		}

		return matrix[str2.length][str1.length];
	}

	updateWeights(weights: Partial<RankingWeights>): void {
		this.weights = { ...this.weights, ...weights };
	}

	boostRecent(
		documents: ScoredDocument[],
		boostFactor: number = 1.2,
	): ScoredDocument[] {
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

		return documents.map((doc) => {
			if (doc.document.date && new Date(doc.document.date) >= thirtyDaysAgo) {
				return {
					...doc,
					score: Math.min(1.0, doc.score * boostFactor),
				};
			}
			return doc;
		});
	}
}
