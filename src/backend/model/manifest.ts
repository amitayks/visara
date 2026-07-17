import type { ModelArtifact, ModelManifest } from "@backend/types";

/**
 * Pinned Gemma model set (gemma-model-delivery spec: "Static pinned manifest").
 * One artifact set for BOTH platforms — no variants, no runtime getters.
 *
 * Digests were computed 2026-07-05 from verified downloads of the exact URLs
 * below (byte sizes cross-checked against the Hugging Face tree API). Any
 * upstream file change breaks verification fail-closed — bump deliberately,
 * together with MODEL_VERSION.
 */

const HF = "https://huggingface.co";

export const VLM_ARTIFACT: ModelArtifact = {
	key: "vlm",
	url: `${HF}/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/main/gemma-4-E2B_q4_0-it.gguf`,
	filename: "gemma-4-E2B_q4_0-it.gguf",
	bytes: 3_349_514_112,
	sha256: "3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd",
};

export const MMPROJ_ARTIFACT: ModelArtifact = {
	key: "mmproj",
	url: `${HF}/ggml-org/gemma-4-E2B-it-GGUF/resolve/main/mmproj-gemma-4-E2B-it-Q8_0.gguf`,
	filename: "mmproj-gemma-4-E2B-it-Q8_0.gguf",
	bytes: 557_367_776,
	sha256: "8a82e0fd831bb7cb5c8898b86393eb14042986b950a60e1034bf21d061aac8a8",
};

export const EMBEDDER_ARTIFACT: ModelArtifact = {
	key: "embedder",
	url: `${HF}/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf`,
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
