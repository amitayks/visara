import * as RNFS from "@dr.pogodin/react-native-fs";
import NativeMediaIndexer from "@native-modules/NativeMediaIndexer";

/**
 * Inference-ready image preparation (design D3, gemma-vision-enrichment
 * "Inference-ready image preparation"): decode a platform asset URI
 * (`ph://` / `content://` / `file://`) into a temporary JPEG with longest
 * edge <= 896 px inside a bounded app-owned directory. llama.cpp reads plain
 * file paths only, so this is the sole doorway between OS media URIs and the
 * VLM.
 *
 * Decoding runs in the MediaIndexer TurboModule (PHImageManager on iOS,
 * ContentResolver + BitmapFactory on Android) — no RCTImageLoader chain, no
 * image-resizer dependency, and `ph://` assets decode without the deleted
 * camera-roll package's URL loader.
 *
 * All functions are fail-soft: preparation errors resolve to null (the
 * pipeline marks the item failed without invoking the model), cleanup errors
 * are swallowed.
 */

const MAX_EDGE_PX = 896;
const JPEG_QUALITY = 80;

/** Bounded temp dir for inference JPEGs (app cache; wiped at boot). */
export const INFERENCE_TEMP_DIR = `${RNFS.CachesDirectoryPath}/inference`;

/**
 * Decode + downscale `uri` to a temp JPEG (longest edge <= 896, quality 80)
 * and return its PLAIN file path (no `file://` prefix — llama.cpp fopens
 * plain paths and llama.rn strips the scheme itself, so plain is canonical).
 * Returns null on any failure.
 */
export async function toInferenceJpeg(uri: string): Promise<string | null> {
	const indexer = NativeMediaIndexer;
	if (!indexer) {
		console.warn("[ImagePrep] MediaIndexer unavailable");
		return null;
	}
	try {
		const path = await indexer.exportForInference(
			uri,
			MAX_EDGE_PX,
			JPEG_QUALITY,
			INFERENCE_TEMP_DIR,
		);
		return path && path.length > 0 ? stripFileScheme(path) : null;
	} catch (error) {
		console.warn("[ImagePrep] toInferenceJpeg failed:", error);
		return null;
	}
}

/**
 * Delete one prepared temp file. Only paths inside the inference dir are
 * touched (defensive: never unlink an arbitrary caller path). Never throws.
 */
export async function cleanupInferenceTemp(path: string): Promise<void> {
	const plain = stripFileScheme(path);
	if (!plain.startsWith(`${INFERENCE_TEMP_DIR}/`)) {
		return;
	}
	try {
		await RNFS.unlink(plain);
	} catch {
		// Already gone (or FS hiccup) — nothing to clean.
	}
}

/**
 * Remove the whole bounded temp dir (boot hygiene / wipeAllData). The dir is
 * lazily recreated by the native exporter on the next call. Never throws.
 */
export async function wipeInferenceDir(): Promise<void> {
	try {
		const exists = await RNFS.exists(INFERENCE_TEMP_DIR);
		if (exists) {
			await RNFS.unlink(INFERENCE_TEMP_DIR);
		}
	} catch (error) {
		console.warn("[ImagePrep] wipeInferenceDir failed:", error);
	}
}

function stripFileScheme(path: string): string {
	return path.startsWith("file://") ? path.slice("file://".length) : path;
}
