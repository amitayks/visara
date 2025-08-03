import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";

const DOCUMENTS_DIR = `${RNFS.DocumentDirectoryPath}/visara_documents/`;
const THUMBNAILS_DIR = `${RNFS.DocumentDirectoryPath}/visara_thumbnails/`;

export class ImageStorageService {
	constructor() {
		console.log("ImageStorageService initializing...");
		this.ensureDirectories();
	}

	private async ensureDirectories() {
		try {
			const docsDirExists = await RNFS.exists(DOCUMENTS_DIR);
			if (!docsDirExists) {
				await RNFS.mkdir(DOCUMENTS_DIR);
				console.log("Created documents directory:", DOCUMENTS_DIR);
			}

			const thumbsDirExists = await RNFS.exists(THUMBNAILS_DIR);
			if (!thumbsDirExists) {
				await RNFS.mkdir(THUMBNAILS_DIR);
				console.log("Created thumbnails directory:", THUMBNAILS_DIR);
			}
		} catch (error) {
			console.error("Error creating directories:", error);
		}
	}

	async copyImageToPermanentStorage(
		tempUri: string,
		imageHash?: string,
	): Promise<string> {
		try {
			console.log("Copying image to permanent storage from:", tempUri);

			// First ensure directories exist
			await this.ensureDirectories();

			// Generate a unique filename using hash or crypto
			const hash = imageHash || (await this.generateHash(tempUri));
			const extension = this.getFileExtension(tempUri);
			const filename = `${hash}${extension}`;
			const permanentUri = `${DOCUMENTS_DIR}${filename}`;

			// Check if file already exists
			const fileExists = await RNFS.exists(permanentUri);
			if (fileExists) {
				console.log("Image already exists in permanent storage:", permanentUri);
				return `file://${permanentUri}`;
			}

			// Handle content:// URIs with chunked reading to avoid memory issues
			if (tempUri.startsWith('content://')) {
				try {
					// Use streaming approach for large files
					await this.copyContentUriChunked(tempUri, permanentUri);
					console.log("Image successfully copied from content URI to:", permanentUri);
					return `file://${permanentUri}`;
				} catch (contentError) {
					console.error("Failed to copy content URI:", contentError);
					throw contentError;
				}
			} else {
				// For file:// URIs, check if source exists first
				const sourceExists = await RNFS.exists(tempUri);
				if (!sourceExists) {
					console.error("Source file does not exist:", tempUri);
					throw new Error(`Source file does not exist: ${tempUri}`);
				}
				
				// Copy the file to permanent storage
				await RNFS.copyFile(tempUri, permanentUri);
				console.log("Image successfully copied to:", permanentUri);
				return `file://${permanentUri}`;
			}
		} catch (error) {
			console.error("Error copying image to permanent storage:", error);
			throw error; // Throw instead of returning original URI
		}
	}

	async copyThumbnailToPermanentStorage(
		tempUri: string,
		imageHash?: string,
	): Promise<string> {
		try {
			console.log("Copying thumbnail to permanent storage from:", tempUri);

			// First ensure directories exist
			await this.ensureDirectories();

			const hash = imageHash || (await this.generateHash(tempUri));
			const extension = this.getFileExtension(tempUri);
			const filename = `${hash}_thumb${extension}`;
			const permanentUri = `${THUMBNAILS_DIR}${filename}`;

			// Check if file already exists
			const fileExists = await RNFS.exists(permanentUri);
			if (fileExists) {
				console.log(
					"Thumbnail already exists in permanent storage:",
					permanentUri,
				);
				return `file://${permanentUri}`;
			}

			// Check if source file exists
			const sourceExists = await RNFS.exists(tempUri);
			if (!sourceExists) {
				console.error("Source thumbnail does not exist:", tempUri);
				return tempUri;
			}

			// Copy the file to permanent storage
			await RNFS.copyFile(tempUri, permanentUri);

			console.log("Thumbnail successfully copied to:", permanentUri);
			// Return with file:// protocol
			return `file://${permanentUri}`;
		} catch (error) {
			console.error("Error copying thumbnail to permanent storage:", error);
			console.error("Error details:", JSON.stringify(error));
			return tempUri;
		}
	}

	async deleteImage(imageUri: string): Promise<void> {
		try {
			// Remove file:// protocol if present
			const cleanUri = imageUri.replace('file://', '');
			const fileExists = await RNFS.exists(cleanUri);
			if (fileExists) {
				await RNFS.unlink(cleanUri);
				console.log("Deleted image:", imageUri);
			}
		} catch (error) {
			console.error("Error deleting image:", error);
		}
	}

	async deleteThumbnail(thumbnailUri: string): Promise<void> {
		try {
			// Remove file:// protocol if present
			const cleanUri = thumbnailUri.replace('file://', '');
			const fileExists = await RNFS.exists(cleanUri);
			if (fileExists) {
				await RNFS.unlink(cleanUri);
				console.log("Deleted thumbnail:", thumbnailUri);
			}
		} catch (error) {
			console.error("Error deleting thumbnail:", error);
		}
	}

	private async generateHash(uri: string): Promise<string> {
		const timestamp = Date.now().toString();
		const random = Math.random().toString(36).substring(2, 9);
		const data = `${uri}-${timestamp}-${random}`;
		const hash = CryptoJS.SHA256(data).toString();
		return hash.substring(0, 16); // Use first 16 characters
	}

	private getFileExtension(uri: string): string {
		const match = uri.match(/\.([^.]+)$/);
		return match ? `.${match[1]}` : ".jpg"; // Default to .jpg if no extension found
	}

	private async copyContentUriChunked(contentUri: string, destPath: string): Promise<void> {
		const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
		
		try {
			// For Android content URIs, we need to read in chunks
			// This is a workaround since RNFS doesn't handle large content URIs well
			const response = await fetch(contentUri);
			const blob = await response.blob();
			
			// Convert blob to base64 in chunks
			const reader = new FileReader();
			
			return new Promise((resolve, reject) => {
				reader.onloadend = async () => {
					try {
						const base64String = reader.result as string;
						const base64Data = base64String.split(',')[1];
						
						// Write in chunks to avoid memory issues
						const totalLength = base64Data.length;
						let written = 0;
						
						// Create empty file first
						await RNFS.writeFile(destPath, '', 'base64');
						
						while (written < totalLength) {
							const chunk = base64Data.slice(written, written + CHUNK_SIZE);
							await RNFS.appendFile(destPath, chunk, 'base64');
							written += chunk.length;
							
							// Allow UI to breathe
							await new Promise(resolve => setTimeout(resolve, 0));
						}
						
						resolve();
					} catch (error) {
						reject(error);
					}
				};
				
				reader.onerror = reject;
				reader.readAsDataURL(blob);
			});
		} catch (error) {
			// Fallback to direct base64 read for smaller files
			const base64Data = await RNFS.readFile(contentUri, 'base64');
			await RNFS.writeFile(destPath, base64Data, 'base64');
		}
	}
	
	private blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const base64String = reader.result as string;
				// Remove the data URL prefix
				const base64 = base64String.split(',')[1];
				resolve(base64);
			};
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	async getStorageInfo(): Promise<{
		documentsCount: number;
		thumbnailsCount: number;
		totalSizeMB: number;
	}> {
		try {
			const docsInfo = await RNFS.readDir(DOCUMENTS_DIR);
			const thumbsInfo = await RNFS.readDir(THUMBNAILS_DIR);

			let totalSize = 0;

			// Calculate size of documents
			for (const file of docsInfo) {
				totalSize += file.size || 0;
			}

			// Calculate size of thumbnails
			for (const file of thumbsInfo) {
				totalSize += file.size || 0;
			}

			return {
				documentsCount: docsInfo.length,
				thumbnailsCount: thumbsInfo.length,
				totalSizeMB: totalSize / (1024 * 1024),
			};
		} catch (error) {
			console.error("Error getting storage info:", error);
			return {
				documentsCount: 0,
				thumbnailsCount: 0,
				totalSizeMB: 0,
			};
		}
	}

	async clearAllImages(): Promise<void> {
		try {
			try {
				await RNFS.unlink(DOCUMENTS_DIR);
			} catch (e) {
				// Directory might not exist
			}
			try {
				await RNFS.unlink(THUMBNAILS_DIR);
			} catch (e) {
				// Directory might not exist
			}
			await this.ensureDirectories();
			console.log("Cleared all images and thumbnails");
		} catch (error) {
			console.error("Error clearing images:", error);
		}
	}
}

export const imageStorage = new ImageStorageService();
