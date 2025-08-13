import {
	QueryIntent,
	QueryClassification,
	ExtractedEntity,
} from "./searchTypes";

export class QueryIntentClassifier {
	private readonly intentPatterns: Map<QueryIntent, RegExp[]>;

	constructor() {
		this.intentPatterns = this.initializePatterns();
	}

	classify(query: string, entities: ExtractedEntity[]): QueryIntent[] {
		const intents: QueryIntent[] = [];
		const normalizedQuery = query.toLowerCase().trim();

		// Check each intent pattern
		for (const [intent, patterns] of this.intentPatterns.entries()) {
			for (const pattern of patterns) {
				if (pattern.test(normalizedQuery)) {
					intents.push(intent);
					break; // Move to next intent after first match
				}
			}
		}

		// Infer intents from entities
		const inferredIntents = this.inferFromEntities(entities);
		intents.push(...inferredIntents);

		// Default to 'search' if no specific intent found
		if (intents.length === 0) {
			intents.push("search");
		}

		// Remove duplicates and return
		return [...new Set(intents)];
	}

	classifyWithConfidence(
		query: string,
		entities: ExtractedEntity[],
	): QueryClassification {
		const intents = this.classify(query, entities);
		const primaryIntent = this.determinePrimaryIntent(query, intents);
		const confidence = this.calculateConfidence(query, primaryIntent, entities);

		// Group entities by type
		const entityMap = new Map<string, ExtractedEntity[]>();
		for (const entity of entities) {
			const existing = entityMap.get(entity.type) || [];
			existing.push(entity);
			entityMap.set(entity.type, existing);
		}

		return {
			intent: primaryIntent,
			confidence,
			entities: entityMap,
		};
	}

	private initializePatterns(): Map<QueryIntent, RegExp[]> {
		const patterns = new Map<QueryIntent, RegExp[]>();

		// Search patterns
		patterns.set("search", [
			/\b(find|search|show|get|look for|locate|fetch)\b/i,
			/\b(where|which|what)\b.*\b(is|are|was|were)\b/i,
			/\b(חפש|מצא|הצג|איפה|מה)\b/,
			/^[^?]*$/, // Statements without questions often imply search
		]);

		// Filter patterns
		patterns.set("filter", [
			/\b(filter|only|just|exclude|include)\b/i,
			/\b(with|without|having|containing)\b/i,
			/\b(from|at|in|on|by)\b.*\b(vendor|store|place|date|time)\b/i,
			/\b(רק|בלי|עם|מ|ב)\b/,
		]);

		// Count patterns
		patterns.set("count", [
			/\b(how many|count|number of|total)\b/i,
			/\b(כמה|מספר|סה"כ)\b/,
			/\?.*\b(many|much)\b/i,
		]);

		// Compare patterns
		patterns.set("compare", [
			/\b(compare|versus|vs|difference|between)\b/i,
			/\b(more|less|greater|smaller|higher|lower|bigger|smaller)\s+than\b/i,
			/\b(over|above|under|below|exceed)\b.*\d+/i,
			/\b(השווה|לעומת|יותר|פחות|מעל|מתחת)\b/,
		]);

		// Aggregate patterns
		patterns.set("aggregate", [
			/\b(sum|total|average|mean|max|maximum|min|minimum)\b/i,
			/\b(aggregate|group by|breakdown)\b/i,
			/\b(סכום|ממוצע|מקסימום|מינימום)\b/,
		]);

		// Sort patterns
		patterns.set("sort", [
			/\b(sort|order|arrange|rank)\b.*\b(by|according)\b/i,
			/\b(latest|newest|oldest|recent|expensive|cheapest)\b/i,
			/\b(first|last|top|bottom)\b.*\d+/i,
			/\b(מיין|סדר|אחרון|ראשון|יקר|זול)\b/,
		]);

		// Limit patterns
		patterns.set("limit", [
			/\b(limit|top|first|last)\s+\d+/i,
			/\b(show|display|get)\s+(me\s+)?(\d+|the\s+(first|last|top))\b/i,
			/\bonly\s+\d+\b/i,
			/\b(רק|ראשון|אחרון)\s+\d+/,
		]);

		return patterns;
	}

	private inferFromEntities(entities: ExtractedEntity[]): QueryIntent[] {
		const intents: QueryIntent[] = [];

		for (const entity of entities) {
			switch (entity.type) {
				case "count":
					intents.push("limit");
					break;
				case "amount":
					// Amount often implies comparison or filtering
					const amountText = entity.originalText.toLowerCase();
					if (
						amountText.includes("over") ||
						amountText.includes("under") ||
						amountText.includes("above") ||
						amountText.includes("below")
					) {
						intents.push("compare");
					}
					intents.push("filter");
					break;
				case "date":
					intents.push("filter");
					break;
				case "vendor":
				case "documentType":
					intents.push("filter");
					break;
			}
		}

		return intents;
	}

	private determinePrimaryIntent(
		query: string,
		intents: QueryIntent[],
	): QueryIntent {
		// Priority order for intents
		const priorityOrder: QueryIntent[] = [
			"count", // Highest priority - user wants to know quantity
			"aggregate", // User wants calculations
			"compare", // User wants comparison
			"limit", // User specified a limit
			"sort", // User wants ordering
			"filter", // User wants filtering
			"search", // Default search
		];

		// Return the highest priority intent found
		for (const intent of priorityOrder) {
			if (intents.includes(intent)) {
				return intent;
			}
		}

		return "search"; // Default
	}

	private calculateConfidence(
		query: string,
		intent: QueryIntent,
		entities: ExtractedEntity[],
	): number {
		let confidence = 0.5; // Base confidence

		// Boost confidence based on pattern matches
		const patterns = this.intentPatterns.get(intent) || [];
		const normalizedQuery = query.toLowerCase();

		for (const pattern of patterns) {
			if (pattern.test(normalizedQuery)) {
				confidence += 0.2;
				break;
			}
		}

		// Boost confidence based on entity relevance
		for (const entity of entities) {
			if (this.isEntityRelevantToIntent(entity, intent)) {
				confidence += entity.confidence * 0.1;
			}
		}

		// Check for explicit intent keywords
		const explicitKeywords = this.getExplicitKeywords(intent);
		for (const keyword of explicitKeywords) {
			if (normalizedQuery.includes(keyword)) {
				confidence += 0.15;
				break;
			}
		}

		// Cap confidence at 1.0
		return Math.min(1.0, confidence);
	}

	private isEntityRelevantToIntent(
		entity: ExtractedEntity,
		intent: QueryIntent,
	): boolean {
		const relevanceMap: Record<QueryIntent, string[]> = {
			search: ["keyword", "documentType", "vendor"],
			filter: ["date", "amount", "vendor", "documentType"],
			count: ["count", "documentType"],
			compare: ["amount", "date"],
			aggregate: ["amount", "documentType"],
			sort: ["date", "amount"],
			limit: ["count"],
		};

		const relevantTypes = relevanceMap[intent] || [];
		return relevantTypes.includes(entity.type);
	}

	private getExplicitKeywords(intent: QueryIntent): string[] {
		const keywordMap: Record<QueryIntent, string[]> = {
			search: ["find", "search", "show", "get", "look"],
			filter: ["filter", "only", "just", "with", "without"],
			count: ["how many", "count", "number", "total"],
			compare: ["compare", "versus", "more than", "less than", "over", "under"],
			aggregate: ["sum", "total", "average", "max", "min"],
			sort: ["sort", "order", "latest", "newest", "oldest"],
			limit: ["limit", "top", "first", "last"],
		};

		return keywordMap[intent] || [];
	}

	combineIntents(
		intents1: QueryIntent[],
		intents2: QueryIntent[],
	): QueryIntent[] {
		const combined = [...intents1, ...intents2];
		return [...new Set(combined)];
	}

	isAggregationQuery(query: string, entities: ExtractedEntity[]): boolean {
		const intents = this.classify(query, entities);
		return intents.includes("aggregate") || intents.includes("count");
	}

	requiresRanking(intents: QueryIntent[]): boolean {
		// These intents require result ranking
		return (
			intents.includes("search") ||
			intents.includes("sort") ||
			intents.includes("limit")
		);
	}

	getSortCriteria(query: string): {
		field: "date" | "amount" | "relevance";
		order: "asc" | "desc";
	} {
		const normalizedQuery = query.toLowerCase();

		// Check for date sorting
		if (
			normalizedQuery.includes("latest") ||
			normalizedQuery.includes("newest") ||
			normalizedQuery.includes("recent") ||
			normalizedQuery.includes("אחרון")
		) {
			return { field: "date", order: "desc" };
		}

		if (
			normalizedQuery.includes("oldest") ||
			normalizedQuery.includes("earliest") ||
			normalizedQuery.includes("ישן") ||
			normalizedQuery.includes("ראשון")
		) {
			return { field: "date", order: "asc" };
		}

		// Check for amount sorting
		if (
			normalizedQuery.includes("expensive") ||
			normalizedQuery.includes("highest") ||
			normalizedQuery.includes("most") ||
			normalizedQuery.includes("יקר")
		) {
			return { field: "amount", order: "desc" };
		}

		if (
			normalizedQuery.includes("cheapest") ||
			normalizedQuery.includes("lowest") ||
			normalizedQuery.includes("least") ||
			normalizedQuery.includes("זול")
		) {
			return { field: "amount", order: "asc" };
		}

		// Default to relevance
		return { field: "relevance", order: "desc" };
	}
}
