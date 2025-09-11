// services/gallery/GalleryScanner.ts
// Enhanced Gallery Scanner - Core Implementation

import { ScannerStorage } from "../../storage/MMKVStorage";
import {
	CameraRoll,
	PhotoIdentifier,
} from "@react-native-camera-roll/camera-roll";
import { Platform } from "react-native";
import { BehaviorSubject } from "rxjs";
import { nativeDeviceInfo } from "../../utils/nativeDeviceInfo";
import { nativeMemoryManager } from "../memory/nativeMemoryManager";
import { galleryPermissions } from "../permissions/galleryPermissions";
import { documentValidator } from "../../utils/documentValidator";
import {
	type DocumentResult,
	documentProcessor,
} from "../ai/documentProcessor";
import { documentStorage } from "../database/documentStorage";
import { visualDocumentDetector } from "../ai/visualDocumentDetector";
import {
	improvedFileTracker,
	type FileFingerprint,
	type ScanBatch,
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
	private lastProgressUpdateTime = 0;
	private readonly PROGRESS_UPDATE_THROTTLE = 150;

	// Enhanced tracking
	private currentBatch: ScanBatch | null = null;
	private migrationCompleted = false;
	private currentScanOptions: ScanOptions | null = null;

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
	 * Main scanning method with enhanced implementation
	 */
	async startScan(
		options: ScanOptions = {},
		progressCallback?: (progress: ScanProgress) => void,
	): Promise<void> {
		if (this.isScanning) {
			const scanDuration = Date.now() - this.scanStartTime;
			if (scanDuration > 300000) {
				// 5 minutes timeout
				console.log(
					`[GalleryScanner] Scan stuck for ${scanDuration}ms - forcing reset`,
				);
				this.resetState();
			} else {
				// If processImmediately is explicitly set to true and current scan isn't processing
				// update the current scan to enable processing
				if (options.processImmediately === true && this.currentScanOptions) {
					console.log(
						"[GalleryScanner] Upgrading current scan to enable immediate processing",
					);
					this.currentScanOptions.processImmediately = true;
					// Update the progress callback if provided
					if (progressCallback) {
						this.onProgressCallback = progressCallback;
					}
					return;
				}
				console.log(
					"[GalleryScanner] Scan already in progress - ignoring duplicate call",
				);
				return;
			}
		}

		await this.initializeEnhancedSystem();

		const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
		this.currentScanOptions = mergedOptions; // Store current scan options
		this.onProgressCallback = progressCallback;
		this.isScanning = true;
		this.shouldStop = false;
		this.scanStartTime = Date.now();

		try {
			console.log(
				`[GalleryScanner] Starting ${mergedOptions.type} scan with enhanced system`,
			);

			// Create batch
			this.currentBatch = improvedFileTracker.createBatch(
				mergedOptions.type === "retry" ? "manual" : "periodic",
				mergedOptions.type,
			);

			// Discover changes
			const result = await this.discoverAndProcessChanges(mergedOptions);

			// Update final stats
			const stats = improvedFileTracker.getStats();
			console.log(
				`[GalleryScanner] Final stats - processed: ${result.newFiles + result.skippedFiles + result.failedFiles}, total discovered: ${stats.totalFiles || "unknown"}`,
			);

			this.progress = {
				totalImages:
					result.newFiles +
					result.changedFiles +
					result.skippedFiles +
					result.failedFiles,
				processedImages:
					result.newFiles +
					result.changedFiles +
					result.skippedFiles +
					result.failedFiles,
				lastScanDate: new Date(),
				lastProcessedAssetId: result.lastProcessedUri,
				isScanning: false,
				newFiles: result.newFiles,
				changedFiles: result.changedFiles,
				skippedFiles: result.skippedFiles,
				failedFiles: result.failedFiles,
				batchId: this.currentBatch.id,
			};

			console.log(`[GalleryScanner] Final progress set:`, this.progress);
			this.updateProgressSubject();

			console.log(
				`[GalleryScanner] Enhanced scan complete: ` +
					`${result.newFiles} new, ${result.changedFiles} changed, ` +
					`${result.skippedFiles} skipped files`,
			);
		} catch (error) {
			console.error("[GalleryScanner] Enhanced scan failed:", error);
			throw error;
		} finally {
			this.isScanning = false;
			this.progress.isScanning = false;
			this.currentScanOptions = null; // Clear current scan options
			this.updateProgressSubject();
		}
	}

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

		try {
			console.log(
				"[GalleryScanner] Starting streaming discovery and processing",
			);

			// Fetch all gallery images
			const galleryImages = await this.fetchAllGalleryImages();
			const totalImages = galleryImages.length;

			console.log(`[GalleryScanner] Found ${totalImages} images in gallery`);

			// STREAMING PROCESSING: Process in small batches with immediate results
			const STREAM_BATCH_SIZE = 10; // Process 10 images at a time

			for (
				let i = 0;
				i < totalImages && !this.shouldStop;
				i += STREAM_BATCH_SIZE
			) {
				const batchEnd = Math.min(i + STREAM_BATCH_SIZE, totalImages);
				const batch = galleryImages.slice(i, batchEnd);

				console.log(
					`[GalleryScanner] Processing batch ${i}-${batchEnd} of ${totalImages}`,
				);

				// Process each image in the batch
				for (const asset of batch) {
					const uri = asset.node?.image?.uri || (asset as any).image?.uri;
					if (!uri) continue;

					lastProcessedUri = uri;

					// Update progress for discovery phase
					this.progress = {
						...this.progress,
						totalImages,
						processedImages: i + batch.indexOf(asset),
						phase: "discovering",
						currentFile: uri,
						newFiles,
						changedFiles,
						skippedFiles,
						failedFiles,
					};
					this.updateProgressSubject();

					try {
						// Check if we've seen this image before
						const existingFingerprint =
							await improvedFileTracker.findExistingFingerprint(uri);

						if (!existingFingerprint) {
							// NEW IMAGE: Create fingerprint and process immediately
							console.log(`[GalleryScanner] New image found: ${uri}`);

							// Create fingerprint
							const fingerprint = await improvedFileTracker.createFingerprint(
								uri,
								asset,
							);

							// Check for duplicates
							if (improvedFileTracker.isDuplicate(fingerprint)) {
								console.log(
									`[GalleryScanner] Duplicate detected, skipping: ${uri}`,
								);
								skippedFiles++;
								continue;
							}

							// Add fingerprint to tracker
							await improvedFileTracker.addFingerprint(
								fingerprint,
								this.currentBatch!.id,
							);
							newFiles++;

							// IMMEDIATE PROCESSING if requested (check current options which may have been updated)
							const shouldProcess =
								this.currentScanOptions?.processImmediately ||
								options.processImmediately;
							if (shouldProcess) {
								console.log(
									`[GalleryScanner] Processing new image immediately: ${uri}`,
								);

								// Update UI to show processing
								this.progress = {
									...this.progress,
									totalImages,
									processedImages: i + batch.indexOf(asset),
									phase: "processing",
									currentFile: uri,
									newFiles,
									changedFiles,
									skippedFiles,
									failedFiles,
								};
								this.updateProgressSubject();

								// Process the image with confidence check
								const success =
									await this.processFileWithConfidenceCheck(fingerprint);
								if (!success) {
									failedFiles++;
								}

								// Small delay to allow UI to update
								await new Promise((resolve) => setTimeout(resolve, 10));
							}
						} else if (!existingFingerprint.isProcessed) {
							// UNPROCESSED IMAGE: Process it now
							console.log(`[GalleryScanner] Unprocessed image found: ${uri}`);
							changedFiles++;

							const shouldProcessUnprocessed =
								this.currentScanOptions?.processImmediately ||
								options.processImmediately;
							if (shouldProcessUnprocessed) {
								const success =
									await this.processFileWithConfidenceCheck(
										existingFingerprint,
									);
								if (!success) {
									failedFiles++;
								}
							}
						} else if (
							await improvedFileTracker.hasFileChanged(uri, existingFingerprint)
						) {
							// CHANGED IMAGE: Update fingerprint and reprocess
							console.log(`[GalleryScanner] Changed image found: ${uri}`);

							const fingerprint = await improvedFileTracker.createFingerprint(
								uri,
								asset,
							);
							await improvedFileTracker.addFingerprint(
								fingerprint,
								this.currentBatch!.id,
							);
							changedFiles++;

							const shouldProcessChanged =
								this.currentScanOptions?.processImmediately ||
								options.processImmediately;
							if (shouldProcessChanged) {
								const success =
									await this.processFileWithConfidenceCheck(fingerprint);
								if (!success) {
									failedFiles++;
								}
							}
						} else {
							// Already processed, skip
							skippedFiles++;
						}
					} catch (error) {
						console.error(`[GalleryScanner] Error processing ${uri}:`, error);
						failedFiles++;
					}
				}

				// Memory management between batches
				const memStatus = await nativeMemoryManager.getMemoryStatus();
				if (memStatus.isCriticalMemory) {
					console.log("[GalleryScanner] Memory pressure detected, cleaning up");
					await nativeMemoryManager.emergencyCleanup();
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}

				// Update progress after each batch
				this.progress = {
					...this.progress,
					totalImages,
					processedImages: Math.min(batchEnd, totalImages),
					phase:
						this.currentScanOptions?.processImmediately ||
						options.processImmediately
							? "processing"
							: "discovering",
					currentFile: lastProcessedUri || undefined,
					newFiles,
					changedFiles,
					skippedFiles,
					failedFiles,
				};
				this.updateProgressSubject();
			}

			// Final statistics
			console.log(
				`[GalleryScanner] Streaming complete: ${newFiles} new, ${changedFiles} changed, ` +
					`${skippedFiles} skipped, ${failedFiles} failed`,
			);

			// Update batch stats
			if (this.currentBatch) {
				this.currentBatch.newFiles = newFiles;
				this.currentBatch.changedFiles = changedFiles;
				this.currentBatch.skippedFiles = skippedFiles;
				this.currentBatch.failedFiles = failedFiles;

				await improvedFileTracker.updateBatchStats(this.currentBatch.id, {
					totalTimeMs: Date.now() - this.currentBatch.timestamp,
					successRate: newFiles > 0 ? (newFiles - failedFiles) / newFiles : 0,
				});
			}

			// Final progress update
			this.progress.processedImages = totalImages;
			this.progress.phase = "completed";
			this.progress.newFiles = newFiles;
			this.progress.changedFiles = changedFiles;
			this.progress.skippedFiles = skippedFiles;
			this.progress.failedFiles = failedFiles;
			this.updateProgressSubject();
		} catch (error) {
			console.error("[GalleryScanner] Streaming discovery error:", error);
		}

		return {
			newFiles,
			changedFiles,
			skippedFiles,
			failedFiles,
			lastProcessedUri,
		};
	}

	/**
	 * Process file using fingerprint
	 */
	private async processFileWithFingerprint(
		fingerprint: FileFingerprint,
	): Promise<boolean> {
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
			const result = await documentProcessor.processImage(fingerprint.uri);

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
	): Promise<DocumentResult | null> {
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
		console.log("[GalleryScanner] Stopping scan...");
		this.shouldStop = true;

		this.isScanning = false;
		this.progress.isScanning = false;
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

		// Throttle updates to prevent UI flooding
		if (now - this.lastProgressUpdateTime < this.PROGRESS_UPDATE_THROTTLE) {
			return;
		}

		this.lastProgressUpdateTime = now;

		// Determine scan type based on context
		let scanType: "initial" | "monitoring" | "completed" = "initial";

		if (!this.progress.isScanning && this.progress.processedImages > 0) {
			scanType = "completed";
		} else if (
			this.progress.lastScanDate &&
			Date.now() - this.progress.lastScanDate.getTime() < 3600000
		) {
			// If we've scanned within the last hour, we're monitoring
			scanType = "monitoring";
		}

		const enhancedProgress = {
			...this.progress,
			scanType,
			discoveredNewImages:
				scanType === "monitoring" ? this.progress.newFiles : undefined,
		};

		this.progressSubject.next(enhancedProgress);

		// Also update the store directly with throttling
		if (this.onProgressCallback) {
			this.onProgressCallback(enhancedProgress);
		}
	}

	/**
	 * Legacy method - check if image was processed
	 */
	async isImageProcessed(imageUri: string): Promise<boolean> {
		const fingerprint =
			await improvedFileTracker.findExistingFingerprint(imageUri);
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

// Export singleton instance (maintains API compatibility)
export const galleryScanner = new GalleryScanner();

// Export enhanced components for direct use
export { improvedFileTracker } from "./ImprovedFileTracker";

// Export types for enhanced features
export type { FileFingerprint, ScanBatch } from "./ImprovedFileTracker";
