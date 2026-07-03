/**
 * Dependency-free, strict-typed codec for embedding vectors (design D4).
 *
 * `EmbeddingRepository` (per-vector) and `SemanticSearchService` (matrix
 * snapshot) both serialize `Float32Array`s to a compact base64 payload — the
 * raw Float32 little-endian bytes, ~1.33x the byte size and lossless. The
 * base64 encode/decode is implemented here rather than via `atob`/`btoa`/
 * `Buffer` because those globals are not declared under the project's
 * `lib: ["es2017"]` TypeScript surface and vary by runtime.
 */

const BASE64_CHARS =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reverse lookup: char code -> 6-bit value (or -1 for non-alphabet chars). */
const BASE64_LOOKUP = buildBase64Lookup();

function buildBase64Lookup(): Int8Array {
	const table = new Int8Array(256).fill(-1);
	for (let i = 0; i < BASE64_CHARS.length; i++) {
		table[BASE64_CHARS.charCodeAt(i)] = i;
	}
	return table;
}

function bytesToBase64(bytes: Uint8Array): string {
	let result = "";
	const len = bytes.length;
	let i = 0;
	for (; i + 2 < len; i += 3) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		result +=
			BASE64_CHARS[(n >> 18) & 63] +
			BASE64_CHARS[(n >> 12) & 63] +
			BASE64_CHARS[(n >> 6) & 63] +
			BASE64_CHARS[n & 63];
	}
	const remaining = len - i;
	if (remaining === 1) {
		const n = bytes[i] << 16;
		result += `${BASE64_CHARS[(n >> 18) & 63]}${BASE64_CHARS[(n >> 12) & 63]}==`;
	} else if (remaining === 2) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
		result += `${BASE64_CHARS[(n >> 18) & 63]}${BASE64_CHARS[(n >> 12) & 63]}${BASE64_CHARS[(n >> 6) & 63]}=`;
	}
	return result;
}

function base64ToBytes(base64: string): Uint8Array {
	const len = base64.length;
	if (len === 0) return new Uint8Array(0);

	let padding = 0;
	if (base64[len - 1] === "=") padding++;
	if (base64[len - 2] === "=") padding++;

	const outLen = (len >> 2) * 3 - padding;
	const bytes = new Uint8Array(outLen);
	let p = 0;
	for (let i = 0; i < len; i += 4) {
		const c0 = BASE64_LOOKUP[base64.charCodeAt(i)];
		const c1 = BASE64_LOOKUP[base64.charCodeAt(i + 1)];
		const c2 = BASE64_LOOKUP[base64.charCodeAt(i + 2)];
		const c3 = BASE64_LOOKUP[base64.charCodeAt(i + 3)];
		const n =
			((c0 & 63) << 18) | ((c1 & 63) << 12) | ((c2 & 63) << 6) | (c3 & 63);
		if (p < outLen) bytes[p++] = (n >> 16) & 255;
		if (p < outLen) bytes[p++] = (n >> 8) & 255;
		if (p < outLen) bytes[p++] = n & 255;
	}
	return bytes;
}

/** Serialize a `Float32Array` to base64 of its raw little-endian bytes. */
export function float32ToBase64(vector: Float32Array): string {
	const bytes = new Uint8Array(
		vector.buffer,
		vector.byteOffset,
		vector.byteLength,
	);
	return bytesToBase64(bytes);
}

/**
 * Decode a base64 payload back to a `Float32Array`. The decoded bytes live at
 * offset 0 of a fresh, aligned buffer, so wrapping them is valid; the float
 * count is `floor(byteLength / 4)`.
 */
export function base64ToFloat32(base64: string): Float32Array {
	const bytes = base64ToBytes(base64);
	const floatCount = Math.floor(bytes.byteLength / 4);
	return new Float32Array(bytes.buffer, bytes.byteOffset, floatCount);
}

/**
 * Return an L2-normalized copy of `vector` (unit length) so cosine similarity
 * reduces to a dot product (design D4). A zero/invalid-norm vector is returned
 * as a plain copy (never divided by zero).
 */
export function l2Normalize(vector: Float32Array): Float32Array {
	let sumSquares = 0;
	for (let i = 0; i < vector.length; i++) {
		sumSquares += vector[i] * vector[i];
	}
	const norm = Math.sqrt(sumSquares);
	if (norm === 0 || !Number.isFinite(norm)) {
		return new Float32Array(vector);
	}
	const out = new Float32Array(vector.length);
	for (let i = 0; i < vector.length; i++) {
		out[i] = vector[i] / norm;
	}
	return out;
}
