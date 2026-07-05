import { EMBEDDER_ARTIFACT } from "@backend/model/manifest";
import type { EmbedEngine } from "@backend/types";
import { initLlama, type LlamaContext } from "llama.rn";
import { createMutex, type Mutex } from "./mutex";
import { EMBEDDING_DIMS, truncateAndRenormalize } from "./vector";

/**
 * EmbeddingGemma-300M engine over llama.rn (design D4, gemma-embedding-index
 * spec). Lazy init, resident across calls (serves both drain-time document
 * embedding and query-time embedding), mean pooling, model-card task
 * prefixes, 768-d output MRL-truncated to 256 and L2-renormalized.
 *
 * Every public method is fail-soft: null on any failure, never a rejection.
 */

const EMBED_CONTEXT_TOKENS = 2048;

/** EmbeddingGemma model-card document prompt ("title: none | text: ..."). */
const DOC_PREFIX = "title: none | text: ";

/** EmbeddingGemma model-card retrieval query prompt. */
const QUERY_PREFIX = "task: search result | query: ";

export function createGemmaEmbed(modelDir: string): EmbedEngine {
	return new LlamaGemmaEmbed(modelDir);
}

export class LlamaGemmaEmbed implements EmbedEngine {
	private readonly modelDir: string;
	private readonly runExclusive: Mutex = createMutex();
	private context: LlamaContext | null = null;
	/** In-flight init shared so a failure is retryable on the next call. */
	private initPromise: Promise<LlamaContext> | null = null;

	constructor(modelDir: string) {
		this.modelDir = modelDir.replace(/\/+$/, "");
	}

	embedDoc(text: string): Promise<Float32Array | null> {
		return this.embed(text, DOC_PREFIX);
	}

	embedQuery(text: string): Promise<Float32Array | null> {
		return this.embed(text, QUERY_PREFIX);
	}

	/** Release this engine's context only (never releaseAllLlama). */
	dispose(): Promise<void> {
		return this.runExclusive(async () => {
			const context = this.context;
			this.context = null;
			this.initPromise = null;
			if (context === null) {
				return;
			}
			try {
				await context.release();
			} catch (error) {
				console.warn("[GemmaEmbed] release failed:", error);
			}
		});
	}

	private embed(text: string, prefix: string): Promise<Float32Array | null> {
		const trimmed = text.trim();
		if (trimmed.length === 0) {
			return Promise.resolve(null);
		}

		// Serialized: one llama.rn context never runs concurrent embeddings.
		return this.runExclusive(async () => {
			try {
				const context = await this.ensureContext();
				const result = await context.embedding(`${prefix}${trimmed}`);
				const raw = result.embedding;
				if (!Array.isArray(raw)) {
					return null;
				}
				return truncateAndRenormalize(raw, EMBEDDING_DIMS);
			} catch (error) {
				console.warn("[GemmaEmbed] embedding failed:", error);
				return null;
			}
		});
	}

	private ensureContext(): Promise<LlamaContext> {
		if (this.context !== null) {
			return Promise.resolve(this.context);
		}
		if (this.initPromise === null) {
			this.initPromise = initLlama({
				model: `${this.modelDir}/${EMBEDDER_ARTIFACT.filename}`,
				embedding: true,
				n_ctx: EMBED_CONTEXT_TOKENS,
				// Non-causal embedding models must fit the whole prompt in one
				// (u)batch — llama.rn's 512 default would reject long enrichment
				// texts, so match the context size.
				n_batch: EMBED_CONTEXT_TOKENS,
				n_ubatch: EMBED_CONTEXT_TOKENS,
				// EmbeddingGemma pools token states by mean (model card).
				pooling_type: "mean",
				// CPU on both platforms: a 300M Q8 embedder is cheap, and keeping it
				// off the GPU leaves Metal memory to the resident-hungry VLM (D10).
				n_gpu_layers: 0,
				use_mlock: false,
			})
				.then((context) => {
					this.context = context;
					return context;
				})
				.catch((error: unknown) => {
					// Clear so the next call retries instead of caching the failure.
					this.initPromise = null;
					throw error instanceof Error ? error : new Error(String(error));
				});
		}
		return this.initPromise;
	}
}
