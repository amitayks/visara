import RNFS from "@dr.pogodin/react-native-fs";
import type { MediaFile } from "@models/MediaFile";
import { LabelRepository } from "@services/database/LabelRepository";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { OcrTextRepository } from "@services/database/OcrTextRepository";
import { Clipboard, Share } from "react-native";

/**
 * Photo Actions Utilities
 * Shared reusable functions for common photo operations
 */

/**
 * Delete a photo/file
 * @param media - The media file to delete
 * @param permanent - Whether to permanently delete from device (true) or just remove from app (false)
 * @returns Promise that resolves when deletion is complete
 */
export async function deletePhoto(
	media: MediaFile,
	permanent: boolean = false,
): Promise<void> {
	try {
		if (permanent) {
			// Permanently delete from device storage
			await RNFS.unlink(media.uri);
			console.log(`Permanently deleted file: ${media.filename}`);
		}

		// Remove from app database
		await MediaFileRepository.delete(media);
		console.log(`Removed from app database: ${media.filename}`);
	} catch (error) {
		console.error("Failed to delete photo:", error);
		throw new Error(
			`Failed to delete photo: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Share a photo/file using system share sheet
 * @param media - The media file to share
 * @returns Promise that resolves when share is complete
 */
export async function sharePhoto(media: MediaFile): Promise<void> {
	try {
		// Use React Native's built-in Share API
		// Note: This shares the URI, not the actual file
		// For actual file sharing, consider using react-native-share library
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

/**
 * Copy text content to clipboard
 * @param text - The text to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyTextToClipboard(text: string): Promise<void> {
	try {
		await Clipboard.setString(text);
		console.log("Text copied to clipboard");
	} catch (error) {
		console.error("Failed to copy text:", error);
		throw new Error(
			`Failed to copy text: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Copy photo metadata (labels and OCR text) to clipboard
 * @param labels - Array of label strings
 * @param ocrText - OCR text content
 * @returns Promise that resolves when copy is complete
 */
export async function copyPhotoMetadata(
	labels: string[],
	ocrText?: string | null,
): Promise<void> {
	try {
		const metadataParts: string[] = [];

		if (labels.length > 0) {
			metadataParts.push(`Labels: ${labels.join(", ")}`);
		}

		if (ocrText?.trim()) {
			metadataParts.push(`Text: ${ocrText}`);
		}

		const metadata = metadataParts.join("\n\n");

		if (metadata) {
			await copyTextToClipboard(metadata);
		} else {
			throw new Error("No metadata to copy");
		}
	} catch (error) {
		console.error("Failed to copy metadata:", error);
		throw new Error(
			`Failed to copy metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Open file in external/default application
 * @param media - The media file to open
 * @returns Promise that resolves when file is opened
 */
export async function openInExternalApp(media: MediaFile): Promise<void> {
	try {
		// TODO: Implement using react-native-file-viewer or similar
		// For now, just log
		console.log(`Opening file externally: ${media.filename}`);
		console.log(`File URI: ${media.uri}`);
		console.log(`MIME type: ${media.mimeType}`);

		// Placeholder: In a real implementation, you would use:
		// import FileViewer from "react-native-file-viewer";
		// await FileViewer.open(media.uri, { showOpenWithDialog: true });

		throw new Error("External app opening not yet implemented");
	} catch (error) {
		console.error("Failed to open in external app:", error);
		throw new Error(
			`Failed to open in external app: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Add photo to album (star action)
 * @param media - The media file to add to album
 * @param albumIds - Array of album IDs to add the photo to
 * @returns Promise that resolves when photo is added to albums
 */
export async function addToAlbums(
	media: MediaFile,
	albumIds: string[],
): Promise<void> {
	try {
		// TODO: Implement album association in database
		console.log(`Adding ${media.filename} to albums:`, albumIds);

		// Placeholder: In a real implementation, you would:
		// - Create AlbumMedia entries in the database
		// - Update album cover images if needed
		// - Trigger UI updates

		throw new Error("Album association not yet implemented");
	} catch (error) {
		console.error("Failed to add to albums:", error);
		throw new Error(
			`Failed to add to albums: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Load metadata for a media file
 * @param mediaId - The ID of the media file
 * @returns Promise that resolves with labels and OCR text
 */
export async function loadMediaMetadata(mediaId: string): Promise<{
	labels: string[];
	ocrText: string | null;
}> {
	try {
		const labels = await LabelRepository.findByMediaFileId(mediaId);
		const ocrTexts = await OcrTextRepository.findByMediaFileId(mediaId);

		return {
			labels: labels.map((label) => label.label),
			ocrText: ocrTexts.length > 0 ? ocrTexts[0].text : null,
		};
	} catch (error) {
		console.error("Failed to load media metadata:", error);
		return {
			labels: [],
			ocrText: null,
		};
	}
}
