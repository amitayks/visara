import { directories } from "@kesha-antonov/react-native-background-downloader";
import { Platform } from "react-native";
import { models } from "react-native-executorch";

/**
 * Per-platform manifest for the Gemma-4 E2B multimodal model (D7).
 *
 * The URL set is read from the pinned `react-native-executorch@0.9.2` getter
 * `models.llm.gemma4_e2b_multimodal()` — the single source of truth for the
 * `.pte` + `tokenizer.json` + `tokenizer_config.json` URLs — so this manifest
 * never drifts from what a later `useLLM({ model: ... })` will load. It also
 * reconstructs RNE's `getFilenameFromUri` transform and `RNEDirectory` so the
 * managed download can pre-place each file at the EXACT path RNE's
 * resource-fetcher expects, letting the eventual `useLLM` skip its own fetch
 * (D1). URLs are NEVER hardcoded here.
 */

/** Backend variant selected for the current platform (D7/D10). */
export type GemmaModelVariant = "mlx" | "vulkan" | "aicore";

/** Role of each of the three artifacts that make up a full acquisition. */
export type GemmaArtifactRole = "model" | "tokenizer" | "tokenizerConfig";

export interface GemmaModelArtifact {
	role: GemmaArtifactRole;
	/** Remote source URL from the executorch getter. */
	url: string;
	/** RNE `getFilenameFromUri(url)` result. */
	filename: string;
	/** Final on-disk cache path `${RNEDirectory}${filename}` (no `file://`). */
	path: string;
	/** The large weights file whose SHA-256 gates readiness. */
	isPte: boolean;
}

export interface GemmaModelManifest {
	variant: GemmaModelVariant;
	/**
	 * Version string a future Gemma engine MUST stamp into
	 * `media_files.ai_model_version`, keeping the orchestrator's version-aware
	 * idempotency guard correct once a Tier-1 drain lands (D7).
	 */
	modelVersion: string;
	/** Approximate total download size for the variant (POC-deferred). */
	expectedBytes: number;
	/** Pinned SHA-256 of the `.pte`, verified fail-closed before ready (D6). */
	expectedSha256: string;
	/** `${directories.documents}/react-native-executorch/` (pinned to RNE 0.9.2). */
	cacheDir: string;
	artifacts: GemmaModelArtifact[];
}

/**
 * RNE cache directory, reconstructed from the background-downloader's
 * `directories.documents` exactly as
 * `react-native-executorch-bare-resource-fetcher` computes `RNEDirectory`
 * (`lib/constants/directories.js`). Pinned to `react-native-executorch@0.9.2`.
 */
export const RNE_CACHE_DIR = `${directories.documents}/react-native-executorch/`;

/**
 * (POC-DEPENDENT) Placeholder SHA-256 sentinel. The real digest is pinned from
 * the #4 on-device POC (tasks.md 7.4) by hashing a known-good download once —
 * Software Mansion publishes no checksum manifest for 0.9.2 (D6). While this
 * placeholder is in place, verification cannot match, so the model is never
 * marked `ready` (fail-closed by construction); see `isDigestPinned`.
 */
export const EXPECTED_SHA256_PLACEHOLDER = "POC_PENDING_SHA256";

/**
 * (POC-DEPENDENT) Placeholder model-version string. The exact value is pinned
 * from the POC/Tier-1 change and MUST equal what the future Gemma engine writes
 * to `media_files.ai_model_version` (D7).
 */
export const GEMMA_MODEL_VERSION =
	"gemma4-e2b-multimodal@POC_PENDING_VERSION_TAG";

const GIB = 1024 * 1024 * 1024;

/** (POC-DEPENDENT) ~3.2 GB iOS MLX — refined at runtime from `bytesTotal`. */
const EXPECTED_BYTES_MLX = Math.round(3.2 * GIB);

/** (POC-DEPENDENT) ~4.4 GB Android Vulkan — refined at runtime from `bytesTotal`. */
const EXPECTED_BYTES_VULKAN = Math.round(4.4 * GIB);

/**
 * RNE's filename transform (`ResourceFetcherUtils.getFilenameFromUri`, pinned
 * to 0.9.2): strip the `http(s)://` scheme, cut at the first `#`, and replace
 * every char outside `[a-zA-Z0-9._-]` with `_`. Kept in one place so a single
 * change tracks the library.
 */
export function getFilenameFromUri(uri: string): string {
	let cleanUri = uri.replace(/^https?:\/\//, "");
	cleanUri = cleanUri.split("#")[0] ?? cleanUri;
	return cleanUri.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Platform → downloadable variant (D7). AICore (D10) is opt-in via override. */
function resolvePlatformVariant(): GemmaModelVariant {
	return Platform.OS === "android" ? "vulkan" : "mlx";
}

function expectedBytesForVariant(variant: GemmaModelVariant): number {
	switch (variant) {
		case "vulkan":
			return EXPECTED_BYTES_VULKAN;
		case "mlx":
			return EXPECTED_BYTES_MLX;
		// AICore satisfies readiness WITHOUT a download (D10): zero bytes.
		case "aicore":
			return 0;
	}
}

/**
 * Resolve the active manifest. Reads the three source URLs from the executorch
 * getter (never hardcoded) and derives each final cache path. Pass
 * `variantOverride: "aicore"` to model the detected Android AICore fast-path
 * (D10), whose artifact list is empty (no download).
 */
export function resolveGemmaModelManifest(
	variantOverride?: GemmaModelVariant,
): GemmaModelManifest {
	const variant = variantOverride ?? resolvePlatformVariant();

	// AICore is satisfied by the system-hosted model — no remote artifacts.
	if (variant === "aicore") {
		return {
			variant,
			modelVersion: GEMMA_MODEL_VERSION,
			expectedBytes: 0,
			expectedSha256: EXPECTED_SHA256_PLACEHOLDER,
			cacheDir: RNE_CACHE_DIR,
			artifacts: [],
		};
	}

	const config = models.llm.gemma4_e2b_multimodal();
	const sources: ReadonlyArray<{
		role: GemmaArtifactRole;
		url: string;
		isPte: boolean;
	}> = [
		{ role: "model", url: config.modelSource, isPte: true },
		{ role: "tokenizer", url: config.tokenizerSource, isPte: false },
		{
			role: "tokenizerConfig",
			url: config.tokenizerConfigSource,
			isPte: false,
		},
	];

	const artifacts: GemmaModelArtifact[] = sources.map(
		({ role, url, isPte }) => {
			const filename = getFilenameFromUri(url);
			return {
				role,
				url,
				filename,
				path: `${RNE_CACHE_DIR}${filename}`,
				isPte,
			};
		},
	);

	return {
		variant,
		modelVersion: GEMMA_MODEL_VERSION,
		expectedBytes: expectedBytesForVariant(variant),
		expectedSha256: EXPECTED_SHA256_PLACEHOLDER,
		cacheDir: RNE_CACHE_DIR,
		artifacts,
	};
}

/** The `.pte` artifact of a manifest, or `undefined` (e.g. the AICore variant). */
export function getPteArtifact(
	manifest: GemmaModelManifest,
): GemmaModelArtifact | undefined {
	return manifest.artifacts.find((artifact) => artifact.isPte);
}

/**
 * Whether the manifest carries a real pinned digest (vs. the POC placeholder).
 * Until pinned, integrity cannot be confirmed and the service holds short of
 * `ready` rather than deleting a downloaded-but-unverifiable file.
 */
export function isDigestPinned(manifest: GemmaModelManifest): boolean {
	return manifest.expectedSha256 !== EXPECTED_SHA256_PLACEHOLDER;
}
