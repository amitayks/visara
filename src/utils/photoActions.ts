import {
	loadMediaMetadata as loadMetadataFromBackend,
	removeMedia,
} from "@backend/facade";
import type { MediaRow as MediaFile } from "@backend/types";
import { Clipboard, Share } from "react-native";

/**
 * Photo Actions Utilities — shared reusable functions for common photo
 * operations, routed through the v2 backend facade.
 */

/**
 * Delete a photo: `permanent` requests OS-confirmed device deletion (and
 * purges all app data for it), otherwise the photo is hidden from the app
 * (reversible).
 */
export async function deletePhoto(
	media: MediaFile,
	permanent: boolean = false,
): Promise<void> {
	try {
		await removeMedia(media, { permanent });
	} catch (error) {
		console.error("Failed to delete photo:", error);
		throw new Error(
			`Failed to delete photo: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/** Share a photo/file using the system share sheet. */
export async function sharePhoto(media: MediaFile): Promise<void> {
	try {
		const result = await Share.share({
			title: `Share ${media.filename}`,
			message: `Check out this photo: ${media.filename}`,
			url: media.uri,
		});

		if (result.action === Share.sharedAction) {
			console.log(`Shared file: ${media.filename}`);
		} else if (result.action === Share.dismissedAction) {
			console.log("Share dismissed");
		}
	} catch (error) {
		console.error("Failed to share photo:", error);
		throw new Error(
			`Failed to share photo: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/** Copy text content to clipboard. */
export async function copyTextToClipboard(text: string): Promise<void> {
	try {
		await Clipboard.setString(text);
	} catch (error) {
		console.error("Failed to copy text:", error);
		throw new Error(
			`Failed to copy text: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/** Copy photo metadata (labels and text) to clipboard. */
export async function copyPhotoMetadata(
	labels: string[],
	ocrText?: string | null,
): Promise<void> {
	const metadataParts: string[] = [];

	if (labels.length > 0) {
		metadataParts.push(`Labels: ${labels.join(", ")}`);
	}

	if (ocrText?.trim()) {
		metadataParts.push(`Text: ${ocrText}`);
	}

	const metadata = metadataParts.join("\n\n");

	if (!metadata) {
		throw new Error("No metadata to copy");
	}
	await copyTextToClipboard(metadata);
}

/** Open file in external/default application (unimplemented placeholder). */
export async function openInExternalApp(media: MediaFile): Promise<void> {
	console.log(`Opening file externally: ${media.filename} (${media.uri})`);
	throw new Error("External app opening not yet implemented");
}

/**
 * Load enrichment metadata for a media file (viewer info panel): labels are
 * the Gemma tags; `ocrText` is the transcribed in-photo text. Empty values
 * for not-yet-enriched media, never throws.
 */
export async function loadMediaMetadata(mediaId: string): Promise<{
	labels: string[];
	ocrText: string | null;
}> {
	try {
		const metadata = await loadMetadataFromBackend(mediaId);
		return { labels: metadata.labels, ocrText: metadata.ocrText };
	} catch (error) {
		console.error("Failed to load media metadata:", error);
		return { labels: [], ocrText: null };
	}
}
