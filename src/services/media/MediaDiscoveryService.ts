/** biome-ignore-all lint/complexity/noStaticOnlyClass: its bother me */
import {
	CameraRoll,
	type PhotoIdentifier,
} from "@react-native-camera-roll/camera-roll";
import { Platform } from "react-native";
import RNFS from "react-native-fs";

export interface DiscoveredMedia {
	uri: string;
	filename: string;
	mimeType: string;
	width: number;
	height: number;
	fileSize: number;
	creationDate: number;
	modificationDate: number;
	latitude?: number;
	longitude?: number;
	isPdf?: boolean;
}

export interface DiscoveryOptions {
	first?: number;
	after?: string;
	assetType?: "Photos" | "Videos" | "All";
	include?: Array<"filename" | "fileSize" | "location" | "imageSize">;
}

export class MediaDiscoveryService {
	static async discoverMedia(
		options: DiscoveryOptions = {},
	): Promise<{ media: DiscoveredMedia[]; hasNextPage: boolean; endCursor?: string }> {
		try {
			const result = await CameraRoll.getPhotos({
				first: options.first || 50,
				after: options.after,
				assetType: options.assetType || "All",
				include: options.include || [
					"filename",
					"fileSize",
					"location",
					"imageSize",
				],
			});

			const media: DiscoveredMedia[] = result.edges.map(
				(edge: PhotoIdentifier) => {
					const node = edge.node;
					return {
						uri: node.image.uri,
						filename: node.image.filename || this.extractFilenameFromUri(node.image.uri),
						mimeType: this.getMimeType(node.type, node.image.uri),
						width: node.image.width || 0,
						height: node.image.height || 0,
						fileSize: node.image.fileSize || 0,
						creationDate: node.timestamp * 1000, // Convert to milliseconds
						modificationDate: node.modificationTimestamp
							? node.modificationTimestamp * 1000
							: node.timestamp * 1000,
						latitude: node.location?.latitude,
						longitude: node.location?.longitude,
					};
				},
			);

			return {
				media,
				hasNextPage: result.page_info.has_next_page,
				endCursor: result.page_info.end_cursor,
			};
		} catch (error) {
			console.error("MediaDiscoveryService.discoverMedia error:", error);
			throw new Error(
				`Failed to discover media: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	static async discoverAllMedia(): Promise<DiscoveredMedia[]> {
		const allMedia: DiscoveredMedia[] = [];
		let hasNextPage = true;
		let endCursor: string | undefined;

		// Discover photos and videos from CameraRoll
		while (hasNextPage) {
			const result = await this.discoverMedia({
				first: 100,
				after: endCursor,
			});

			allMedia.push(...result.media);
			hasNextPage = result.hasNextPage;
			endCursor = result.endCursor;
		}

		// Discover PDFs (Android only)
		if (Platform.OS === "android") {
			const pdfs = await this.discoverPdfs();
			allMedia.push(...pdfs);
		}

		return allMedia;
	}

	static async discoverPdfs(): Promise<DiscoveredMedia[]> {
		if (Platform.OS !== "android") {
			return []; // iOS requires manual file picker
		}

		const pdfs: DiscoveredMedia[] = [];
		const searchPaths = [
			RNFS.DownloadDirectoryPath,
			RNFS.DocumentDirectoryPath,
			`${RNFS.ExternalStorageDirectoryPath}/Documents`,
			`${RNFS.ExternalStorageDirectoryPath}/Download`,
		];

		try {
			for (const path of searchPaths) {
				const exists = await RNFS.exists(path);
				if (!exists) continue;

				const files = await this.scanDirectoryForPdfs(path);
				pdfs.push(...files);
			}

			// Remove duplicates based on uri
			const uniquePdfs = Array.from(
				new Map(pdfs.map((pdf) => [pdf.uri, pdf])).values(),
			);

			return uniquePdfs;
		} catch (error) {
			console.error("MediaDiscoveryService.discoverPdfs error:", error);
			return [];
		}
	}

	private static async scanDirectoryForPdfs(
		dirPath: string,
		maxDepth = 3,
		currentDepth = 0,
	): Promise<DiscoveredMedia[]> {
		if (currentDepth >= maxDepth) return [];

		const pdfs: DiscoveredMedia[] = [];

		try {
			const items = await RNFS.readDir(dirPath);

			for (const item of items) {
				if (item.isFile() && item.name.toLowerCase().endsWith(".pdf")) {
					const stats = await RNFS.stat(item.path);
					pdfs.push({
						uri: `file://${item.path}`,
						filename: item.name,
						mimeType: "application/pdf",
						width: 0, // PDFs don't have dimensions
						height: 0,
						fileSize: Number(stats.size),
						creationDate: new Date(stats.ctime).getTime(),
						modificationDate: new Date(stats.mtime).getTime(),
						isPdf: true,
					});
				} else if (item.isDirectory()) {
					// Recursively scan subdirectories
					const subPdfs = await this.scanDirectoryForPdfs(
						item.path,
						maxDepth,
						currentDepth + 1,
					);
					pdfs.push(...subPdfs);
				}
			}
		} catch (error) {
			// Permission denied or other error, skip this directory
			console.warn(`Cannot scan directory ${dirPath}:`, error);
		}

		return pdfs;
	}

	static async discoverNewMedia(
		lastSyncTimestamp: number,
	): Promise<DiscoveredMedia[]> {
		const allMedia = await this.discoverAllMedia();
		return allMedia.filter(
			(media) => media.creationDate > lastSyncTimestamp,
		);
	}

	static async getMediaCount(): Promise<number> {
		try {
			// CameraRoll doesn't provide total count directly
			// We need to iterate through all to get accurate count
			const allMedia = await this.discoverAllMedia();
			return allMedia.length;
		} catch (error) {
			console.error("MediaDiscoveryService.getMediaCount error:", error);
			return 0;
		}
	}

	private static extractFilenameFromUri(uri: string): string {
		const segments = uri.split("/");
		return segments[segments.length - 1] || "unknown";
	}

	private static getMimeType(type: string, uri: string): string {
		// type format from CameraRoll: "image/jpeg", "video/mp4", etc.
		if (type) return type;

		// Fallback: extract from URI extension
		const extension = uri.split(".").pop()?.toLowerCase();
		switch (extension) {
			case "jpg":
			case "jpeg":
				return "image/jpeg";
			case "png":
				return "image/png";
			case "gif":
				return "image/gif";
			case "heic":
				return "image/heic";
			case "webp":
				return "image/webp";
			case "mp4":
				return "video/mp4";
			case "mov":
				return "video/quicktime";
			default:
				return "application/octet-stream";
		}
	}

	static async requestPermissions(): Promise<boolean> {
		try {
			if (Platform.OS === "android") {
				// On Android 13+, need READ_MEDIA_IMAGES and READ_MEDIA_VIDEO
				// Permissions are handled in AndroidManifest.xml
				// CameraRoll will automatically request when needed
				return true;
			}
			if (Platform.OS === "ios") {
				// iOS permissions are in Info.plist
				// CameraRoll will automatically request when needed
				return true;
			}
			return false;
		} catch (error) {
			console.error("MediaDiscoveryService.requestPermissions error:", error);
			return false;
		}
	}
}
