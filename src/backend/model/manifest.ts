import type { ModelArtifact, ModelManifest } from "@backend/types";

/**
 * Pinned Gemma model set (gemma-model-delivery spec: "Static pinned manifest").
 * One artifact set for BOTH platforms — no variants, no runtime getters.
 *
 * URLs point at an IMMUTABLE Hugging Face commit revision (not `resolve/main`)
 * so an upstream re-upload can never silently change the bytes under the pin.
 *
 * VLM + mmproj are DELIBERATELY pinned to the PRE-re-upload revisions. On
 * 2026-07-15/16 upstream re-uploaded both GGUFs; the VLM change was
 * "Update metadata (tokenizer.chat_template)" (+1.7 KB). That new tokenizer
 * metadata makes the Android llama.cpp build hard-`abort()` in
 * `llama_vocab::impl::load` while loading the model (SIGABRT, whole-app crash)
 * — even though the iOS prebuilt parsed it fine. So we hold the original files,
 * which are verified working on BOTH platforms. Any future bump to the newer
 * files MUST be validated on a physical Android device (not just the iOS sim /
 * an emulator, whose CPU variant differs) before landing.
 */

const HF = "https://huggingface.co";

export const VLM_ARTIFACT: ModelArtifact = {
	key: "vlm",
	url: `${HF}/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf`,
	filename: "gemma-4-E2B_q4_0-it.gguf",
	bytes: 3_349_514_112,
	sha256: "3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd",
};

export const MMPROJ_ARTIFACT: ModelArtifact = {
	key: "mmproj",
	url: `${HF}/ggml-org/gemma-4-E2B-it-GGUF/resolve/b3a016208376b12ba27234f397bf29cf0538434e/mmproj-gemma-4-E2B-it-Q8_0.gguf`,
	filename: "mmproj-gemma-4-E2B-it-Q8_0.gguf",
	bytes: 557_367_776,
	sha256: "8a82e0fd831bb7cb5c8898b86393eb14042986b950a60e1034bf21d061aac8a8",
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
