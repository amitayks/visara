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
				console.log(
					"[GalleryScanner] Scan already in progress - ignoring duplicate call",
				);
				return;
			}
		}

		await this.initializeEnhancedSystem();

		const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
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
				"[GalleryScanner] Starting efficient single-pass image discovery",
			);

			// Fetch all gallery images
			const galleryImages = await this.fetchAllGalleryImages();
			const totalImages = galleryImages.length;

			console.log(
				`[GalleryScanner] Found ${totalImages} images - starting single-loop processing`,
			);

			// Set initial progress immediately
			this.progress.totalImages = totalImages;
			this.progress.processedImages = 0;
			this.progress.phase = "discovering";
			this.updateProgressSubject();

			const progressUpdateInterval = Math.max(1, Math.floor(totalImages / 50)); // Update every 2%

			// Single efficient loop - no nested loops!
			for (let i = 0; i < totalImages && !this.shouldStop; i++) {
				const asset = galleryImages[i];
				const uri = asset.node.image.uri;

				if (!uri) {
					failedFiles++;
					continue;
				}

				lastProcessedUri = uri;

				try {
					// Check if file already exists with timeout
					const existingFingerprint = await Promise.race([
						improvedFileTracker.findExistingFingerprint(uri),
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error("Lookup timeout")), 5000),
						),
					]);

					if (!existingFingerprint) {
						// New file detected - use proper createFingerprint
						newFiles++;
						console.log(
							`[GalleryScanner] New: ${uri.substring(uri.lastIndexOf("/") + 1)} (${newFiles})`,
						);

						try {
							// Create proper fingerprint with timeout
							const fingerprint = await Promise.race([
								improvedFileTracker.createFingerprint(uri, asset),
								// new Promise((_, reject) => setTimeout(() => reject(new Error('Fingerprint timeout')), 8000))
							]);

							// Check for duplicates before adding
							if (!improvedFileTracker.isDuplicate(fingerprint)) {
								await improvedFileTracker.addFingerprint(
									fingerprint,
									this.currentBatch!.id,
								);
							} else {
								skippedFiles++;
								newFiles--; // Don't count duplicates as new
							}
						} catch (fingerprintError) {
							console.error(
								`[GalleryScanner] Fingerprint error for ${uri}:`,
								fingerprintError,
							);
							failedFiles++;
							newFiles--; // Don't count failed as new
						}
					} else if (!(existingFingerprint as FileFingerprint).isProcessed) {
						// Unprocessed existing file
						changedFiles++;
					} else {
						// Already processed
						skippedFiles++;
					}
				} catch (error) {
					console.error(`[GalleryScanner] Error processing ${uri}:`, error);
					failedFiles++;
				}

				// Update progress efficiently - every 2% or significant milestones
				const shouldUpdateProgress =
					i % progressUpdateInterval === 0 ||
					i === totalImages - 1 ||
					newFiles % 10 === 0; // Update when we find every 10 new files

				if (shouldUpdateProgress) {
					this.progress.processedImages = i + 1;
					this.progress.currentFile = uri;
					this.progress.newFiles = newFiles;
					this.progress.changedFiles = changedFiles;
					this.progress.skippedFiles = skippedFiles;
					this.progress.failedFiles = failedFiles;
					this.updateProgressSubject();

					const progressPercent = Math.round(((i + 1) / totalImages) * 100);
					console.log(
						`[GalleryScanner] Progress: ${i + 1}/${totalImages} (${progressPercent}%) - ${newFiles} new, ${skippedFiles} skipped`,
					);
				}

				// Memory pressure check every 100 images to prevent endless loops
				if (i % 100 === 0 && i > 0) {
					try {
						const memStatus = await Promise.race([
							nativeMemoryManager.getMemoryStatus(),
							new Promise((_, reject) =>
								setTimeout(
									() => reject(new Error("Memory check timeout")),
									2000,
								),
							),
						]);

						if ((memStatus as any)?.isCriticalMemory) {
							console.log(
								"[GalleryScanner] Memory pressure - performing cleanup",
							);
							await nativeMemoryManager.emergencyCleanup();
							await new Promise((resolve) => setTimeout(resolve, 500));
						}
					} catch (memError) {
						console.warn("[GalleryScanner] Memory check failed:", memError);
					}
				}
			}

			console.log(`[GalleryScanner] Single-pass discovery complete!`);
			console.log(
				`[GalleryScanner] Results: ${newFiles} new, ${changedFiles} changed, ${skippedFiles} skipped, ${failedFiles} failed`,
			);

			// Final progress update
			this.progress.processedImages = totalImages;
			this.progress.phase = "completed";
			this.progress.newFiles = newFiles;
			this.progress.changedFiles = changedFiles;
			this.progress.skippedFiles = skippedFiles;
			this.progress.failedFiles = failedFiles;
			this.updateProgressSubject();
		} catch (error) {
			console.error("[GalleryScanner] Discovery error:", error);
			throw error;
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
		if (now - this.lastProgressUpdateTime >= this.PROGRESS_UPDATE_THROTTLE) {
			this.progressSubject.next({ ...this.progress });
			this.lastProgressUpdateTime = now;
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
