import type { ModelArtifact, ModelManifest } from "@backend/types";

/**
 * Pinned Gemma model set (gemma-model-delivery spec: "Static pinned manifest").
 * One artifact set for BOTH platforms — no variants, no runtime getters.
 *
 * Digests were re-pinned 2026-07-17 from verified downloads. URLs point at an
 * IMMUTABLE Hugging Face commit revision (not `resolve/main`) so an upstream
 * re-upload can never again silently change the bytes under the pin and trip
 * the fail-closed verifier on-device — the 2026-07-15 pins broke exactly that
 * way (ggml-org/google re-uploaded the VLM + mmproj GGUFs, a metadata-only
 * change of ~1.7 KB / ~0.3 KB). Any deliberate model bump: update the commit
 * revision + sha256 + bytes here, together with MODEL_VERSION if output changes.
 */

const HF = "https://huggingface.co";

export const VLM_ARTIFACT: ModelArtifact = {
	key: "vlm",
	url: `${HF}/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/02078d687ddc1fdb1af29400364bdca7ee2b6062/gemma-4-E2B_q4_0-it.gguf`,
	filename: "gemma-4-E2B_q4_0-it.gguf",
	bytes: 3_349_515_840,
	sha256: "25194efbf8a53268241e5ffa6d5490edc08b3faaa6ead24478c8b025a986d556",
};

export const MMPROJ_ARTIFACT: ModelArtifact = {
	key: "mmproj",
	url: `${HF}/ggml-org/gemma-4-E2B-it-GGUF/resolve/858dcdf955fb1b5a43ed2301aea00362fc443a5c/mmproj-gemma-4-E2B-it-Q8_0.gguf`,
	filename: "mmproj-gemma-4-E2B-it-Q8_0.gguf",
	bytes: 557_368_064,
	sha256: "9406f99c16d68cda4f1f0552192dcc99021ea1fc6d2fd50b1dc3ccf30d04b292",
};

export const EMBEDDER_ARTIFACT: ModelArtifact = {
	key: "embedder",
	url: `${HF}/ggml-org/embeddinggemma-300M-GGUF/resolve/0f741b5a6585bd53aeb15cd1372c56f2a0f65e12/embeddinggemma-300M-Q8_0.gguf`,
	filename: "embeddinggemma-300M-Q8_0.gguf",
	bytes: 333_590_944,
	sha256: "b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63",
};

/**
 * Enrichment provenance tag (media.model_version). Bump when the VLM artifact,
 * prompt contract, or parser semantics change in a way that should re-enrich.
 */
export const MODEL_VERSION = "gemma-4-e2b-it-qat-q4_0@1";

/** Vector provenance tag (embedding_meta.model_version). */
export const EMBEDDER_VERSION = "embeddinggemma-300m-q8_0-mrl256@1";

export const MODEL_MANIFEST: ModelManifest = {
	modelVersion: MODEL_VERSION,
	embedderVersion: EMBEDDER_VERSION,
	artifacts: [VLM_ARTIFACT, MMPROJ_ARTIFACT, EMBEDDER_ARTIFACT],
};

/** Total bytes across all artifacts (~4.24 GB). */
export const MODEL_TOTAL_BYTES = MODEL_MANIFEST.artifacts.reduce(
	(sum, a) => sum + a.bytes,
	0,
);

/** Free-disk headroom required beyond remaining bytes (delivery preflight). */
export const DISK_HEADROOM_BYTES = 1024 * 1024 * 1024;
