/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import { SearchService } from "@services/search/SearchService";
import {
	type SemanticSearchResult,
	SemanticSearchService,
} from "@services/search/SemanticSearchService";

/**
 * POC-DEPENDENT (design D7 / POC "Fusion"): the Reciprocal Rank Fusion constant
 * `k` (the classic RRF default is 60). Larger `k` flattens the weight of the
 * very top ranks. Switch to a normalized weighted-sum (`alpha`) if RRF ranking
 * proves too coarse.
 */
const RRF_K = 60;

export interface HybridSearchResult {
	id: string;
	score: number;
}

export interface HybridSearchOptions {
	/** Max semantic neighbors to fetch before fusion (defaults to the service default). */
	semanticTopK?: number;
}

/**
 * Additive hybrid search (design D7, spec "Hybrid search augments lexical
 * results with a semantic ranker"): runs the existing lexical
 * `SearchService.search` AND `SemanticSearchService.search` in parallel and
 * fuses their ranked id lists with Reciprocal Rank Fusion. The lexical
 * `SearchService.search` signature/behavior is untouched; callers opt in here.
 * Degrades to lexical-only when the semantic side is unavailable, never throwing
 * or blocking on model load.
 */
export class HybridSearchService {
	static async search(
		query: string,
		options?: HybridSearchOptions,
	): Promise<HybridSearchResult[]> {
		if (!query.trim()) return [];

		const [lexical, semantic] = await Promise.all([
			SearchService.search(query),
			this.semanticSafe(query, options?.semanticTopK),
		]);

		return this.fuse(
			lexical.map((result) => result.id),
			semantic.map((result) => result.id),
		);
	}

	/**
	 * Semantic search that can never reject or block the hybrid query: any
	 * failure (model unavailable, cold model, no vectors) resolves to `[]`, so
	 * fusion falls back to the lexical ranking alone (spec "degrades gracefully
	 * to lexical-only").
	 */
	private static async semanticSafe(
		query: string,
		topK: number | undefined,
	): Promise<SemanticSearchResult[]> {
		try {
			return await SemanticSearchService.search(query, topK);
		} catch (error) {
			console.warn(
				"HybridSearchService: semantic search failed (lexical-only)",
				error,
			);
			return [];
		}
	}

	/**
	 * Reciprocal Rank Fusion: `score(id) = Σ 1 / (RRF_K + rank)` (0-based rank per
	 * engine). Fuses by RANK, not raw score, because MiniSearch's BM25-ish scores
	 * and cosine's 0..1 scores are on non-comparable scales. A file matched by
	 * both engines is boosted; a file matched by only one still appears. With an
	 * empty semantic list this reduces to the lexical order (graceful
	 * degradation).
	 */
	private static fuse(
		lexicalIds: string[],
		semanticIds: string[],
	): HybridSearchResult[] {
		const scores = new Map<string, number>();

		const accumulate = (ids: string[]): void => {
			for (let rank = 0; rank < ids.length; rank++) {
				const id = ids[rank];
				scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
			}
		};

		accumulate(lexicalIds);
		accumulate(semanticIds);

		return Array.from(scores.entries())
			.map(([id, score]) => ({ id, score }))
			.sort((a, b) => b.score - a.score);
	}
}
