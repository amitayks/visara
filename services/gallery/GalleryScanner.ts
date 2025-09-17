// services/gallery/GalleryScanner.ts
// Completely rebuilt, simplified gallery scanner

import { BehaviorSubject } from "rxjs";
import { Platform } from "react-native";
import {
	CameraRoll,
	PhotoIdentifier,
} from "@react-native-camera-roll/camera-roll";
import { fixedImageTracker, ImageRecord } from "./FixedImageTracker";
import { progressTracker } from "../progress/ProductionProgressTracker";
import { simpleDocumentProcessor } from "../ai/SimpleDocumentProcessor";
import { documentStorage } from "../database/documentStorage";
import { documentValidator } from "../../utils/documentValidator";
import { galleryPermissions } from "../permissions/galleryPermissions";
import { nativeMemoryManager } from "../memory/nativeMemoryManager";
import { useScannerStore } from "../../stores/scannerStore";
import { ScannerStorage } from "../../storage/MMKVStorage";

// ===============================
// TYPES
// ===============================

export interface ScanProgress {
	totalImages: number;
	processedImages: number;
	newFiles: number;
	changedFiles: number;
	skippedFiles: number;
	failedFiles: number;
	currentFile?: string;
	isScanning: boolean;
	lastScanDate: Date | null;
	lastProcessedAssetId: string | null;
	phase?: "discovering" | "processing" | "completed";
	scanType?: "initial" | "monitoring" | "completed";
}

export interface ScanOptions {
	scanNewOnly?: boolean;
	processImmediately?: boolean;
	batchSize?: number;
	maxRetries?: number;
	wifiOnly?: boolean;
	batterySaver?: boolean;
}

// ===============================
// MAIN SCANNER CLASS
// ===============================

export class GalleryScanner {
	// State
	private isScanning = false;
	private shouldStop = false;
	private scanStartTime = 0;

	// Progress tracking
	private progress: ScanProgress = {
		totalImages: 0,
		processedImages: 0,
		newFiles: 0,
		changedFiles: 0,
		skippedFiles: 0,
		failedFiles: 0,
		currentFile: undefined,
		isScanning: false,
		lastScanDate: null,
		lastProcessedAssetId: null,
	};

	// Observable for external listeners
	private progressSubject = new BehaviorSubject<ScanProgress>(this.progress);
	private onProgressCallback?: (progress: ScanProgress) => void;

	// ===============================
	// PUBLIC METHODS
	// ===============================

	/**
	 * Request gallery permissions
	 */
	async requestPermissions(): Promise<boolean> {
		return await galleryPermissions.ensurePermission();
	}

	/**
	 * Check if we have permissions
	 */
	async hasPermissions(): Promise<boolean> {
		return await galleryPermissions.ensurePermission();
	}

	/**
	 * Main scanning method
	 */
	async startScan(
		options: ScanOptions = {},
		progressCallback?: (progress: ScanProgress) => void,
	): Promise<void> {
		// Prevent duplicate scans
		if (this.isScanning) {
			console.log("[GalleryScanner] Already scanning, ignoring duplicate call");
			return;
		}

		// Set defaults
		const {
			scanNewOnly = false,
			processImmediately = true,
			batchSize = 20,
			maxRetries = 3,
		} = options;

		console.log("[GalleryScanner] Starting scan with options:", {
			scanNewOnly,
			processImmediately,
			batchSize,
		});

		// Initialize scan state
		this.isScanning = true;
		this.shouldStop = false;
		this.scanStartTime = Date.now();
		this.onProgressCallback = progressCallback;

		// Reset progress
		this.progress = {
			totalImages: 0,
			processedImages: 0,
			newFiles: 0,
			changedFiles: 0,
			skippedFiles: 0,
			failedFiles: 0,
			currentFile: undefined,
			isScanning: true,
			lastScanDate: null,
			lastProcessedAssetId: null,
			phase: "discovering",
		};

		try {
			// Ensure we have permissions
			const hasPermission = await this.hasPermissions();
			if (!hasPermission) {
				throw new Error("Gallery permission denied");
			}

			// Fetch all gallery images
			const allImages = await this.fetchAllGalleryImages();
			console.log(
				`[GalleryScanner] Found ${allImages.length} total images in gallery`,
			);

			// Initialize progress tracking
			this.progress.totalImages = allImages.length;
			if (allImages.length > 0) {
				progressTracker.start(allImages.length);
			}

			// Process images in batches
			for (let i = 0; i < allImages.length; i += batchSize) {
				// Check if we should stop
				if (this.shouldStop) {
					console.log("[GalleryScanner] Scan stopped by user");
					break;
				}

				// Check memory before processing batch
				await this.checkMemory();

				// Get current batch
				const batch = allImages.slice(
					i,
					Math.min(i + batchSize, allImages.length),
				);

				// Process each image in batch
				for (const photo of batch) {
					const uri = this.extractUri(photo);
					if (!uri) continue;

					// Update progress
					this.progress.processedImages++;
					this.progress.currentFile = uri;

					try {
						// Check if image exists in tracker
						const record = await fixedImageTracker.findExistingRecord(uri);

						if (!record) {
							// NEW IMAGE
							this.progress.newFiles++;
							console.log(
								`[GalleryScanner] NEW image: ${this.getFileName(uri)}`,
							);

							// Create tracking record
							const newRecord = await fixedImageTracker.createRecord(
								uri,
								photo,
							);

							// Process if requested
							if (processImmediately && !scanNewOnly) {
								await this.processImage(newRecord);
							} else if (processImmediately && scanNewOnly) {
								// In scanNewOnly mode, process new images
								await this.processImage(newRecord);
							}
						} else if (!record.isProcessed) {
							// UNPROCESSED IMAGE (failed before or not yet processed)
							this.progress.changedFiles++;
							console.log(
								`[GalleryScanner] UNPROCESSED image: ${this.getFileName(uri)}`,
							);

							// Update tracking
							record.lastSeenAt = Date.now();
							record.scanCount++;

							// Process if not in scanNewOnly mode
							if (processImmediately && !scanNewOnly) {
								await this.processImage(record);
							}
						} else {
							// ALREADY PROCESSED - Skip
							this.progress.skippedFiles++;

							// Just update last seen time
							record.lastSeenAt = Date.now();
						}
					} catch (error) {
						console.error(`[GalleryScanner] Error with ${uri}:`, error);
						this.progress.failedFiles++;
					}

					// Update progress UI
					this.updateProgress();
				}

				// Small delay between batches
				await this.delay(100);
			}

			// Save tracker state
			await fixedImageTracker.forceSave();

			// Mark scan complete
			this.progress.phase = "completed";
			this.progress.lastScanDate = new Date();

			console.log("[GalleryScanner] Scan complete:", {
				total: allImages.length,
				new: this.progress.newFiles,
				changed: this.progress.changedFiles,
				skipped: this.progress.skippedFiles,
				failed: this.progress.failedFiles,
			});
		} catch (error) {
			console.error("[GalleryScanner] Scan error:", error);
			throw error;
		} finally {
			// Clean up
			this.isScanning = false;
			this.progress.isScanning = false;
			this.updateProgress();
			progressTracker.complete();
		}
	}

	/**
	 * Stop the current scan
	 */
	stopScan(): void {
		console.log("[GalleryScanner] Stopping scan...");
		this.shouldStop = true;
		this.isScanning = false;
		this.progress.isScanning = false;
		progressTracker.complete();
		this.updateProgress();
	}

	/**
	 * Process a single image URI (for manual processing)
	 */
	async processImage(
		imageUriOrRecord: string | ImageRecord,
		options?: { force?: boolean },
	): Promise<boolean> {
		try {
			let record: ImageRecord;

			// Handle both URI string and ImageRecord
			if (typeof imageUriOrRecord === "string") {
				const existing =
					await fixedImageTracker.findExistingRecord(imageUriOrRecord);
				if (existing) {
					record = existing;
				} else {
					record = await fixedImageTracker.createRecord(imageUriOrRecord);
				}
			} else {
				record = imageUriOrRecord;
			}

			// Check if already processed (unless forced)
			if (record.isProcessed && !options?.force) {
				console.log(`[GalleryScanner] Already processed: ${record.id}`);
				return true;
			}

			// Process with document processor
			const result = await simpleDocumentProcessor.process(record.primaryUri);

			if (!result) {
				// Not a document - mark as processed anyway so we don't retry
				fixedImageTracker.markAsProcessed(record.id);
				return false;
			}

			// Validate and save
			const sanitized = documentValidator.validateAndSanitize(result);
			const document = await documentStorage.saveDocument(sanitized);

			// Mark as successfully processed
			fixedImageTracker.markAsProcessed(record.id, document.id);

			console.log(`[GalleryScanner] Successfully processed: ${record.id}`);
			return true;
		} catch (error) {
			console.error("[GalleryScanner] Process error:", error);

			// Mark as failed
			if (typeof imageUriOrRecord !== "string") {
				fixedImageTracker.markAsFailed(imageUriOrRecord.id, String(error));
			}

			return false;
		}
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
	observeProgress(): BehaviorSubject<ScanProgress> {
		return this.progressSubject;
	}

	/**
	 * Subscribe to progress with callback
	 */
	subscribeToProgress(callback: (progress: ScanProgress) => void): () => void {
		const subscription = this.progressSubject.subscribe(callback);
		return () => subscription.unsubscribe();
	}

	/**
	 * Check if image was already processed
	 */
	async isImageProcessed(imageUri: string): Promise<boolean> {
		const record = await fixedImageTracker.findExistingRecord(imageUri);
		return record?.isProcessed === true;
	}

	/**
	 * Get scanner statistics
	 */
	getStats() {
		return fixedImageTracker.getStats();
	}

	/**
	 * Get processed images count
	 */
	getProcessedCount(): number {
		const stats = this.getStats();
		return stats.processedImages;
	}

	/**
	 * Clear all processed data (for testing/reset)
	 */
	async clearProcessedData(): Promise<void> {
		await fixedImageTracker.clearAll();
		this.progress = {
			totalImages: 0,
			processedImages: 0,
			newFiles: 0,
			changedFiles: 0,
			skippedFiles: 0,
			failedFiles: 0,
			currentFile: undefined,
			isScanning: false,
			lastScanDate: null,
			lastProcessedAssetId: null,
		};
		this.updateProgress();
	}

	/**
	 * Reset scanner state (for compatibility)
	 */
	resetState(): void {
		this.isScanning = false;
		this.shouldStop = false;
		this.scanStartTime = 0;
		this.progress.isScanning = false;
		this.updateProgress();
	}

	// ===============================
	// PRIVATE HELPER METHODS
	// ===============================

	/**
	 * Fetch all images from device gallery
	 */
	private async fetchAllGalleryImages(): Promise<PhotoIdentifier[]> {
		const allPhotos: PhotoIdentifier[] = [];
		let after: string | undefined;

		do {
			const result = await CameraRoll.getPhotos({
				first: 1000,
				after,
				assetType: "Photos",
				include: ["filename", "fileSize", "imageSize"],
			});

			allPhotos.push(...result.edges);
			after = result.page_info.has_next_page
				? result.page_info.end_cursor
				: undefined;
		} while (after);

		return allPhotos;
	}

	/**
	 * Extract URI from photo asset
	 */
	private extractUri(photo: PhotoIdentifier): string | null {
		return photo.node?.image?.uri || (photo as any).image?.uri || null;
	}

	/**
	 * Get filename from URI
	 */
	private getFileName(uri: string): string {
		const parts = uri.split("/");
		return parts[parts.length - 1] || "unknown";
	}

	/**
	 * Check and manage memory
	 */
	private async checkMemory(): Promise<void> {
		const memStatus = await nativeMemoryManager.getMemoryStatus();
		if (memStatus.isCriticalMemory) {
			console.warn("[GalleryScanner] Critical memory, cleaning up...");
			await nativeMemoryManager.emergencyCleanup();
			if (global.gc) global.gc();
			await this.delay(2000);
		}
	}

	/**
	 * Update progress to all listeners
	 */
	private updateProgress(): void {
		// Update progress tracker
		if (this.progress.isScanning) {
			progressTracker.update(
				this.progress.processedImages,
				this.progress.currentFile,
			);
		}

		// Notify subject subscribers
		this.progressSubject.next(this.progress);

		// Call callback if provided
		if (this.onProgressCallback) {
			this.onProgressCallback(this.progress);
		}

		// Update store
		const store = useScannerStore.getState();
		if (store.setImmediateScanProgress) {
			store.setImmediateScanProgress(this.progress);
		} else {
			store.setScanProgress(this.progress);
		}
	}

	/**
	 * Simple delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ===============================
// SINGLETON EXPORT
// ===============================

export const galleryScanner = new GalleryScanner();
