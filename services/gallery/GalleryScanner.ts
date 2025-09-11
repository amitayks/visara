// services/gallery/GalleryScanner.ts
// Enhanced Gallery Scanner - Core Implementation

import { ScannerStorage } from "../../storage/MMKVStorage";
import { CameraRoll, PhotoIdentifier } from "@react-native-camera-roll/camera-roll";
import { Platform } from "react-native";
import { BehaviorSubject } from "rxjs";
import { nativeDeviceInfo } from "../../utils/nativeDeviceInfo";
import { nativeMemoryManager } from "../memory/nativeMemoryManager";
import { galleryPermissions } from "../permissions/galleryPermissions";
import { documentValidator } from "../../utils/documentValidator";
import { type DocumentResult, documentProcessor } from "../ai/documentProcessor";
import { documentStorage } from "../database/documentStorage";
import { 
	improvedFileTracker, 
	type FileFingerprint, 
	type ScanBatch 
} from "./ImprovedFileTracker";
// Enhanced scanner components are integrated directly
import { 
	type AssetInfo,
	type SmartFilterOptions,
	smartFilter,
} from "./smartFilter";

// ===============================
// CORE GALLERY SCANNER
// ===============================

export interface ScanProgress {
	totalImages: number;
	processedImages: number;
	lastScanDate: Date | null;
	lastProcessedAssetId: string | null;
	isScanning: boolean;
	// Enhanced fields
	newFiles?: number;
	changedFiles?: number;
	skippedFiles?: number;
	failedFiles?: number;
	currentFile?: string;
	phase?: string;
	batchId?: string;
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
	// Enhanced options
	type?: "full" | "incremental" | "new_only" | "retry";
	processImmediately?: boolean;
	maxConcurrent?: number;
}

const DEFAULT_OPTIONS: ScanOptions = {
	batchSize: 50, // Increased for better performance
	minFileSize: 60, // 60KB minimum
	maxFileSize: 50 * 1024, // 50MB maximum
	maxAspectRatio: 3, // Skip panoramas
	wifiOnly: false,
	batterySaver: true,
	smartFilterEnabled: true,
	scanNewOnly: false,
	retryFailedImages: true,
	maxRetries: 3,
	type: "incremental",
	processImmediately: true,
	maxConcurrent: 3,
};

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
	
	private onProgressCallback?: (progress: ScanProgress) => void;
	private progressSubject = new BehaviorSubject<ScanProgress>(this.progress);
	private lastProgressUpdateTime = 0;
	private readonly PROGRESS_UPDATE_THROTTLE = 150;

	// Enhanced tracking
	private currentBatch: ScanBatch | null = null;
	private migrationCompleted = false;

	constructor() {
		this.initializeEnhancedSystem();
	}

	/**
	 * Initialize enhanced system and migrate old data
	 */
	private async initializeEnhancedSystem(): Promise<void> {
		if (this.migrationCompleted) return;

		try {
			console.log("[GalleryScanner] Initializing enhanced tracking system");
			
			// Auto-migration is handled by ImprovedFileTracker constructor
			const stats = improvedFileTracker.getStats();
			console.log(`[GalleryScanner] Enhanced system ready. Tracking ${stats.totalFiles} files`);
			
			this.migrationCompleted = true;
		} catch (error) {
			console.error("[GalleryScanner] Failed to initialize enhanced system:", error);
		}
	}

	async requestPermissions(): Promise<boolean> {
		return await galleryPermissions.ensurePermission();
	}

	/**
	 * Check if permissions are granted (legacy compatibility)
	 */
	async hasPermissions(): Promise<boolean> {
		return await galleryPermissions.ensurePermission();
	}

	/**
	 * Subscribe to progress updates (legacy compatibility)
	 */
	observeProgress(): BehaviorSubject<ScanProgress> {
		return this.progressSubject;
	}

	/**
	 * Main scanning method with enhanced implementation
	 */
	async startScan(
		options: ScanOptions = {},
		progressCallback?: (progress: ScanProgress) => void,
	): Promise<void> {
		if (this.isScanning) {
			console.log("[GalleryScanner] Scan already in progress");
			return;
		}

		await this.initializeEnhancedSystem();

		const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
		this.onProgressCallback = progressCallback;
		this.isScanning = true;
		this.shouldStop = false;

		try {
			console.log(`[GalleryScanner] Starting ${mergedOptions.type} scan with enhanced system`);

			// Create batch
			this.currentBatch = improvedFileTracker.createBatch(
				mergedOptions.type === "retry" ? "manual" : "periodic",
				mergedOptions.type,
			);

			// Discover changes
			const result = await this.discoverAndProcessChanges(mergedOptions);
			
			// Update final stats
			const stats = improvedFileTracker.getStats();
			this.progress = {
				totalImages: stats.totalFiles,
				processedImages: stats.processedFiles,
				lastScanDate: new Date(),
				lastProcessedAssetId: result.lastProcessedUri,
				isScanning: false,
				newFiles: result.newFiles,
				changedFiles: result.changedFiles,
				skippedFiles: result.skippedFiles,
				failedFiles: result.failedFiles,
				batchId: this.currentBatch.id,
			};

			this.updateProgressSubject();

			console.log(
				`[GalleryScanner] Enhanced scan complete: ` +
				`${result.newFiles} new, ${result.changedFiles} changed, ` +
				`${result.skippedFiles} skipped files`
			);

		} catch (error) {
			console.error("[GalleryScanner] Enhanced scan failed:", error);
			throw error;
		} finally {
			this.isScanning = false;
			this.progress.isScanning = false;
			this.updateProgressSubject();
		}
	}

	/**
	 * Discover and process changes using enhanced file tracking
	 */
	private async discoverAndProcessChanges(options: ScanOptions): Promise<{
		newFiles: number;
		changedFiles: number;
		skippedFiles: number;
		failedFiles: number;
		lastProcessedUri: string | null;
	}> {
		let newFiles = 0;
		let changedFiles = 0;
		let skippedFiles = 0;
		let failedFiles = 0;
		let lastProcessedUri: string | null = null;

		// Fetch gallery images
		const allAssets = await this.fetchAllGalleryImages();
		console.log(`[GalleryScanner] Found ${allAssets.length} total images in gallery`);

		// Update progress
		this.progress.totalImages = allAssets.length;
		this.progress.phase = "discovering";
		this.updateProgressSubject();

		// Process in chunks
		const chunkSize = options.batchSize || 50;
		
		for (let i = 0; i < allAssets.length && !this.shouldStop; i += chunkSize) {
			const chunk = allAssets.slice(i, Math.min(i + chunkSize, allAssets.length));

			for (const asset of chunk) {
				if (this.shouldStop) break;

				const uri = asset.node.image.uri;
				this.progress.currentFile = uri;
				this.updateProgressSubject();

				try {
					// Apply smart filter
					if (options.smartFilterEnabled) {
						const shouldProcess = await this.shouldProcessImage(asset);
						if (!shouldProcess) {
							skippedFiles++;
							continue;
						}
					}

					// Check if we've seen this file before
					const existingFingerprint = await improvedFileTracker.findExistingFingerprint(uri);

					if (!existingFingerprint) {
						// New file
						const fingerprint = await improvedFileTracker.createFingerprint(uri, asset);
						await improvedFileTracker.addFingerprint(fingerprint, this.currentBatch!.id);
						
						if (options.processImmediately) {
							const success = await this.processFileWithFingerprint(fingerprint);
							if (success) {
								lastProcessedUri = uri;
							} else {
								failedFiles++;
							}
						}
						newFiles++;

					} else if (options.retryFailedImages && existingFingerprint.processingStatus === "failed") {
						// Retry failed
						if (options.processImmediately) {
							const success = await this.processFileWithFingerprint(existingFingerprint);
							if (success) {
								lastProcessedUri = uri;
								changedFiles++;
							} else {
								failedFiles++;
							}
						}
					}

				} catch (error) {
					console.error(`[GalleryScanner] Error processing ${uri}:`, error);
					failedFiles++;
				}

				// Update progress
				this.progress.processedImages = i + 1;
				this.progress.newFiles = newFiles;
				this.progress.changedFiles = changedFiles;
				this.progress.skippedFiles = skippedFiles;
				this.progress.failedFiles = failedFiles;
				this.onProgressCallback?.(this.progress);
			}

			// Memory management
			const memStatus = await nativeMemoryManager.getMemoryStatus();
			if (memStatus.isCriticalMemory) {
				console.warn("[GalleryScanner] Memory pressure detected, pausing");
				await nativeMemoryManager.emergencyCleanup();
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		}

		return { newFiles, changedFiles, skippedFiles, failedFiles, lastProcessedUri };
	}

	/**
	 * Process file using fingerprint
	 */
	private async processFileWithFingerprint(fingerprint: FileFingerprint): Promise<boolean> {
		try {
			// Process with document processor
			const result = await documentProcessor.processImage(fingerprint.uri);

			// Validate and sanitize
			const sanitizedResult = documentValidator.validateAndSanitize(result);

			// Save to database
			const document = await documentStorage.saveDocument(sanitizedResult);

			// Mark as processed
			await improvedFileTracker.markAsProcessed(
				improvedFileTracker.getFingerprintId(fingerprint),
				{
					success: true,
					documentId: document.id,
					documentHash: result.imageHash,
					processingTimeMs: 0,
				},
				this.currentBatch!.id
			);

			return true;
		} catch (error) {
			console.error(`[GalleryScanner] Failed to process ${fingerprint.uri}:`, error);
			
			// Mark as failed
			await improvedFileTracker.markAsProcessed(
				improvedFileTracker.getFingerprintId(fingerprint),
				{
					success: false,
					error: (error as Error).message,
					processingTimeMs: 0,
				},
				this.currentBatch!.id
			);

			return false;
		}
	}

	/**
	 * Fetch all gallery images efficiently
	 */
	private async fetchAllGalleryImages(): Promise<PhotoIdentifier[]> {
		const allAssets: PhotoIdentifier[] = [];
		let after: string | undefined;

		do {
			const photos = await CameraRoll.getPhotos({
				first: 1000,
				assetType: "Photos",
				after,
			});

			allAssets.push(...photos.edges);
			after = photos.page_info.has_next_page ? photos.page_info.end_cursor : undefined;
		} while (after);

		// Sort by timestamp (oldest first)
		allAssets.sort((a, b) => (a.node.timestamp || 0) - (b.node.timestamp || 0));
		return allAssets;
	}

	/**
	 * Smart filter check
	 */
	private async shouldProcessImage(asset: PhotoIdentifier): Promise<boolean> {
		try {
			const assetInfo: AssetInfo = {
				uri: asset.node.image.uri,
				filename: asset.node.image.filename || "",
				width: asset.node.image.width,
				height: asset.node.image.height,
				fileSize: 0,
				timestamp: asset.node.timestamp,
				mimeType: asset.node.type || "image/jpeg",
			};

			const result = await smartFilter.shouldProcess(assetInfo);
			return result.shouldProcess;
		} catch (error) {
			return true; // Process if filter fails
		}
	}

	/**
	 * Process single image (enhanced implementation)
	 */
	async processImage(imageUri: string, options?: { force?: boolean }): Promise<DocumentResult | null> {
		try {
			console.log(`[GalleryScanner] Processing single image: ${imageUri}`);
			
			// Check if already processed (unless forced)
			if (!options?.force) {
				const existingFingerprint = await improvedFileTracker.findExistingFingerprint(imageUri);
				if (existingFingerprint?.isProcessed) {
					console.log("[GalleryScanner] Image already processed, skipping");
					return null;
				}
			}

			// Create or update fingerprint
			let fingerprint = await improvedFileTracker.findExistingFingerprint(imageUri);
			if (!fingerprint) {
				fingerprint = await improvedFileTracker.createFingerprint(imageUri);
				await improvedFileTracker.addFingerprint(
					fingerprint, 
					this.currentBatch?.id || "manual_" + Date.now()
				);
			}

			// Process with document processor
			const result = await documentProcessor.processImage(imageUri);

			// Validate and sanitize
			const sanitizedResult = documentValidator.validateAndSanitize(result);

			// Save to database
			const document = await documentStorage.saveDocument(sanitizedResult);

			// Mark as processed
			await improvedFileTracker.markAsProcessed(
				improvedFileTracker.getFingerprintId(fingerprint),
				{
					success: true,
					documentId: document.id,
					documentHash: result.imageHash,
					processingTimeMs: 0,
				},
				this.currentBatch?.id || "manual_" + Date.now()
			);

			console.log(`[GalleryScanner] Single image processed successfully: ${document.id}`);
			return result;

		} catch (error) {
			console.error(`[GalleryScanner] Failed to process image ${imageUri}:`, error);
			return null;
		}
	}

	/**
	 * Stop scanning
	 */
	stopScan(): void {
		console.log("[GalleryScanner] Stopping scan...");
		this.shouldStop = true;
		
		this.isScanning = false;
		this.progress.isScanning = false;
		this.updateProgressSubject();
	}

	/**
	 * Get current progress
	 */
	getProgress(): ScanProgress {
		return { ...this.progress };
	}

	/**
	 * Subscribe to progress updates
	 */
	subscribeToProgress(callback: (progress: ScanProgress) => void): () => void {
		const subscription = this.progressSubject.subscribe(callback);
		return () => subscription.unsubscribe();
	}

	/**
	 * Get enhanced statistics
	 */
	getStats() {
		const enhancedStats = improvedFileTracker.getStats();
		return {
			// Legacy format
			totalImages: enhancedStats.totalFiles,
			processedImages: enhancedStats.processedFiles,
			lastScanDate: this.progress.lastScanDate,
			// Enhanced fields
			...enhancedStats,
			currentBatch: this.currentBatch,
		};
	}

	/**
	 * Get detailed batch information
	 */
	getBatchHistory(limit: number = 10) {
		const stats = improvedFileTracker.getStats();
		return stats.recentBatches?.slice(0, limit) || [];
	}

	/**
	 * Cleanup old tracking data
	 */
	async cleanup(options?: {
		daysToKeep?: number;
		keepFailed?: boolean;
		removeOrphans?: boolean;
	}): Promise<void> {
		await improvedFileTracker.cleanup(options);
	}

	/**
	 * Force rescan of specific files
	 */
	async rescanFiles(uris: string[]): Promise<void> {
		console.log(`[GalleryScanner] Rescanning ${uris.length} files`);
		
		// Process specific files
		for (const uri of uris) {
			try {
				await this.processImage(uri, { force: true });
			} catch (error) {
				console.error(`[GalleryScanner] Failed to rescan ${uri}:`, error);
			}
		}
	}

	/**
	 * Get memory status and suggestions
	 */
	async getMemoryStatus() {
		return await nativeMemoryManager.getMemoryStatus();
	}

	/**
	 * Update progress subject with throttling
	 */
	private updateProgressSubject(): void {
		const now = Date.now();
		if (now - this.lastProgressUpdateTime >= this.PROGRESS_UPDATE_THROTTLE) {
			this.progressSubject.next({ ...this.progress });
			this.lastProgressUpdateTime = now;
		}
	}

	/**
	 * Legacy method - check if image was processed
	 */
	async isImageProcessed(imageUri: string): Promise<boolean> {
		const fingerprint = await improvedFileTracker.findExistingFingerprint(imageUri);
		return fingerprint?.isProcessed === true;
	}

	/**
	 * Legacy method - get processed count
	 */
	getProcessedCount(): number {
		const stats = improvedFileTracker.getStats();
		return stats.processedFiles;
	}

	/**
	 * Legacy method - clear processed data
	 */
	async clearProcessedData(): Promise<void> {
		await improvedFileTracker.cleanup({ 
			daysToKeep: 0, 
			removeOrphans: true 
		});
		
		this.progress = {
			totalImages: 0,
			processedImages: 0,
			lastScanDate: null,
			lastProcessedAssetId: null,
			isScanning: false,
		};
		this.updateProgressSubject();
	}
}

// Export singleton instance (maintains API compatibility)
export const galleryScanner = new GalleryScanner();

// Export enhanced components for direct use
export { improvedFileTracker } from "./ImprovedFileTracker";

// Export types for enhanced features
export type { FileFingerprint, ScanBatch } from "./ImprovedFileTracker";