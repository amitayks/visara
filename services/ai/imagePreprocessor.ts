import ImageResizer from "@bam.tech/react-native-image-resizer";
import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";
import type { PreprocessingOptions } from "./ocrTypes";

export class ImagePreprocessor {
	private static cache = new Map<string, string>();
	private static readonly CACHE_DIR =
		`${RNFS.CachesDirectoryPath}/preprocessed/`;
	private static readonly MAX_CACHE_SIZE = 50; // Maximum cached images

	static async initialize(): Promise<void> {
		// Ensure cache directory exists
		const dirExists = await RNFS.exists(ImagePreprocessor.CACHE_DIR);
		if (!dirExists) {
			await RNFS.mkdir(ImagePreprocessor.CACHE_DIR);
		}
	}

	static async preprocessImage(
		imageUri: string,
		options: PreprocessingOptions = {},
	): Promise<{ uri: string; cached: boolean; processingTime: number }> {
		const startTime = Date.now();

		// Generate cache key based on image URI and options
		const cacheKey = await ImagePreprocessor.generateCacheKey(
			imageUri,
			options,
		);

		// Check cache
		const cachedUri = ImagePreprocessor.cache.get(cacheKey);
		if (cachedUri) {
			const cachedFileExists = await RNFS.exists(cachedUri);
			if (cachedFileExists) {
				return {
					uri: cachedUri,
					cached: true,
					processingTime: Date.now() - startTime,
				};
			}
		}

		// Process image
		let maxWidth = 1500;
		let maxHeight = 1500;

		// Resize
		if (options.resize) {
			maxWidth = options.resize.maxWidth || 1024;
			maxHeight = options.resize.maxHeight || 1024;
		}

		// Process the image
		const processedImage = await ImageResizer.createResizedImage(
			imageUri,
			maxWidth,
			maxHeight,
			"JPEG",
			90, // quality
			0, // rotation
			undefined, // outputPath
			false, // keepMeta
		);

		// Additional preprocessing for binarization if requested
		let finalUri = processedImage.uri;
		if (options.binarize) {
			finalUri = await ImagePreprocessor.applyBinarization(processedImage.uri);
		}

		// Cache the processed image
		const cachedPath = `${ImagePreprocessor.CACHE_DIR}${cacheKey}.jpg`;
		await RNFS.copyFile(finalUri, cachedPath);

		// Update cache
		ImagePreprocessor.cache.set(cacheKey, cachedPath);

		// Clean old cache entries if needed
		if (ImagePreprocessor.cache.size > ImagePreprocessor.MAX_CACHE_SIZE) {
			const oldestKey = ImagePreprocessor.cache.keys().next().value;
			if (oldestKey) {
				const oldPath = ImagePreprocessor.cache.get(oldestKey);
				if (oldPath) {
					try {
						await RNFS.unlink(oldPath);
					} catch (e) {
						// File might not exist
					}
				}
				ImagePreprocessor.cache.delete(oldestKey);
			}
		}

		return {
			uri: cachedPath,
			cached: false,
			processingTime: Date.now() - startTime,
		};
	}

	private static async generateCacheKey(
		imageUri: string,
		options: PreprocessingOptions,
	): Promise<string> {
		const optionsString = JSON.stringify(options);
		let modTime = 0;
		try {
			const fileInfo = await RNFS.stat(imageUri);
			modTime = new Date(fileInfo.mtime).getTime();
		} catch (e) {
			// File might not exist
		}
		const content = `${imageUri}_${modTime}_${optionsString}`;
		return CryptoJS.SHA256(content).toString();
	}

	private static async applyBinarization(imageUri: string): Promise<string> {
		// Since expo-image-manipulator doesn't support binarization,
		// we'll return the original image and let the OCR engines handle it
		// In a production app, you might use a native module for this
		return imageUri;
	}

	static async clearCache(): Promise<void> {
		try {
			try {
				await RNFS.unlink(ImagePreprocessor.CACHE_DIR);
			} catch (e) {
				// Directory might not exist
			}
			ImagePreprocessor.cache.clear();
			await ImagePreprocessor.initialize();
		} catch (error) {
			console.error("Error clearing preprocessing cache:", error);
		}
	}

	static async getCacheSize(): Promise<number> {
		try {
			const files = await RNFS.readDir(ImagePreprocessor.CACHE_DIR);
			let totalSize = 0;

			for (const file of files) {
				totalSize += file.size || 0;
			}

			return totalSize;
		} catch (error) {
			console.error("Error getting cache size:", error);
			return 0;
		}
	}

	static getMemoryUsage(): number {
		// Return cache size in memory
		return ImagePreprocessor.cache.size;
	}
}
