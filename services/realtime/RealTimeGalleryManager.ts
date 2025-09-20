// services/realtime/RealTimeGalleryManager.ts
// React Native service for real-time gallery observation

import {
	NativeEventEmitter,
	NativeModules,
	Platform,
	EmitterSubscription,
} from "react-native";
import { documentDetector } from "../processing/DocumentDetector";
import { documentProcessor } from "../processing/DocumentProcessor";
import { simpleImageTracker } from "../tracker/SimpleImageTracker";
import { useDocumentStore } from "../../stores/documentStore";

interface ImageInfo {
	uri: string;
	id: string;
	width: number;
	height: number;
	creationDate: number;
	modificationDate: number;
	size?: number;
	mediaType: string;
	isNew: boolean;
}

interface GalleryEvent {
	images: ImageInfo[];
	count: number;
	timestamp: number;
}

interface DeleteEvent {
	deletedIds: string[];
	count: number;
	timestamp: number;
}

class RealTimeGalleryManager {
	private static instance: RealTimeGalleryManager;
	private eventEmitter: NativeEventEmitter;
	private galleryObserver: any;
	private subscriptions: EmitterSubscription[] = [];
	private isMonitoring = false;
	private processingQueue: Set<string> = new Set();
	private batchProcessor: NodeJS.Timeout | null = null;
	private imageBatch: ImageInfo[] = [];
	private readonly BATCH_DELAY = 1000; // Process batch after 1 second
	private readonly MAX_BATCH_SIZE = 5;

	private constructor() {
		// Debug: List available native modules
		console.log("[RealTimeGallery] Available native modules:", Object.keys(NativeModules));
		
		// Get native module
		this.galleryObserver = NativeModules.GalleryObserver;

		if (!this.galleryObserver) {
			console.error(
				"[RealTimeGallery] Native module not found. Did you rebuild the app?",
			);
			throw new Error("GalleryObserver native module not found");
		}

		console.log("[RealTimeGallery] Native module methods:", Object.keys(this.galleryObserver));

		// Create event emitter
		this.eventEmitter = new NativeEventEmitter(this.galleryObserver);
	}

	static getInstance(): RealTimeGalleryManager {
		if (!RealTimeGalleryManager.instance) {
			RealTimeGalleryManager.instance = new RealTimeGalleryManager();
		}
		return RealTimeGalleryManager.instance;
	}

	/**
	 * Start real-time monitoring
	 */
	async start(): Promise<void> {
		if (this.isMonitoring) {
			return;
		}

		try {
			// Initialize services
			await documentDetector.initialize();
			await documentProcessor.initialize();
			await simpleImageTracker.initialize();

			// Start native observer
			await this.galleryObserver.startObserving();

			// Subscribe to events
			this.setupEventListeners();

			this.isMonitoring = true;
		} catch (error) {
			console.error("[RealTimeGallery] Failed to start monitoring:", error);
			throw error;
		}
	}

	/**
	 * Stop monitoring
	 */
	stop(): void {
		if (!this.isMonitoring) {
			return;
		}

		console.log("[RealTimeGallery] Stopping monitoring...");

		// Clear batch processor
		if (this.batchProcessor) {
			clearTimeout(this.batchProcessor);
			this.batchProcessor = null;
		}

		// Remove event listeners
		this.subscriptions.forEach((sub) => sub.remove());
		this.subscriptions = [];

		// Stop native observer
		this.galleryObserver.stopObserving();

		this.isMonitoring = false;
		this.processingQueue.clear();
		this.imageBatch = [];

		console.log("[RealTimeGallery] Monitoring stopped");
	}

	/**
	 * Setup event listeners for native events
	 */
	private setupEventListeners(): void {
		// Listen for new images
		const newImagesListener = this.eventEmitter.addListener(
			"onNewImages",
			this.handleNewImages.bind(this),
		);

		// Listen for deleted images
		const deletedListener = this.eventEmitter.addListener(
			"onImagesDeleted",
			this.handleDeletedImages.bind(this),
		);

		// Listen for errors
		const errorListener = this.eventEmitter.addListener(
			"onGalleryError",
			this.handleError.bind(this),
		);

		this.subscriptions = [newImagesListener, deletedListener, errorListener];
	}

	/**
	 * Handle new images detected by native observer
	 */
	private handleNewImages(event: GalleryEvent): void {
		console.log(`[RealTimeGallery] 📸 ${event.count} new images detected`);

		// Add to batch
		this.imageBatch.push(...event.images);

		// Clear existing timeout
		if (this.batchProcessor) {
			clearTimeout(this.batchProcessor);
		}

		// Process immediately if batch is large enough, otherwise wait
		if (this.imageBatch.length >= this.MAX_BATCH_SIZE) {
			this.processBatch();
		} else {
			// Set timeout to process batch
			this.batchProcessor = setTimeout(() => {
				this.processBatch();
			}, this.BATCH_DELAY);
		}
	}

	/**
	 * Process batch of images
	 */
	private async processBatch(): Promise<void> {
		if (this.imageBatch.length === 0) {
			return;
		}

		const batch = [...this.imageBatch];
		this.imageBatch = [];
		this.batchProcessor = null;

		console.log(`[RealTimeGallery] Processing batch of ${batch.length} images`);

		// Process each image
		for (const image of batch) {
			// Skip if already processing
			if (this.processingQueue.has(image.id)) {
				continue;
			}

			this.processingQueue.add(image.id);

			// Process asynchronously without blocking
			this.processImage(image).finally(() => {
				this.processingQueue.delete(image.id);
			});
		}
	}

	/**
	 * Process a single image
	 */
	private async processImage(image: ImageInfo): Promise<void> {
		try {
			const startTime = Date.now();

			// Check if already tracked
			const isTracked = await simpleImageTracker.isTracked(image.id);
			if (isTracked) {
				console.log(`[RealTimeGallery] Image already tracked: ${image.id}`);
				return;
			}

			// Track the image
			await simpleImageTracker.trackImage(image.id, image.uri);

			// Check if it's a document using visual detection
			const isDocument = await documentDetector.detectDocument(image.uri);

			if (!isDocument) {
				console.log(`[RealTimeGallery] Not a document: ${image.id}`);
				await simpleImageTracker.markAsNonDocument(image.id);
				return;
			}

			console.log(`[RealTimeGallery] 📄 Document detected: ${image.id}`);

			// Process the document
			const processedDoc = await documentProcessor.process(image.uri);

			if (processedDoc) {
				// Save to database using document store
				const documentStore = useDocumentStore.getState();
				await documentStore.addDocument(processedDoc);
				await simpleImageTracker.markAsProcessed(image.id, processedDoc.id);

				const duration = Date.now() - startTime;
				console.log(`[RealTimeGallery] ✅ Document processed in ${duration}ms`);
			} else {
				await simpleImageTracker.markAsFailed(image.id);
			}
		} catch (error) {
			console.error(
				`[RealTimeGallery] Failed to process image ${image.id}:`,
				error,
			);
			await simpleImageTracker.markAsFailed(image.id);
		}
	}

	/**
	 * Handle deleted images
	 */
	private async handleDeletedImages(event: DeleteEvent): Promise<void> {
		console.log(`[RealTimeGallery] 🗑️ ${event.count} images deleted`);

		for (const imageId of event.deletedIds) {
			try {
				// Remove from tracker
				await simpleImageTracker.removeImage(imageId);

				// Remove from database if it was a document
				const documentId = await simpleImageTracker.getDocumentId(imageId);
				if (documentId) {
					const documentStore = useDocumentStore.getState();
					await documentStore.deleteDocument(documentId);
				}
			} catch (error) {
				console.error(
					`[RealTimeGallery] Failed to handle deletion for ${imageId}:`,
					error,
				);
			}
		}
	}

	/**
	 * Handle errors from native module
	 */
	private handleError(event: { error: string; timestamp: number }): void {
		console.error("[RealTimeGallery] Native error:", event.error);
	}

	/**
	 * Get initial image count for progress tracking
	 */
	async getInitialImageCount(): Promise<number> {
		try {
			return await this.galleryObserver.getInitialImageCount();
		} catch (error) {
			console.error("[RealTimeGallery] Failed to get image count:", error);
			return 0;
		}
	}

	/**
	 * Get batch of images for initial scan
	 */
	async getImageBatch(offset: number, limit: number): Promise<ImageInfo[]> {
		try {
			console.log(`[RealTimeGallery] Requesting batch: offset=${offset}, limit=${limit}`);
			
			if (!this.galleryObserver) {
				throw new Error("Native module not available");
			}
			
			const result = await this.galleryObserver.getImageBatch(offset, limit);
			console.log(`[RealTimeGallery] Batch result: ${result ? result.length : 0} images`);
			return result || [];
		} catch (error) {
			console.error("[RealTimeGallery] Failed to get image batch:", error);
			console.error("[RealTimeGallery] Error details:", {
				name: error instanceof Error ? error.name : "Unknown",
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			return [];
		}
	}

	/**
	 * Mark images as processed (for initial scan)
	 */
	async markAsProcessed(imageIds: string[]): Promise<void> {
		try {
			await this.galleryObserver.markAsProcessed(imageIds);
		} catch (error) {
			console.error("[RealTimeGallery] Failed to mark as processed:", error);
		}
	}

	/**
	 * Check if monitoring is active
	 */
	isActive(): boolean {
		return this.isMonitoring;
	}

	/**
	 * Get processing queue size
	 */
	getQueueSize(): number {
		return this.processingQueue.size + this.imageBatch.length;
	}
}

// Export singleton instance
export const realTimeGalleryManager = RealTimeGalleryManager.getInstance();
