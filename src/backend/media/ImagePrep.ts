import ImageResizer from "@bam.tech/react-native-image-resizer";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { Platform } from "react-native";

/**
 * Inference-ready image preparation (design D3, gemma-vision-enrichment
 * "Inference-ready image preparation"): decode a platform asset URI
 * (`ph://` / `content://` / `file://`) into a temporary JPEG with longest
 * edge <= 896 px inside a bounded app-owned directory. llama.cpp reads plain
 * file paths only, so this is the sole doorway between OS media URIs and the
 * VLM.
 *
 * All functions are fail-soft: preparation errors resolve to null (the
 * pipeline marks the item failed without invoking the model), cleanup errors
 * are swallowed.
 */

const MAX_EDGE_PX = 896;
const JPEG_QUALITY = 80;

/**
 * Bounded temp dir for inference JPEGs.
 *
 * Platform split is forced by @bam.tech/react-native-image-resizer's native
 * `outputPath` handling (verified in 3.0.x sources):
 * - iOS treats `outputPath` as a directory and only honors absolute paths
 *   under the app's Documents directory — any other absolute path (e.g.
 *   Library/Caches) is appended to Documents, producing a mangled nested dir
 *   our wipe would miss. So iOS uses `Documents/inference`.
 * - Android uses the directory verbatim, so it lives under the app cache dir.
 * Files here are deleted after each generation settles; `wipeInferenceDir()`
 * clears stragglers (e.g. after a crash mid-item).
 */
export const INFERENCE_TEMP_DIR =
	Platform.OS === "ios"
		? `${RNFS.DocumentDirectoryPath}/inference`
		: `${RNFS.CachesDirectoryPath}/inference`;

/** Cached ensure-dir promise (reset by wipeInferenceDir / on failure). */
let ensureDirPromise: Promise<void> | null = null;

function ensureInferenceDir(): Promise<void> {
	if (ensureDirPromise === null) {
		// RNFS.mkdir creates intermediate dirs and is a no-op when present. The
		// Android resizer native does NOT create the output dir (its
		// File.createNewFile throws on a missing parent), so this must run first.
		ensureDirPromise = RNFS.mkdir(INFERENCE_TEMP_DIR).catch((error) => {
			ensureDirPromise = null;
			throw error;
		});
	}
	return ensureDirPromise;
}

/**
 * Decode + downscale `uri` to a temp JPEG (longest edge <= 896, quality 80)
 * and return its PLAIN file path (no `file://` prefix — llama.cpp fopens
 * plain paths and llama.rn strips the scheme itself, so plain is canonical).
 * Returns null on any failure.
 */
export async function toInferenceJpeg(uri: string): Promise<string | null> {
	try {
		await ensureInferenceDir();
		const response = await ImageResizer.createResizedImage(
			uri,
			MAX_EDGE_PX,
			MAX_EDGE_PX,
			"JPEG",
			JPEG_QUALITY,
			0,
			INFERENCE_TEMP_DIR,
			false,
			{ mode: "contain", onlyScaleDown: true },
		);
		const path = response.path || response.uri;
		if (!path) {
			return null;
		}
		return stripFileScheme(path);
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
 * lazily recreated on the next toInferenceJpeg call. Never throws.
 */
export async function wipeInferenceDir(): Promise<void> {
	ensureDirPromise = null;
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
