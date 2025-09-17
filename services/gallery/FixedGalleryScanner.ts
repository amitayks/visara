// services/gallery/FixedGalleryScanner.ts
// Key changes to integrate with FixedImageTracker

import { fixedImageTracker, ImageRecord } from "./FixedImageTracker";
import { progressTracker } from "../progress/ProductionProgressTracker";
import {
	CameraRoll,
	PhotoIdentifier,
} from "@react-native-camera-roll/camera-roll";
import { simpleDocumentProcessor } from "../ai/SimpleDocumentProcessor";
import { documentStorage } from "../database/documentStorage";
import { documentValidator } from "../../utils/documentValidator";
import { nativeMemoryManager } from "../memory/nativeMemoryManager";

/**
 * Simplified scan implementation that properly tracks processed images
 * This replaces the complex streaming logic with something that actually works
 */
export class FixedGalleryScanner {
	private isScanning = false;
	private shouldStop = false;

	/**
	 * Main scan method - properly handles new/changed/processed detection
	 */
	async performScan(
		options: {
			scanNewOnly?: boolean;
			processImmediately?: boolean;
			batchSize?: number;
			onProgress?: (stats: any) => void;
		} = {},
	): Promise<void> {
		if (this.isScanning) {
			console.log("[FixedGalleryScanner] Scan already in progress");
			return;
		}

		this.isScanning = true;
		this.shouldStop = false;

		const {
			scanNewOnly = false,
			processImmediately = true,
			batchSize = 20,
			onProgress,
		} = options;

		console.log("[FixedGalleryScanner] Starting scan with options:", {
			scanNewOnly,
			processImmediately,
			batchSize,
		});

		try {
			// Get all images from gallery
			const photos = await this.fetchAllGalleryImages();
			console.log(
				`[FixedGalleryScanner] Found ${photos.length} total images in gallery`,
			);

			// Track scan statistics
			let newImages = 0;
			let changedImages = 0;
			let processedImages = 0;
			let skippedImages = 0;
			let failedImages = 0;

			// Initialize progress
			if (!scanNewOnly || photos.length > 0) {
				progressTracker.start(photos.length);
			}

			// Process in batches
			for (let i = 0; i < photos.length; i += batchSize) {
				if (this.shouldStop) {
					console.log("[FixedGalleryScanner] Scan stopped by user");
					break;
				}

				// Check memory
				const memStatus = await nativeMemoryManager.getMemoryStatus();
				if (memStatus.isCriticalMemory) {
					console.warn("[FixedGalleryScanner] Critical memory, pausing...");
					await this.waitForMemory();
				}

				const batch = photos.slice(i, Math.min(i + batchSize, photos.length));

				for (const photo of batch) {
					const uri = photo.node?.image?.uri;
					if (!uri) continue;

					processedImages++;

					try {
						// CRITICAL: Check if image exists in our tracker
						let record = await fixedImageTracker.findExistingRecord(uri);

						if (!record) {
							// NEW IMAGE
							newImages++;
							console.log(`[FixedGalleryScanner] NEW image found: ${uri}`);

							// Create record for tracking
							record = await fixedImageTracker.createRecord(uri, photo);

							// Process if requested
							if (processImmediately) {
								const success = await this.processImage(record);
								if (!success) failedImages++;
							}
						} else if (fixedImageTracker.needsProcessing(record)) {
							// UNPROCESSED IMAGE (failed before or interrupted)
							changedImages++;
							console.log(`[FixedGalleryScanner] UNPROCESSED image: ${uri}`);

							// Update last seen
							record.lastSeenAt = Date.now();
							record.scanCount++;

							// Process if not in scanNewOnly mode
							if (!scanNewOnly && processImmediately) {
								const success = await this.processImage(record);
								if (!success) failedImages++;
							}
						} else {
							// ALREADY PROCESSED - Skip
							skippedImages++;

							// Just update last seen time
							record.lastSeenAt = Date.now();
							record.scanCount++;
						}
					} catch (error) {
						console.error(
							`[FixedGalleryScanner] Error processing ${uri}:`,
							error,
						);
						failedImages++;
					}

					// Update progress
					progressTracker.update(processedImages, uri);

					// Report progress
					if (onProgress) {
						onProgress({
							processedImages,
							totalImages: photos.length,
							newImages,
							changedImages,
							skippedImages,
							failedImages,
							currentFile: uri,
							isScanning: true,
						});
					}
				}

				// Small delay between batches
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			// Save tracker state
			await fixedImageTracker.forceSave();

			console.log("[FixedGalleryScanner] Scan complete:", {
				total: photos.length,
				new: newImages,
				unprocessed: changedImages,
				skipped: skippedImages,
				failed: failedImages,
			});

			// Final progress update
			if (onProgress) {
				onProgress({
					processedImages: photos.length,
					totalImages: photos.length,
					newImages,
					changedImages,
					skippedImages,
					failedImages,
					isScanning: false,
				});
			}
		} catch (error) {
			console.error("[FixedGalleryScanner] Scan error:", error);
			throw error;
		} finally {
			this.isScanning = false;
			progressTracker.complete();
		}
	}

	/**
	 * Process a single image
	 */
	private async processImage(record: ImageRecord): Promise<boolean> {
		try {
			// Process with document processor
			const result = await simpleDocumentProcessor.process(record.primaryUri);

			if (!result) {
				// Not a document
				fixedImageTracker.markAsFailed(record.id, "Not a document");
				return false;
			}

			// Validate and save
			const sanitized = documentValidator.validateAndSanitize(result);
			const document = await documentStorage.saveDocument(sanitized);

			// Mark as processed
			fixedImageTracker.markAsProcessed(record.id, document.id);

			console.log(`[FixedGalleryScanner] Successfully processed: ${record.id}`);
			return true;
		} catch (error) {
			console.error(
				`[FixedGalleryScanner] Failed to process ${record.id}:`,
				error,
			);
			fixedImageTracker.markAsFailed(record.id, String(error));
			return false;
		}
	}

	/**
	 * Fetch all gallery images
	 */
	private async fetchAllGalleryImages(): Promise<PhotoIdentifier[]> {
		const photos: PhotoIdentifier[] = [];
		let after: string | undefined;

		do {
			const batch = await CameraRoll.getPhotos({
				first: 1000,
				after,
				assetType: "Photos",
				include: ["filename", "fileSize", "imageSize"],
			});

			photos.push(...batch.edges);
			after = batch.page_info.has_next_page
				? batch.page_info.end_cursor
				: undefined;
		} while (after);

		return photos;
	}

	/**
	 * Wait for memory to free up
	 */
	private async waitForMemory(): Promise<void> {
		await nativeMemoryManager.emergencyCleanup();
		if (global.gc) global.gc();
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}

	/**
	 * Stop current scan
	 */
	stopScan(): void {
		this.shouldStop = true;
		progressTracker.complete();
	}

	/**
	 * Check if scanning
	 */
	isCurrentlyScanning(): boolean {
		return this.isScanning;
	}

	/**
	 * Get tracker statistics
	 */
	getStats() {
		return fixedImageTracker.getStats();
	}

	/**
	 * Clear all data (for testing)
	 */
	async clearAllData(): Promise<void> {
		await fixedImageTracker.clearAll();
	}
}
