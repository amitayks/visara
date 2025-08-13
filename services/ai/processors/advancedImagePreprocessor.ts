import ImageResizer from "@bam.tech/react-native-image-resizer";
import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";
import type { ProcessedImage } from "../types/hybridTypes";

export interface PreprocessingOptions {
	autoRotate?: boolean;
	enhanceContrast?: boolean;
	reduceNoise?: boolean;
	optimizeResolution?: boolean;
	targetLanguages?: string[];
	maxWidth?: number;
	maxHeight?: number;
	quality?: number;
}

export interface ImageAnalysis {
	brightness: number;
	contrast: number;
	sharpness: number;
	orientation: number;
	hasText: boolean;
	textRegions: Array<{
		x: number;
		y: number;
		width: number;
		height: number;
		confidence: number;
	}>;
}

export class AdvancedImagePreprocessor {
	private cache = new Map<string, ProcessedImage>();
	private readonly CACHE_DIR =
		`${RNFS.CachesDirectoryPath}/hybrid_preprocessed/`;
	private readonly MAX_CACHE_SIZE = 100;
	private initialized = false;

	async initialize(): Promise<void> {
		if (this.initialized) return;

		// Ensure cache directory exists
		const dirExists = await RNFS.exists(this.CACHE_DIR);
		if (!dirExists) {
			await RNFS.mkdir(this.CACHE_DIR);
		}

		this.initialized = true;
		console.log("Advanced Image Preprocessor initialized");
	}

	async processForOCR(
		imageUri: string,
		options: PreprocessingOptions = {},
	): Promise<ProcessedImage> {
		if (!this.initialized) {
			await this.initialize();
		}

		const startTime = Date.now();
		const opts: Required<PreprocessingOptions> = {
			autoRotate: true,
			enhanceContrast: true,
			reduceNoise: true,
			optimizeResolution: true,
			targetLanguages: ["en"],
			maxWidth: 2048,
			maxHeight: 2048,
			quality: 90,
			...options,
		};

		// Generate cache key
		const cacheKey = await this.generateCacheKey(imageUri, opts);

		// Check cache
		const cached = this.cache.get(cacheKey);
		if (cached) {
			const cacheFile = `${this.CACHE_DIR}${cacheKey}.jpg`;
			if (await RNFS.exists(cacheFile)) {
				console.log("Using cached preprocessed image");
				return {
					...cached,
					uri: cacheFile,
				};
			}
		}

		try {
			let processedUri = imageUri;
			const enhancements: string[] = [];
			let width = 0;
			let height = 0;
			let orientation = 0;

			// Step 1: Analyze image
			const analysis = await this.analyzeImage(imageUri);
			orientation = analysis.orientation;

			// Step 2: Auto-rotate if needed
			if (opts.autoRotate && Math.abs(analysis.orientation) > 1) {
				processedUri = await this.autoRotate(
					processedUri,
					analysis.orientation,
				);
				enhancements.push("auto-rotated");
			}

			// Step 3: Optimize resolution
			if (opts.optimizeResolution) {
				const resizeResult = await this.optimizeResolution(processedUri, opts);
				processedUri = resizeResult.uri;
				width = resizeResult.width;
				height = resizeResult.height;
				enhancements.push("resolution-optimized");
			}

			// Step 4: Enhance contrast if image is too dark/bright
			if (
				opts.enhanceContrast &&
				(analysis.brightness < 0.3 || analysis.brightness > 0.8)
			) {
				processedUri = await this.enhanceContrast(processedUri, analysis);
				enhancements.push("contrast-enhanced");
			}

			// Step 5: Reduce noise if image is blurry
			if (opts.reduceNoise && analysis.sharpness < 0.5) {
				processedUri = await this.reduceNoise(processedUri);
				enhancements.push("noise-reduced");
			}

			// Step 6: Language-specific optimizations
			if (
				opts.targetLanguages.includes("he") ||
				opts.targetLanguages.includes("ar")
			) {
				processedUri = await this.optimizeForRTL(processedUri);
				enhancements.push("rtl-optimized");
			}

			// Cache the result
			const finalFile = `${this.CACHE_DIR}${cacheKey}.jpg`;
			if (processedUri !== finalFile) {
				await RNFS.copyFile(processedUri, finalFile);
			}

			const processedImage: ProcessedImage = {
				uri: finalFile,
				width,
				height,
				orientation,
				enhancements,
				processingTime: Date.now() - startTime,
			};

			// Update cache
			this.cache.set(cacheKey, processedImage);
			await this.manageCacheSize();

			console.log(
				`Image preprocessing completed in ${processedImage.processingTime}ms`,
			);
			console.log(`Applied enhancements: ${enhancements.join(", ")}`);

			return processedImage;
		} catch (error) {
			console.error("Image preprocessing failed:", error);

			// Return minimal processed image
			return {
				uri: imageUri,
				width: 0,
				height: 0,
				orientation: 0,
				enhancements: [],
				processingTime: Date.now() - startTime,
			};
		}
	}

	private async analyzeImage(imageUri: string): Promise<ImageAnalysis> {
		try {
			// Get basic image info
			const stat = await RNFS.stat(imageUri);

			// For now, return estimated values
			// In a full implementation, you'd use image processing libraries
			return {
				brightness: 0.5, // Assume normal brightness
				contrast: 0.6, // Assume decent contrast
				sharpness: 0.7, // Assume reasonable sharpness
				orientation: 0, // Assume no rotation needed
				hasText: true, // Assume image has text
				textRegions: [], // Would be detected by text detection algorithm
			};
		} catch (error) {
			console.warn("Image analysis failed:", error);
			return {
				brightness: 0.5,
				contrast: 0.5,
				sharpness: 0.5,
				orientation: 0,
				hasText: true,
				textRegions: [],
			};
		}
	}

	private async autoRotate(
		imageUri: string,
		orientation: number,
	): Promise<string> {
		try {
			// Determine rotation needed
			let rotation = 0;
			if (Math.abs(orientation - 90) < Math.abs(orientation - 0)) {
				rotation = -90;
			} else if (Math.abs(orientation - 180) < Math.abs(orientation - 0)) {
				rotation = 180;
			} else if (Math.abs(orientation - 270) < Math.abs(orientation - 0)) {
				rotation = 90;
			}

			if (rotation === 0) {
				return imageUri;
			}

			const result = await ImageResizer.createResizedImage(
				imageUri,
				2048, // Max width
				2048, // Max height
				"JPEG",
				90, // Quality
				rotation,
				undefined, // Output path
				false, // Keep meta
			);

			return result.uri;
		} catch (error) {
			console.warn("Auto-rotation failed:", error);
			return imageUri;
		}
	}

	private async optimizeResolution(
		imageUri: string,
		options: Required<PreprocessingOptions>,
	): Promise<{ uri: string; width: number; height: number }> {
		try {
			const result = await ImageResizer.createResizedImage(
				imageUri,
				options.maxWidth,
				options.maxHeight,
				"JPEG",
				options.quality,
				0, // No rotation
				undefined, // Output path
				false, // Keep meta
			);

			return {
				uri: result.uri,
				width: result.width,
				height: result.height,
			};
		} catch (error) {
			console.warn("Resolution optimization failed:", error);
			return {
				uri: imageUri,
				width: 0,
				height: 0,
			};
		}
	}

	private async enhanceContrast(
		imageUri: string,
		analysis: ImageAnalysis,
	): Promise<string> {
		// For now, return original URI
		// In a full implementation, you'd apply contrast enhancement algorithms
		console.log(
			`Would enhance contrast for brightness: ${analysis.brightness}`,
		);
		return imageUri;
	}

	private async reduceNoise(imageUri: string): Promise<string> {
		// For now, return original URI
		// In a full implementation, you'd apply noise reduction filters
		console.log("Would apply noise reduction");
		return imageUri;
	}

	private async optimizeForRTL(imageUri: string): Promise<string> {
		// For now, return original URI
		// In a full implementation, you'd apply RTL-specific optimizations
		console.log("Would apply RTL text optimizations");
		return imageUri;
	}

	private async generateCacheKey(
		imageUri: string,
		options: Required<PreprocessingOptions>,
	): Promise<string> {
		const optionsString = JSON.stringify(options);
		let modTime = 0;

		try {
			const fileInfo = await RNFS.stat(imageUri);
			modTime = new Date(fileInfo.mtime).getTime();
		} catch (error) {
			// File might not exist, use current time
			modTime = Date.now();
		}

		const content = `${imageUri}_${modTime}_${optionsString}`;
		return CryptoJS.SHA256(content).toString().substring(0, 32);
	}

	private async manageCacheSize(): Promise<void> {
		if (this.cache.size <= this.MAX_CACHE_SIZE) {
			return;
		}

		// Remove oldest entries
		const entries = Array.from(this.cache.entries());
		const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);

		for (const [key, processedImage] of toRemove) {
			try {
				// Remove file
				if (await RNFS.exists(processedImage.uri)) {
					await RNFS.unlink(processedImage.uri);
				}
				// Remove from cache
				this.cache.delete(key);
			} catch (error) {
				console.warn(
					`Failed to remove cached file: ${processedImage.uri}`,
					error,
				);
			}
		}
	}

	async clearCache(): Promise<void> {
		try {
			// Remove all cached files
			const files = await RNFS.readDir(this.CACHE_DIR);

			for (const file of files) {
				try {
					await RNFS.unlink(file.path);
				} catch (error) {
					console.warn(`Failed to delete file: ${file.path}`, error);
				}
			}

			// Clear memory cache
			this.cache.clear();

			console.log("Preprocessing cache cleared");
		} catch (error) {
			console.error("Failed to clear preprocessing cache:", error);
		}
	}

	async getCacheSize(): Promise<{ files: number; totalSize: number }> {
		try {
			const files = await RNFS.readDir(this.CACHE_DIR);
			const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

			return {
				files: files.length,
				totalSize,
			};
		} catch (error) {
			console.warn("Failed to get cache size:", error);
			return { files: 0, totalSize: 0 };
		}
	}

	// Utility methods for specific image processing tasks
	async detectTextOrientation(imageUri: string): Promise<number> {
		// Placeholder for text orientation detection
		// Would use computer vision algorithms to detect text angle
		return 0;
	}

	async cropToTextRegion(imageUri: string): Promise<string> {
		// Placeholder for automatic text region cropping
		// Would detect text regions and crop to the main text area
		return imageUri;
	}

	async binarizeImage(imageUri: string): Promise<string> {
		// Placeholder for image binarization
		// Would convert image to black and white for better OCR
		return imageUri;
	}
}
