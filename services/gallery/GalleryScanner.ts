// services/gallery/GalleryScanner.ts
// Enhanced Gallery Scanner - Core Implementation

import { ScannerStorage } from "../../storage/MMKVStorage";
import { progressTracker } from '../progress/ProductionProgressTracker';
import { fixedImageTracker } from './FixedImageTracker';
import { FixedGalleryScanner } from './FixedGalleryScanner';
import {
	CameraRoll,
	PhotoIdentifier,
} from "@react-native-camera-roll/camera-roll";
import { Platform } from "react-native";
import { BehaviorSubject } from "rxjs";
import { galleryPermissions } from "../permissions/galleryPermissions";
import {
	type SimpleProcessedDocument,
	simpleDocumentProcessor,
} from "../ai/SimpleDocumentProcessor";
import { useScannerStore } from "../../stores/scannerStore";

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
	phase?: "discovering" | "processing" | "fingerprinting" | "completed";
	batchId?: string;
	// Add these new fields
	scanType?: "initial" | "monitoring" | "completed";
	discoveredNewImages?: number; // For monitoring phase
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
	private fixedScanner = new FixedGalleryScanner();
	private isScanning = false;
	private shouldStop = false;
	private scanStartTime = 0;
	private progress: ScanProgress = {
		totalImages: 0,
		processedImages: 0,
		lastScanDate: null,
		lastProcessedAssetId: null,
		isScanning: false,
	};

	private onProgressCallback?: (progress: ScanProgress) => void;
	private progressSubject = new BehaviorSubject<ScanProgress>(this.progress);

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
			console.log(
				`[GalleryScanner] Enhanced system ready. Tracking ${stats.totalFiles} files`,
			);

			this.migrationCompleted = true;
		} catch (error) {
			console.error(
				"[GalleryScanner] Failed to initialize enhanced system:",
				error,
			);
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
	 * Quick check for new images without full scan (performance optimization)
	 */
	async quickNewImageCheck(): Promise<number> {
		try {
			// Get only recent images (last 100)
			const photos = await CameraRoll.getPhotos({
				first: 100,
				assetType: "Photos",
			});

			let newCount = 0;
			for (const asset of photos.edges) {
				const uri = asset.node.image.uri;
				if (!uri) continue;

				const exists = await improvedFileTracker.findExistingFingerprint(uri);
				if (!exists) newCount++;
			}

			return newCount;
		} catch (error) {
			console.error("[GalleryScanner] Quick check failed:", error);
			return 0;
		}
	}

	/**
	 * Subscribe to progress updates (legacy compatibility)
	 */
	observeProgress(): BehaviorSubject<ScanProgress> {
		return this.progressSubject;
	}

	/**
	 * Main scanning method using fixed implementation
	 */
	async startScan(
		options: ScanOptions = {},
		progressCallback?: (progress: ScanProgress) => void
	): Promise<void> {
		if (this.isScanning) {
			console.log("[GalleryScanner] Scan already in progress");
			return;
		}

		this.onProgressCallback = progressCallback;
		this.isScanning = true;
		this.shouldStop = false;
		this.scanStartTime = Date.now();

		try {
			// Use the fixed scanner
			await this.fixedScanner.performScan({
				scanNewOnly: options.scanNewOnly || false,
				processImmediately: options.processImmediately !== false,
				batchSize: options.batchSize || 20,
				onProgress: (stats) => {
					// Update progress
					this.progress = {
						totalImages: stats.totalImages,
						processedImages: stats.processedImages,
						isScanning: stats.isScanning,
						lastScanDate: stats.isScanning ? null : new Date(),
						lastProcessedAssetId: stats.currentFile,
						newFiles: stats.newImages,
						changedFiles: stats.changedImages,
						skippedFiles: stats.skippedImages,
						failedFiles: stats.failedImages,
						currentFile: stats.currentFile,
					};
					
					// Notify callbacks
					if (progressCallback) {
						progressCallback(this.progress);
					}
					
					// Update store
					this.updateProgressSubject();
				}
			});
			
			// Update final state
			this.progress.isScanning = false;
			this.progress.lastScanDate = new Date();
			this.updateProgressSubject();

		} catch (error) {
			console.error("[GalleryScanner] Scan failed:", error);
			throw error;
		} finally {
			this.isScanning = false;
			this.progress.isScanning = false;
			this.updateProgressSubject();
		}
	}

	private async discoverAndProcessChanges(options: ScanOptions, galleryImages?: PhotoIdentifier[]): Promise<{
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

		try {
			console.log("[GalleryScanner] Starting streaming discovery and processing");

			// CRITICAL: Save state before starting
			const savedProgress = await ScannerStorage.getObject("scan_resume_state") as any;
			let startIndex = 0;
			
			if (savedProgress && savedProgress.lastProcessedIndex) {
				startIndex = savedProgress.lastProcessedIndex;
				console.log(`[GalleryScanner] Resuming from index ${startIndex}`);
				
				// Restore counts from saved state
				newFiles = savedProgress.newFiles || 0;
				changedFiles = savedProgress.changedFiles || 0;
				skippedFiles = savedProgress.skippedFiles || 0;
				failedFiles = savedProgress.failedFiles || 0;
			}

			// Use provided galleryImages or fetch if not provided
			const images = galleryImages || await this.fetchAllGalleryImages();
			const totalImages = images.length;

			console.log(`[GalleryScanner] Found ${totalImages} images in gallery`);

			// REDUCED BATCH SIZE for memory management
			const STREAM_BATCH_SIZE = 5; // Reduced from 10
			const SAVE_STATE_INTERVAL = 20; // Save state every 20 images
			let processedInBatch = 0;

			for (let i = startIndex; i < totalImages && !this.shouldStop; i += STREAM_BATCH_SIZE) {
				const batchEnd = Math.min(i + STREAM_BATCH_SIZE, totalImages);
				const batch = images.slice(i, batchEnd);

				console.log(`[GalleryScanner] Processing batch ${i}-${batchEnd} of ${totalImages}`);

				// Check memory before processing batch
				const memStatus = await nativeMemoryManager.getMemoryStatus();
				if (memStatus.isCriticalMemory) {
					console.warn("[GalleryScanner] Critical memory - emergency cleanup");
					await nativeMemoryManager.emergencyCleanup();
					
					// Force garbage collection if available
					if (global.gc) {
						global.gc();
					}
					
					// Wait for memory to free up
					await new Promise(resolve => setTimeout(resolve, 2000));
					
					// Check again after cleanup
					const memStatusAfter = await nativeMemoryManager.getMemoryStatus();
					if (memStatusAfter.isCriticalMemory) {
						console.error("[GalleryScanner] Still critical memory after cleanup - pausing scan");
						
						// Save state before stopping
						await this.saveResumeState({
							lastProcessedIndex: i,
							newFiles,
							changedFiles,
							skippedFiles,
							failedFiles,
							lastProcessedUri,
							totalImages,
							timestamp: Date.now()
						});
						
						throw new Error("Critical memory pressure - scan paused");
					}
				}

				// Process each image in the batch
				for (const asset of batch) {
					const uri = asset.node?.image?.uri || (asset as any).image?.uri;
					if (!uri) continue;

					lastProcessedUri = uri;
					processedInBatch++;

					// Update progress immediately for each image
					this.progress = {
						...this.progress,
						totalImages,
						processedImages: i + batch.indexOf(asset) + 1,
						phase: options.processImmediately ? "processing" : "discovering",
						currentFile: uri,
						newFiles,
						changedFiles,
						skippedFiles,
						failedFiles,
					};
					
					// Immediate update - no throttling
					this.updateProgressSubject();

					try {
						const existingFingerprint = await improvedFileTracker.findExistingFingerprint(uri);

						if (!existingFingerprint) {
							console.log(`[GalleryScanner] New image found: ${uri}`);
							const fingerprint = await improvedFileTracker.createFingerprint(uri, asset);
							
							if (improvedFileTracker.isDuplicate(fingerprint)) {
								skippedFiles++;
								continue;
							}

							await improvedFileTracker.addFingerprint(fingerprint, this.currentBatch!.id);
							newFiles++;

							if (options.processImmediately) {
								const success = await this.processFileWithConfidenceCheck(fingerprint);
								if (!success) failedFiles++;
							}
						} else if (!existingFingerprint.isProcessed) {
							changedFiles++;
							if (options.processImmediately) {
								const success = await this.processFileWithConfidenceCheck(existingFingerprint);
								if (!success) failedFiles++;
							}
						} else {
							skippedFiles++;
						}
					} catch (error) {
						console.error(`[GalleryScanner] Error processing ${uri}:`, error);
						failedFiles++;
					}
				}

				// Save resume state periodically
				if (processedInBatch >= SAVE_STATE_INTERVAL) {
					await this.saveResumeState({
						lastProcessedIndex: batchEnd,
						newFiles,
						changedFiles,
						skippedFiles,
						failedFiles,
						lastProcessedUri,
						totalImages,
						timestamp: Date.now()
					});
					processedInBatch = 0;
				}

				// Add delay between batches to prevent overheating
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			// Clear resume state on successful completion
			await ScannerStorage.removeItem("scan_resume_state");
			
			console.log(
				`[GalleryScanner] Streaming complete: ${newFiles} new, ${changedFiles} changed, ` +
				`${skippedFiles} skipped, ${failedFiles} failed`
			);

		} catch (error) {
			console.error("[GalleryScanner] Streaming discovery error:", error);
			
			// Save state on error
			await this.saveResumeState({
				lastProcessedIndex: this.progress.processedImages,
				newFiles,
				changedFiles,
				skippedFiles,
				failedFiles,
				lastProcessedUri,
				totalImages: this.progress.totalImages,
				timestamp: Date.now(),
				error: (error as Error).message
			});
			
			throw error;
		}

		return { newFiles, changedFiles, skippedFiles, failedFiles, lastProcessedUri };
	}

	// Add this new method for saving resume state
	private async saveResumeState(state: {
		lastProcessedIndex: number;
		newFiles: number;
		changedFiles: number;
		skippedFiles: number;
		failedFiles: number;
		lastProcessedUri: string | null;
		totalImages: number;
		timestamp: number;
		error?: string;
	}): Promise<void> {
		try {
			await ScannerStorage.setObject("scan_resume_state", state);
			console.log("[GalleryScanner] Resume state saved");
		} catch (error) {
			console.error("[GalleryScanner] Failed to save resume state:", error);
		}
	}

	private async getDynamicBatchSize(): Promise<number> {
		const memStatus = await nativeMemoryManager.getMemoryStatus();
		
		if (memStatus.isCriticalMemory) {
			return 2; // Minimal batch size
		} else if (memStatus.isLowMemory) {
			return 3; // Small batch size
		} else if (memStatus.availableDeviceMemory < 500 * 1024 * 1024) { // Less than 500MB
			return 5; // Conservative batch size
		} else {
			return 10; // Normal batch size
		}
	}

	/**
	 * Process file using fingerprint
	 */
	private async processFileWithFingerprint(
		fingerprint: FileFingerprint,
	): Promise<boolean> {
		try {
			// Process with document processor
			const result = await simpleDocumentProcessor.process(fingerprint.uri);
			
			if (!result) {
				console.log(`[GalleryScanner] Document processing failed or rejected for ${fingerprint.uri}`);
				return false;
			}

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
				this.currentBatch!.id,
			);

			return true;
		} catch (error) {
			console.error(
				`[GalleryScanner] Failed to process ${fingerprint.uri}:`,
				error,
			);

			// Mark as failed
			await improvedFileTracker.markAsProcessed(
				improvedFileTracker.getFingerprintId(fingerprint),
				{
					success: false,
					error: (error as Error).message,
					processingTimeMs: 0,
				},
				this.currentBatch!.id,
			);

			return false;
		}
	}

	/**
	 * Process file with confidence check to avoid processing non-document images
	 */
	private async processFileWithConfidenceCheck(
		fingerprint: FileFingerprint,
	): Promise<boolean> {
		try {
			// First check if image is likely a document using visual detection
			const visualFeatures = await visualDocumentDetector.detectDocument(
				fingerprint.uri,
			);
			const confidenceScore = visualFeatures.overallScore;

			console.log(
				`[GalleryScanner] Document confidence: ${(confidenceScore * 100).toFixed(1)}% for ${fingerprint.uri}`,
			);

			// Skip processing if confidence is too low (not a document)
			if (confidenceScore < 0.5) {
				console.log(
					`[GalleryScanner] Low confidence (${(confidenceScore * 100).toFixed(1)}%) - skipping non-document image`,
				);

				// Mark as processed but with low confidence flag
				await improvedFileTracker.markAsProcessed(
					improvedFileTracker.getFingerprintId(fingerprint),
					{
						success: false,
						error: "Low confidence - not a document",
						processingTimeMs: 0,
					},
					this.currentBatch!.id,
				);

				return false;
			}

			// High confidence - proceed with OCR processing
			console.log(
				`[GalleryScanner] High confidence (${(confidenceScore * 100).toFixed(1)}%) - processing document`,
			);

			// Process with document processor
			const result = await simpleDocumentProcessor.process(fingerprint.uri);
			
			if (!result) {
				console.log(`[GalleryScanner] Document processing failed or rejected for ${fingerprint.uri}`);
				await improvedFileTracker.markAsProcessed(
					improvedFileTracker.getFingerprintId(fingerprint),
					{
						success: false,
						error: "Document processing failed",
						processingTimeMs: 0,
					},
					this.currentBatch!.id,
				);
				return false;
			}

			// Additional confidence check from OCR result
			if (result.confidence < 0.5) {
				console.log(
					`[GalleryScanner] OCR confidence too low (${(result.confidence * 100).toFixed(1)}%) - discarding`,
				);

				await improvedFileTracker.markAsProcessed(
					improvedFileTracker.getFingerprintId(fingerprint),
					{
						success: false,
						error: "OCR confidence too low",
						processingTimeMs: 0,
					},
					this.currentBatch!.id,
				);

				return false;
			}

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
				this.currentBatch!.id,
			);

			return true;
		} catch (error) {
			console.error(
				`[GalleryScanner] Failed to process ${fingerprint.uri}:`,
				error,
			);

			// Mark as failed
			await improvedFileTracker.markAsProcessed(
				improvedFileTracker.getFingerprintId(fingerprint),
				{
					success: false,
					error: (error as Error).message,
					processingTimeMs: 0,
				},
				this.currentBatch!.id,
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
			after = photos.page_info.has_next_page
				? photos.page_info.end_cursor
				: undefined;
		} while (after);

		// Fix: Correct property access
		allAssets.sort((a, b) => {
			const timestampA = a.node.timestamp || 0;
			const timestampB = b.node.timestamp || 0;
			return timestampA - timestampB;
			// return timestampB - timestampA;
		});

		return allAssets;
	}

	/**
	 * Smart filter check
	 */
	private async shouldProcessImage(asset: PhotoIdentifier): Promise<boolean> {
		try {
			// Handle both structures
			const node = asset.node || asset;
			const image = node.image || node;

			const assetInfo: AssetInfo = {
				uri: image.uri,
				filename: image.filename || "",
				width: image.width,
				height: image.height,
				fileSize: 0,
				timestamp: node.timestamp,
				mimeType: node.type || "image/jpeg",
			};

			const result = await smartFilter.shouldProcess(assetInfo);
			return result.shouldProcess;
		} catch (error) {
			return true;
		}
	}

	/**
	 * Process single image (enhanced implementation)
	 */
	async processImage(
		imageUri: string,
		options?: { force?: boolean },
	): Promise<SimpleProcessedDocument | null> {
		try {
			console.log(`[GalleryScanner] Processing single image: ${imageUri}`);

			// Check if already processed (unless forced)
			if (!options?.force) {
				const existingFingerprint =
					await improvedFileTracker.findExistingFingerprint(imageUri);
				if (existingFingerprint?.isProcessed) {
					console.log("[GalleryScanner] Image already processed, skipping");
					return null;
				}
			}

			// Create or update fingerprint
			let fingerprint =
				await improvedFileTracker.findExistingFingerprint(imageUri);
			if (!fingerprint) {
				fingerprint = await improvedFileTracker.createFingerprint(imageUri);
				await improvedFileTracker.addFingerprint(
					fingerprint,
					this.currentBatch?.id || "manual_" + Date.now(),
				);
			}

			// Process with document processor
			const result = await simpleDocumentProcessor.process(imageUri);
			
			if (!result) {
				console.log(`[GalleryScanner] Document processing failed or rejected for ${imageUri}`);
				return null;
			}

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
				this.currentBatch?.id || "manual_" + Date.now(),
			);

			console.log(
				`[GalleryScanner] Single image processed successfully: ${document.id}`,
			);
			return result;
		} catch (error) {
			console.error(
				`[GalleryScanner] Failed to process image ${imageUri}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Stop scanning
	 */
	stopScan(): void {
		this.fixedScanner.stopScan();
		this.isScanning = false;
		this.progress.isScanning = false;
		progressTracker.complete();
		this.updateProgressSubject();
	}

	/**
	 * Force reset scanner state (for debugging stuck states)
	 */
	resetState(): void {
		console.log("[GalleryScanner] Force resetting scanner state");
		this.isScanning = false;
		this.shouldStop = false;
		this.progress.isScanning = false;
		this.currentBatch = null;
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
		return this.fixedScanner.getStats();
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
		// Update production tracker immediately
		if (this.progress.isScanning) {
			progressTracker.update(
				this.progress.processedImages,
				this.progress.currentFile
			);
		}
		
		// Keep compatibility with existing subscribers
		this.progressSubject.next(this.progress);
		
		if (this.onProgressCallback) {
			this.onProgressCallback(this.progress);
		}
		
		// Update store for other UI components
		const store = useScannerStore.getState();
		if (store.setImmediateScanProgress) {
			store.setImmediateScanProgress(this.progress);
		} else {
			store.setScanProgress(this.progress);
		}
	}

	/**
	 * Check if image was already processed
	 */
	async isImageProcessed(imageUri: string): Promise<boolean> {
		const record = await fixedImageTracker.findExistingRecord(imageUri);
		return record?.isProcessed === true;
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
			removeOrphans: true,
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

// Export singleton instance
export const galleryScanner = new GalleryScanner();
