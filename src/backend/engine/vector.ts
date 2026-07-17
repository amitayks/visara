/**
 * Dependency-free vector math for the embedding path (design D4,
 * gemma-embedding-index spec). Kept free of llama.rn / react-native imports so
 * jest can exercise it directly (`src/backend/__tests__/mrl.test.ts`).
 */

/** Stored vector width: EmbeddingGemma 768-d MRL-truncated to 256 (design D4). */
export const EMBEDDING_DIMS = 256;

/** Norms below this are treated as the zero vector (not renormalizable). */
const MIN_L2_NORM = 1e-6;

/**
 * Matryoshka truncation + L2 renormalization: keep the first `dims`
 * components, rescale to unit length, return a fresh Float32Array.
 *
 * Returns null (fail-soft, mirrors EmbedEngine's contract) when the source is
 * shorter than `dims`, contains a non-finite component, or is (numerically)
 * the zero vector.
 */
export function truncateAndRenormalize(
	source: ArrayLike<number>,
	dims: number = EMBEDDING_DIMS,
): Float32Array | null {
	if (dims <= 0 || source.length < dims) {
		return null;
	}

	const out = new Float32Array(dims);
	let sumSquares = 0;
	for (let i = 0; i < dims; i++) {
		const value = source[i];
		if (!Number.isFinite(value)) {
			return null;
		}
		out[i] = value;
		// Accumulate from the f32-rounded value so the final norm is exact for
		// what we actually store.
		const rounded = out[i];
		sumSquares += rounded * rounded;
	}

	const norm = Math.sqrt(sumSquares);
	if (norm < MIN_L2_NORM) {
		return null;
	}

	for (let i = 0; i < dims; i++) {
		out[i] = out[i] / norm;
	}
	return out;
}
