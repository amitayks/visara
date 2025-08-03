import ImageResizer from "@bam.tech/react-native-image-resizer";
import CameraRoll from "@react-native-camera-roll/camera-roll";
import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";

interface ThumbnailResult {
	thumbnailUri: string;
	originalSize: number;
	thumbnailSize: number;
	compressionRatio: number;
}

interface ImageInfo {
	width: number;
	height: number;
	size: number;
	takenDate?: Date;
}

export class ThumbnailService {
	private thumbnailDir: string;

	constructor() {
		this.thumbnailDir = `${RNFS.DocumentDirectoryPath}/thumbnails/`;
		this.ensureThumbnailDirectory();
	}

	private async ensureThumbnailDirectory() {
		const dirExists = await RNFS.exists(this.thumbnailDir);
		if (!dirExists) {
			await RNFS.mkdir(this.thumbnailDir);
		}
	}

	async createThumbnail(imageUri: string): Promise<ThumbnailResult> {
		try {
			// Get original file info
			let originalSize = 0;
			try {
				const originalInfo = await RNFS.stat(imageUri);
				originalSize = originalInfo.size;
			} catch (e) {
				// File might not exist
			}

			// Generate thumbnail
			const manipulatedImage = await ImageResizer.createResizedImage(
				imageUri,
				150, // maxWidth
				150, // maxHeight
				"JPEG",
				70, // quality (0-100)
				0, // rotation
				undefined, // outputPath
				false, // keepMeta
			);

			// Generate unique filename based on image hash
			const hash = await this.calculateImageHash(imageUri);
			const thumbnailFilename = `thumb_${hash}.jpg`;
			const thumbnailPath = `${this.thumbnailDir}${thumbnailFilename}`;

			// Copy thumbnail to permanent location (move not available in RNFS)
			await RNFS.copyFile(manipulatedImage.uri, thumbnailPath);
			// Delete the temp file
			try {
				await RNFS.unlink(manipulatedImage.uri);
			} catch (e) {
				// Temp file might already be deleted
			}

			// Get thumbnail size
			let thumbnailSize = 0;
			try {
				const thumbnailInfo = await RNFS.stat(thumbnailPath);
				thumbnailSize = thumbnailInfo.size;
			} catch (e) {
				// File might not exist
			}

			return {
				thumbnailUri: thumbnailPath,
				originalSize,
				thumbnailSize,
				compressionRatio:
					originalSize > 0 ? (originalSize - thumbnailSize) / originalSize : 0,
			};
		} catch (error) {
			console.error("Error creating thumbnail:", error);
			throw error;
		}
	}

	async calculateImageHash(imageUri: string): Promise<string> {
		try {
			// For content URIs, we need to handle them carefully
			if (imageUri.startsWith('content://')) {
				// Generate a hash based on the URI itself plus timestamp
				// This ensures uniqueness even if we can't read the file content
				const uniqueString = `${imageUri}_${Date.now()}_${Math.random()}`;
				return CryptoJS.SHA256(uniqueString).toString();
			}
			
			// For file URIs, try to read the actual content
			try {
				const base64 = await RNFS.readFile(imageUri, "base64");
				const hash = CryptoJS.SHA256(base64).toString();
				return hash;
			} catch (readError) {
				console.warn("Could not read file for hash, using URI-based hash:", readError);
				// Fallback to URI-based hash
				const uniqueString = `${imageUri}_${Date.now()}_${Math.random()}`;
				return CryptoJS.SHA256(uniqueString).toString();
			}
		} catch (error) {
			console.error("Error calculating image hash:", error);
			// Ultimate fallback
			return CryptoJS.SHA256(`${imageUri}_${Date.now()}_${Math.random()}`).toString();
		}
	}

	async getImageInfo(imageUri: string): Promise<ImageInfo> {
		try {
			// Get file info
			let fileInfo: any = { exists: false };
			try {
				fileInfo = await RNFS.stat(imageUri);
				fileInfo.exists = true;
			} catch (e) {
				// File might not exist
			}

			// Get image dimensions using React Native Image
			const { Image } = require("react-native");
			const { width, height } = await new Promise<{
				width: number;
				height: number;
			}>((resolve, reject) => {
				Image.getSize(
					imageUri,
					(width: number, height: number) => resolve({ width, height }),
					reject,
				);
			});

			// Try to get EXIF data if it's from camera roll
			let takenDate: Date | undefined;

			// For now, we'll skip EXIF data extraction from CameraRoll
			// as it requires different handling

			// Fallback to file modification time
			if (!takenDate && fileInfo.exists) {
				takenDate = fileInfo.mtime;
			}

			return {
				width,
				height,
				size: fileInfo.exists ? fileInfo.size : 0,
				takenDate,
			};
		} catch (error) {
			console.error("Error getting image info:", error);
			return {
				width: 0,
				height: 0,
				size: 0,
			};
		}
	}

	async cleanupUnusedThumbnails(usedThumbnailUris: string[]): Promise<number> {
		try {
			const thumbnails = await RNFS.readDir(this.thumbnailDir);
			let deletedCount = 0;

			for (const thumbnail of thumbnails) {
				if (!usedThumbnailUris.includes(thumbnail.path)) {
					try {
						await RNFS.unlink(thumbnail.path);
						deletedCount++;
					} catch (e) {
						// File might not exist
					}
				}
			}

			return deletedCount;
		} catch (error) {
			console.error("Error cleaning up thumbnails:", error);
			return 0;
		}
	}

	async getThumbnailStorageSize(): Promise<number> {
		try {
			const thumbnails = await RNFS.readDir(this.thumbnailDir);
			let totalSize = 0;

			for (const thumbnail of thumbnails) {
				totalSize += thumbnail.size || 0;
			}

			return totalSize;
		} catch (error) {
			console.error("Error calculating thumbnail storage:", error);
			return 0;
		}
	}
}

export const thumbnailService = new ThumbnailService();
