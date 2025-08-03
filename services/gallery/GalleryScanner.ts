import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import CryptoJS from "crypto-js";
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import BackgroundService from "react-native-background-actions";
import { documentProcessor, type DocumentResult } from "../ai/documentProcessor";
import { documentStorage } from "../database/documentStorage";
import { smartFilter, type AssetInfo, type SmartFilterOptions } from "./smartFilter";
import { deviceInfo } from "../../utils/deviceInfo";
import { galleryPermissions } from "../permissions/galleryPermissions";

export interface ScanProgress {
	totalImages: number;
	processedImages: number;
	lastScanDate: Date | null;
	lastProcessedAssetId: string | null;
	isScanning: boolean;
}

export interface ScanOptions {
	batchSize?: number;
	minFileSize?: number; // in KB
	maxFileSize?: number; // in KB
	maxAspectRatio?: number;
	wifiOnly?: boolean;
	batterySaver?: boolean;
	smartFilterEnabled?: boolean;
	smartFilterOptions?: Partial<SmartFilterOptions>;
	scanNewOnly?: boolean;
	retryFailedImages?: boolean;
	maxRetries?: number;
}

const DEFAULT_OPTIONS: ScanOptions = {
	batchSize: 20,
	minFileSize: 100, // 100KB minimum
	maxFileSize: 50 * 1024, // 50MB maximum
	maxAspectRatio: 3, // Skip panoramas
	wifiOnly: false,
	batterySaver: true,
	smartFilterEnabled: true,
	scanNewOnly: false,
	retryFailedImages: true,
	maxRetries: 3,
};

const SCAN_PROGRESS_KEY = "gallery_scan_progress";
const PROCESSED_HASHES_KEY = "processed_image_hashes";
const FAILED_IMAGES_KEY = "failed_image_uris";
const SCAN_HISTORY_KEY = "scan_history";

export class GalleryScanner {
	private isScanning = false;
	private shouldStop = false;
	private progress: ScanProgress = {
		totalImages: 0,
		processedImages: 0,
		lastScanDate: null,
		lastProcessedAssetId: null,
		isScanning: false,
	};
	private processedHashes = new Set<string>();
	private failedImages = new Map<string, number>(); // uri -> retry count
	private memoryCheckInterval: NodeJS.Timeout | null = null;
	private scanHistory: Array<{
		date: Date;
		imagesScanned: number;
		documentsFound: number;
		duration: number;
	}> = [];
	private onProgressCallback?: (progress: ScanProgress) => void;
	private scanStartTime = 0;
	private documentsFoundInScan = 0;

	constructor() {
		this.loadProgress();
		this.loadProcessedHashes();
		this.loadFailedImages();
		this.loadScanHistory();
	}

	async requestPermissions(): Promise<boolean> {
		return await galleryPermissions.ensurePermission();
	}

	async hasPermissions(): Promise<boolean> {
		try {
			const result = await galleryPermissions.checkPermission();
			return result.status === "granted";
		} catch (error) {
			console.error("[GalleryScanner] Permission check failed:", error);
			return false;
		}
	}

	async startScan(
		options: ScanOptions = {},
		onProgress?: (progress: ScanProgress) => void,
	) {
		if (this.isScanning) {
			console.log("Scan already in progress");
			return;
		}

		const hasPermission = await this.requestPermissions();
		if (!hasPermission) {
			throw new Error("Gallery permission denied");
		}

		// Check device conditions
		const scanOptions = { ...DEFAULT_OPTIONS, ...options };
		if (scanOptions.batterySaver || scanOptions.wifiOnly) {
			const deviceCheck = await deviceInfo.canRunBackgroundTask({
				wifiOnly: scanOptions.wifiOnly || false,
				batterySaver: scanOptions.batterySaver || false,
			});
			
			if (!deviceCheck.canRun) {
				throw new Error(deviceCheck.reason || "Device conditions not met for scanning");
			}
		}

		this.isScanning = true;
		this.shouldStop = false;
		this.onProgressCallback = onProgress;
		this.scanStartTime = Date.now();
		this.documentsFoundInScan = 0;

		// Configure smart filter if enabled
		if (scanOptions.smartFilterEnabled && scanOptions.smartFilterOptions) {
			smartFilter.updateOptions(scanOptions.smartFilterOptions);
		}
		
		// Start memory monitoring
		this.startMemoryMonitoring();

		try {
			await this.performScan(scanOptions);
			
			// Save scan history
			const scanDuration = Date.now() - this.scanStartTime;
			this.scanHistory.push({
				date: new Date(),
				imagesScanned: this.progress.processedImages,
				documentsFound: this.documentsFoundInScan,
				duration: scanDuration,
			});
			await this.saveScanHistory();
		} finally {
			this.stopMemoryMonitoring();
			this.isScanning = false;
			this.progress.isScanning = false;
			await this.saveProgress();
		}
	}

	async stopScan() {
		this.shouldStop = true;
	}

	private async performScan(options: ScanOptions) {
		// Get all photos from camera roll
		const photos = await CameraRoll.getPhotos({
			first: 10000, // Large batch to get all
			assetType: "Photos",
			include: ["filename", "fileSize", "imageSize", "playableDuration"],
		});

		const allAssets = photos.edges.map((edge: any) => edge.node);

		// Remove duplicates based on uri
		const uniqueAssets = Array.from(
			new Map(allAssets.map((asset: any) => [asset.image.uri, asset])).values(),
		);

		// Sort by timestamp (newest first)
		uniqueAssets.sort(
			(a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0),
		);

		// Resume from last position if available
		let startIndex = 0;
		if (this.progress.lastProcessedAssetId) {
			const lastIndex = uniqueAssets.findIndex(
				(asset: any) => asset.image.uri === this.progress.lastProcessedAssetId,
			);
			if (lastIndex !== -1) {
				startIndex = lastIndex + 1;
			}
		}

		this.progress.totalImages = uniqueAssets.length;
		this.progress.processedImages = startIndex;
		this.progress.isScanning = true;

		// Process in batches with dynamic sizing based on memory
		let batchSize = options.batchSize || DEFAULT_OPTIONS.batchSize!;
		
		// Adjust batch size based on available memory
		const memoryInfo = await deviceInfo.getMemoryInfo();
		if (memoryInfo.isLowMemory) {
			batchSize = Math.max(5, Math.floor(batchSize / 2));
			console.log(`Low memory detected, reducing batch size to ${batchSize}`);
		}

		for (
			let i = startIndex;
			i < uniqueAssets.length && !this.shouldStop;
			i += batchSize
		) {
			const batch = uniqueAssets.slice(i, i + batchSize);

			// Apply smart filtering to prioritize assets
			if (options.smartFilterEnabled) {
				const prioritizedBatch = await this.prioritizeBatch(batch, options);
				await this.processBatch(prioritizedBatch, options);
			} else {
				await this.processBatch(batch, options);
			}

			this.progress.processedImages = Math.min(
				i + batchSize,
				uniqueAssets.length,
			);
			this.progress.lastProcessedAssetId = (
				batch[batch.length - 1] as any
			).image.uri;

			// Save progress after each batch
			await this.saveProgress();

			if (this.onProgressCallback) {
				this.onProgressCallback(this.progress);
			}
			
			// Dynamic batch size adjustment based on processing time
			if (i > startIndex && memoryInfo.availableMemory > 200) {
				// If we have good memory, we can try increasing batch size
				batchSize = Math.min(batchSize + 5, options.batchSize || DEFAULT_OPTIONS.batchSize!);
			}
		}

		this.progress.lastScanDate = new Date();
		await this.saveProgress();
	}

	private async processBatch(assets: any[], options: ScanOptions) {
		// Check memory before processing batch
		const memoryInfo = await deviceInfo.getMemoryInfo();
		if (memoryInfo.availableMemory < 100 * 1024 * 1024) { // Less than 100MB
			console.log("[GalleryScanner] Low memory, pausing scan");
			await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
		}
		
		// Process sequentially with memory breaks
		for (let i = 0; i < assets.length; i++) {
			if (this.shouldStop) {
				console.log("[GalleryScanner] Stop requested, breaking batch processing");
				break;
			}
			
			try {
				await this.processAsset(assets[i], options);
				
				// Every 5 images, pause to let UI breathe
				if ((i + 1) % 5 === 0) {
					await new Promise(resolve => setTimeout(resolve, 500));
				}
				
				// Check memory periodically
				if ((i + 1) % 10 === 0) {
					const currentMemory = await deviceInfo.getMemoryInfo();
					if (currentMemory.availableMemory < 50 * 1024 * 1024) { // Less than 50MB
						console.log("[GalleryScanner] Critical memory, pausing longer");
						await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
					}
				}
				
			} catch (error) {
				console.error(`Failed to process asset ${assets[i].image.uri}:`, error);
				
				// On error, give system time to recover
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}

	private async processAsset(asset: any, options: ScanOptions): Promise<void> {
		try {
			// Apply smart filtering
			if (!(await this.shouldProcessAsset(asset, options))) {
				return;
			}

			// Use the asset info directly from CameraRoll
			const assetInfo = {
				id: asset.image.uri,
				uri: asset.image.uri,
				localUri: asset.image.uri,
				filename: asset.image.filename || "",
				mediaType: "photo",
				width: asset.image.width,
				height: asset.image.height,
				creationTime: asset.timestamp || Date.now(),
				modificationTime: asset.timestamp || Date.now(),
				duration: 0,
				location: asset.location,
			};

			// Important: Check if we're in background and if the service is still running
			if (BackgroundService.isRunning()) {
				// Update notification
				await BackgroundService.updateNotification({
					taskDesc: `Processing: ${asset.image.filename || 'image'}...`,
				});
			}
			
			// Process the image with timeout
			let result: DocumentResult | null = null;
			
			try {
				const processPromise = documentProcessor.processImage(
					assetInfo.localUri || assetInfo.uri,
				);
				const timeoutPromise = new Promise<null>((_, reject) => 
					setTimeout(() => reject(new Error('Processing timeout')), 30000) // 30 second timeout
				);
				
				result = await Promise.race([processPromise, timeoutPromise]);
			} catch (timeoutError) {
				if (timeoutError instanceof Error && timeoutError.message === 'Processing timeout') {
					console.log(`Processing timeout for ${asset.image.filename}, skipping...`);
					// Track for potential retry later
					this.failedImages.set(assetInfo.uri, 1);
					return; // Skip this image, don't crash
				}
				throw timeoutError; // Re-throw other errors
			}
			
			if (result && result.confidence > 0.63) {
				// Check for duplicate using the actual image hash from result
				const existingDoc = await documentStorage.checkDuplicateByHash(result.imageHash);
				if (existingDoc) {
					console.log(`Document already exists with hash: ${result.imageHash}`);
					this.processedHashes.add(result.imageHash);
					return;
				}
				
				// Save to database
				const savedDoc = await documentStorage.saveDocument(result);
				
				console.log(`Successfully saved document: ${savedDoc.id} - ${asset.image.filename}`);
				
				this.processedHashes.add(result.imageHash);
				await this.saveProcessedHashes();
				this.documentsFoundInScan++;
				
				// Remove from failed images if it was there
				this.failedImages.delete(assetInfo.uri);
			} else {
				console.log(`Document confidence too low (${result?.confidence || 0}) for ${asset.image.filename}`);
			}
		} catch (error) {
			console.error(`Error processing asset ${asset.image.uri}:`, error);
			
			// Track failed images for retry
			const retryCount = this.failedImages.get(asset.image.uri) || 0;
			if (retryCount < (options.maxRetries || DEFAULT_OPTIONS.maxRetries!)) {
				this.failedImages.set(asset.image.uri, retryCount + 1);
			}
			
			// Don't throw - just log and continue
		}
	}
	
	private async prioritizeBatch(assets: any[], options: ScanOptions): Promise<any[]> {
		// Calculate priority for each asset
		const assetsWithPriority = await Promise.all(
			assets.map(async (asset) => {
				const assetInfo: AssetInfo = {
					uri: asset.image.uri,
					filename: asset.image.filename,
					width: asset.image.width,
					height: asset.image.height,
					timestamp: asset.timestamp,
				};
				
				const filterResult = await smartFilter.shouldProcess(assetInfo);
				return {
					asset,
					priority: filterResult.priority,
					shouldProcess: filterResult.shouldProcess,
				};
			})
		);
		
		// Sort by priority (highest first) and filter out assets that shouldn't be processed
		return assetsWithPriority
			.filter(item => item.shouldProcess)
			.sort((a, b) => b.priority - a.priority)
			.map(item => item.asset);
	}

	private async shouldProcessAsset(
		asset: any,
		options: ScanOptions,
	): Promise<boolean> {
		if (options.smartFilterEnabled) {
			// Use smart filter for advanced filtering
			const assetInfo: AssetInfo = {
				uri: asset.image.uri,
				filename: asset.image.filename,
				width: asset.image.width,
				height: asset.image.height,
				timestamp: asset.timestamp,
			};
			
			// Try to get file size if possible
			if (Platform.OS === "ios" && asset.image.uri) {
				try {
					const fileInfo = await RNFS.stat(asset.image.uri);
					assetInfo.fileSize = fileInfo.size;
				} catch (e) {
					// Ignore file size check if we can't get it
				}
			}
			
			const filterResult = await smartFilter.shouldProcess(assetInfo);
			return filterResult.shouldProcess;
		} else {
			// Fallback to basic filtering
			// Priority for filenames containing document keywords
			const documentKeywords = [
				"doc",
				"receipt",
				"scan",
				"invoice",
				"id",
				"form",
				"contract",
				"pdf",
			];
			const filename = (asset.image.filename || "").toLowerCase();
			const hasDocumentKeyword = documentKeywords.some((keyword) =>
				filename.includes(keyword),
			);

			if (hasDocumentKeyword) {
				return true; // Always process if filename suggests it's a document
			}

			// Check aspect ratio
			if (options.maxAspectRatio && asset.image.width && asset.image.height) {
				const aspectRatio =
					Math.max(asset.image.width, asset.image.height) /
					Math.min(asset.image.width, asset.image.height);
				if (aspectRatio > options.maxAspectRatio) {
					return false;
				}
			}

			// For other checks, we need to get the file info
			if (options.minFileSize && Platform.OS === "ios") {
				// On iOS, we can check file size
				try {
					if (asset.image.uri) {
						try {
							const fileInfo = await RNFS.stat(asset.image.uri);
							const sizeInKB = fileInfo.size / 1024;
							if (sizeInKB < options.minFileSize) {
								return false;
							}
							if (options.maxFileSize && sizeInKB > options.maxFileSize) {
								return false;
							}
						} catch (e) {
							// If we can't get file size, process anyway
						}
					}
				} catch (error) {
					// If we can't get file size, process anyway
				}
			}

			return true;
		}
	}

	private async generateAssetHash(assetInfo: any): Promise<string> {
		// IMPORTANT: Don't calculate hash from URI properties
		// This should match the hash calculation in documentProcessor
		// For now, return a unique ID that won't match anything
		// The actual hash will be calculated during document processing
		const uniqueId = `${assetInfo.id}-${assetInfo.creationTime}-${Math.random()}`;
		return CryptoJS.SHA256(uniqueId).toString();
	}

	private async loadProgress() {
		try {
			const savedProgress = await AsyncStorage.getItem(SCAN_PROGRESS_KEY);
			if (savedProgress) {
				const parsed = JSON.parse(savedProgress);
				this.progress = {
					...parsed,
					lastScanDate: parsed.lastScanDate
						? new Date(parsed.lastScanDate)
						: null,
				};
			}
		} catch (error) {
			console.error("Failed to load scan progress:", error);
		}
	}

	private async saveProgress() {
		try {
			await AsyncStorage.setItem(
				SCAN_PROGRESS_KEY,
				JSON.stringify(this.progress),
			);
		} catch (error) {
			console.error("Failed to save scan progress:", error);
		}
	}

	private async loadProcessedHashes() {
		try {
			const saved = await AsyncStorage.getItem(PROCESSED_HASHES_KEY);
			if (saved) {
				this.processedHashes = new Set(JSON.parse(saved));
			}
		} catch (error) {
			console.error("Failed to load processed hashes:", error);
		}
	}

	private async saveProcessedHashes() {
		try {
			await AsyncStorage.setItem(
				PROCESSED_HASHES_KEY,
				JSON.stringify(Array.from(this.processedHashes)),
			);
		} catch (error) {
			console.error("Failed to save processed hashes:", error);
		}
	}

	getProgress(): ScanProgress {
		return { ...this.progress };
	}

	async clearProgress() {
		this.progress = {
			totalImages: 0,
			processedImages: 0,
			lastScanDate: null,
			lastProcessedAssetId: null,
			isScanning: false,
		};
		this.processedHashes.clear();
		this.failedImages.clear();
		this.scanHistory = [];

		await AsyncStorage.removeItem(SCAN_PROGRESS_KEY);
		await AsyncStorage.removeItem(PROCESSED_HASHES_KEY);
		await AsyncStorage.removeItem(FAILED_IMAGES_KEY);
		await AsyncStorage.removeItem(SCAN_HISTORY_KEY);
	}
	
	private async loadFailedImages() {
		try {
			const saved = await AsyncStorage.getItem(FAILED_IMAGES_KEY);
			if (saved) {
				const entries = JSON.parse(saved);
				this.failedImages = new Map(entries);
			}
		} catch (error) {
			console.error("Failed to load failed images:", error);
		}
	}

	private async saveFailedImages() {
		try {
			const entries = Array.from(this.failedImages.entries());
			await AsyncStorage.setItem(FAILED_IMAGES_KEY, JSON.stringify(entries));
		} catch (error) {
			console.error("Failed to save failed images:", error);
		}
	}

	private async loadScanHistory() {
		try {
			const saved = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
			if (saved) {
				this.scanHistory = JSON.parse(saved, (key, value) => {
					if (key === "date" && typeof value === "string") {
						return new Date(value);
					}
					return value;
				});
			}
		} catch (error) {
			console.error("Failed to load scan history:", error);
		}
	}

	private async saveScanHistory() {
		try {
			// Keep only last 50 scan entries
			if (this.scanHistory.length > 50) {
				this.scanHistory = this.scanHistory.slice(-50);
			}
			await AsyncStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(this.scanHistory));
		} catch (error) {
			console.error("Failed to save scan history:", error);
		}
	}

	getScanHistory() {
		return [...this.scanHistory];
	}

	async retryFailedImages(options: ScanOptions = {}) {
		const failedUris = Array.from(this.failedImages.keys());
		if (failedUris.length === 0) {
			console.log("No failed images to retry");
			return;
		}

		console.log(`Retrying ${failedUris.length} failed images`);
		
		// Clear failed images and try processing them again
		const tempFailedImages = new Map(this.failedImages);
		this.failedImages.clear();
		
		for (const uri of failedUris) {
			// Create a minimal asset structure for reprocessing
			const asset = {
				image: { uri },
			};
			
			try {
				await this.processAsset(asset, options);
			} catch (error) {
				// If it fails again, it will be re-added to failedImages
				console.error(`Retry failed for ${uri}:`, error);
			}
		}
		
		await this.saveFailedImages();
	}
	
	getStatistics() {
		const totalScans = this.scanHistory.length;
		const totalImagesScanned = this.scanHistory.reduce((sum, scan) => sum + scan.imagesScanned, 0);
		const totalDocumentsFound = this.scanHistory.reduce((sum, scan) => sum + scan.documentsFound, 0);
		const averageScanDuration = totalScans > 0
			? this.scanHistory.reduce((sum, scan) => sum + scan.duration, 0) / totalScans
			: 0;
		
		return {
			totalScans,
			totalImagesScanned,
			totalDocumentsFound,
			averageScanDuration,
			lastScanDate: this.progress.lastScanDate,
			processedHashes: this.processedHashes.size,
			failedImages: this.failedImages.size,
		};
	}
	
	private startMemoryMonitoring() {
		this.memoryCheckInterval = setInterval(async () => {
			const memoryInfo = await deviceInfo.getMemoryInfo();
			if (memoryInfo.availableMemory < 30 * 1024 * 1024) { // Less than 30MB
				console.log("[GalleryScanner] Critical memory detected, stopping scan");
				this.shouldStop = true;
			}
		}, 5000); // Check every 5 seconds
	}
	
	private stopMemoryMonitoring() {
		if (this.memoryCheckInterval) {
			clearInterval(this.memoryCheckInterval);
			this.memoryCheckInterval = null;
		}
	}
}

export const galleryScanner = new GalleryScanner();
