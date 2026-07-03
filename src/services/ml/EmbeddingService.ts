/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import {
	isAvailable,
	models,
	TextEmbeddingsModule,
} from "react-native-executorch";

/**
 * POC-DEPENDENT (design D2): the concrete embedding model + its output
 * dimension. The pinned `react-native-executorch@0.9.2` registry ships
 * `all-minilm-l6-v2` (384-dim) as its strongest general sentence-embedding
 * preset — no EmbeddingGemma exists at this pin — so it is the concrete
 * default; the final model/dim are decided by the on-device embedding POC. The
 * output `dim` is NEVER hard-coded into callers: it is derived from the produced
 * vector's length and stored per-row (`EmbeddingRepository`), so a POC dim
 * change needs no migration.
 */
const EMBEDDING_MODEL = () => models.text_embedding.all_minilm_l6_v2();

/**
 * POC-DEPENDENT (design D2): the single source of the stored
 * `embeddings.model_version` and the stale-vector key. `id@revision`; bump the
 * revision suffix on any re-quantization/re-export so older vectors invalidate.
 */
export const EMBEDDING_MODEL_VERSION = "all-minilm-l6-v2@1";

/**
 * All-static, fail-soft wrapper around executorch's non-React
 * `TextEmbeddingsModule` (design D1). The module is loaded lazily, kept
 * resident, and the SAME instance serves both index-time and query-time
 * embedding so stored and query vectors share one space (D10). Every failure
 * path resolves to no vector (never throws), mirroring `MediaDiscoveryService`'s
 * native-availability guard, so the lexical pipeline is never affected.
 */
export class EmbeddingService {
	private static module: TextEmbeddingsModule | null = null;
	private static loadPromise: Promise<TextEmbeddingsModule> | null = null;

	/** The `model_version` stamped on stored vectors and matched at query time. */
	static getModelVersion(): string {
		return EMBEDDING_MODEL_VERSION;
	}

	/** Whether the executorch runtime is present at all (fail-soft when absent). */
	static isRuntimeAvailable(): boolean {
		return isAvailable;
	}

	/**
	 * Lazily load the resident module at most once and reuse it (model init is
	 * the dominant latency, so it is never per-call). Concurrent first calls
	 * share one in-flight promise. Resolves `null` when the runtime is
	 * unavailable; a load rejection is surfaced to the awaiting `embed` (which
	 * fails soft) and the promise is cleared so a later call may retry.
	 */
	private static ensureLoaded(): Promise<TextEmbeddingsModule | null> {
		if (this.module) return Promise.resolve(this.module);
		if (!isAvailable) return Promise.resolve(null);

		if (!this.loadPromise) {
			this.loadPromise = TextEmbeddingsModule.fromModelName(EMBEDDING_MODEL())
				.then((module) => {
					this.module = module;
					return module;
				})
				.finally(() => {
					this.loadPromise = null;
				});
		}
		return this.loadPromise;
	}

	/**
	 * Embed `text` to a `Float32Array`, or resolve `null` (never throw) when the
	 * text is empty, the runtime/model is unavailable, or inference errors — so
	 * the pipeline is unaffected (spec "The embedding runtime is unavailable").
	 */
	static async embed(text: string): Promise<Float32Array | null> {
		if (!text.trim()) return null;
		try {
			const module = await this.ensureLoaded();
			if (!module) return null;
			return await module.forward(text);
		} catch (error) {
			console.warn("EmbeddingService.embed failed (fail-soft)", error);
			return null;
		}
	}
}
