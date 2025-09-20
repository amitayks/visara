// services/realtime/InitialScanner.ts
// One-time initial gallery scan with progress tracking

import { realTimeGalleryManager } from "./RealTimeGalleryManager";
import { documentDetector } from "../processing/DocumentDetector";
import { documentProcessor } from "../processing/DocumentProcessor";
import { simpleImageTracker } from "../tracker/SimpleImageTracker";
import { useDocumentStore } from "../../stores/documentStore";
import { BehaviorSubject } from "rxjs";

export interface ScanProgress {
	phase: "preparing" | "scanning" | "processing" | "completed";
	totalImages: number;
	processedImages: number;
	documentsFound: number;
	currentImage?: string;
	percentage: number;
	isScanning: boolean;
	error?: string;
}

class InitialScanner {
	private static instance: InitialScanner;
	private isScanning = false;
	private shouldStop = false;
	private progressSubject: BehaviorSubject<ScanProgress>;
	private progress: ScanProgress = {
		phase: "preparing",
		totalImages: 0,
		processedImages: 0,
		documentsFound: 0,
		percentage: 0,
		isScanning: false,
	};

	private readonly BATCH_SIZE = 50; // Process images in batches
	private readonly CONCURRENT_PROCESSING = 3; // Process 3 images at once

	private constructor() {
		this.progressSubject = new BehaviorSubject<ScanProgress>(this.progress);
	}

	static getInstance(): InitialScanner {
		if (!InitialScanner.instance) {
			InitialScanner.instance = new InitialScanner();
		}
		return InitialScanner.instance;
	}

	/**
	 * Perform initial scan of gallery
	 */
	async performInitialScan(): Promise<void> {
		if (this.isScanning) {
			console.log("[InitialScanner] Scan already in progress");
			return;
		}

		console.log("[InitialScanner] Starting initial gallery scan...");
		this.isScanning = true;
		this.shouldStop = false;

		try {
			// Initialize services
			await this.initializeServices();

			// Update progress
			this.updateProgress({
				phase: "scanning",
				isScanning: true,
			});

			// Get total image count
			const totalImages = await realTimeGalleryManager.getInitialImageCount();
			console.log(
				`[InitialScanner] Found ${totalImages} total images in gallery`,
			);

			this.updateProgress({
				totalImages,
				phase: "processing",
			});

			// Check if already scanned
			const hasScannedBefore = await simpleImageTracker.hasScannedBefore();
			if (hasScannedBefore) {
				console.log(
					"[InitialScanner] Gallery already scanned, checking for new images only",
				);
				// In production, we might want to do an incremental scan here
				// For now, we'll proceed with full scan for demo
			}

			// Process images in batches
			let offset = 0;
			const processedIds: string[] = [];

			while (offset < totalImages && !this.shouldStop) {
				// Get batch of images
				const batch = await realTimeGalleryManager.getImageBatch(
					offset,
					this.BATCH_SIZE,
				);

				if (batch.length === 0) {
					break;
				}

				// Process batch with concurrent limiting
				await this.processBatch(batch);

				// Track processed IDs
				processedIds.push(...batch.map((img) => img.id));

				// Update offset
				offset += batch.length;

				// Update progress
				this.updateProgress({
					processedImages: offset,
					percentage: Math.round((offset / totalImages) * 100),
				});
			}

			// Mark all as processed in native module
			if (processedIds.length > 0) {
				await realTimeGalleryManager.markAsProcessed(processedIds);
			}

			// Mark scan as complete
			await simpleImageTracker.markScanComplete();

			// Final progress update
			this.updateProgress({
				phase: "completed",
				isScanning: false,
				percentage: 100,
			});

			console.log(
				`[InitialScanner] ✅ Initial scan complete. Found ${this.progress.documentsFound} documents`,
			);
		} catch (error) {
			console.error("[InitialScanner] Scan failed:", error);

			this.updateProgress({
				phase: "completed",
				isScanning: false,
				error: error instanceof Error ? error.message : String(error),
			});

			throw error;
		} finally {
			this.isScanning = false;
		}
	}

	/**
	 * Initialize all required services
	 */
	private async initializeServices(): Promise<void> {
		console.log("[InitialScanner] Initializing services...");

		await Promise.all([
			documentDetector.initialize(),
			documentProcessor.initialize(),
			simpleImageTracker.initialize(),
		]);

		console.log("[InitialScanner] Services initialized");
	}

	/**
	 * Process a batch of images with concurrency control
	 */
	private async processBatch(images: any[]): Promise<void> {
		// Split batch into chunks for concurrent processing
		const chunks: any[][] = [];
		for (let i = 0; i < images.length; i += this.CONCURRENT_PROCESSING) {
			chunks.push(images.slice(i, i + this.CONCURRENT_PROCESSING));
		}

		// Process each chunk
		for (const chunk of chunks) {
			if (this.shouldStop) {
				break;
			}

			// Process images in parallel
			const promises = chunk.map((image) => this.processImage(image));
			await Promise.allSettled(promises);
		}
	}

	/**
	 * Process a single image
	 */
	private async processImage(image: any): Promise<void> {
		try {
			// Update current image
			this.updateProgress({
				currentImage: image.uri,
			});

			// Check if already tracked
			const isTracked = await simpleImageTracker.isTracked(image.id);
			if (isTracked) {
				return;
			}

			// Track the image
			await simpleImageTracker.trackImage(image.id, image.uri);

			// Check if it's a document
			const isDocument = await documentDetector.detectDocument(image.uri);

			if (!isDocument) {
				await simpleImageTracker.markAsNonDocument(image.id);
				return;
			}

			// Process the document
			const processedDoc = await documentProcessor.process(image.uri);

			if (processedDoc) {
				// Save to database using document store
				const documentStore = useDocumentStore.getState();
				await documentStore.addDocument(processedDoc);
				await simpleImageTracker.markAsProcessed(image.id, processedDoc.id);

				// Update documents found count
				this.updateProgress({
					documentsFound: this.progress.documentsFound + 1,
				});

				console.log(`[InitialScanner] Document found: ${image.id}`);
			} else {
				await simpleImageTracker.markAsFailed(image.id);
			}
		} catch (error) {
			console.error(
				`[InitialScanner] Failed to process image ${image.id}:`,
				error,
			);
			await simpleImageTracker.markAsFailed(image.id);
		}
	}

	/**
	 * Update and broadcast progress
	 */
	private updateProgress(updates: Partial<ScanProgress>): void {
		this.progress = {
			...this.progress,
			...updates,
		};

		this.progressSubject.next(this.progress);
	}

	/**
	 * Stop the current scan
	 */
	stopScan(): void {
		console.log("[InitialScanner] Stopping scan...");
		this.shouldStop = true;
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
	 * Check if currently scanning
	 */
	isCurrentlyScanning(): boolean {
		return this.isScanning;
	}

	/**
	 * Reset scanner state
	 */
	reset(): void {
		this.progress = {
			phase: "preparing",
			totalImages: 0,
			processedImages: 0,
			documentsFound: 0,
			percentage: 0,
			isScanning: false,
		};

		this.progressSubject.next(this.progress);
		this.isScanning = false;
		this.shouldStop = false;
	}
}

// Export singleton instance
export const initialScanner = InitialScanner.getInstance();