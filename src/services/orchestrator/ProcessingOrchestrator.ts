/**
 * ProcessingOrchestrator
 *
 * Coordinates the entire media processing pipeline:
 * 1. Media Discovery (via native modules)
 * 2. Queue Management (ProcessingQueue + ProcessingQueueRepository)
 * 3. ML Processing (ProcessingService -> ImageLabeling + TextRecognition)
 * 4. Database Storage (MediaFileRepository)
 * 5. UI Updates (via ProcessingContext)
 *
 * Flow:
 * - On app start: Initial scan discovers all media files
 * - Native observers detect new/changed media in real-time
 * - New media is added to processing queue
 * - Serial processing (1 file at a time) prevents memory overflow
 * - Processing results are stored in encrypted database
 * - Failed files are marked without retry (per spec FR-080)
 */

import type { ProcessingQueue } from "@models/ProcessingQueue";
import type { MediaChange } from "@native-modules/NativeMediaObserver";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { ProcessingQueueRepository } from "@services/database/ProcessingQueueRepository";
import { MediaDiscoveryService } from "@services/media/MediaDiscoveryService";
import { ProcessingService } from "@services/ml/ProcessingService";
import { SearchService } from "@services/search/SearchService";
import { MemoryMonitor } from "@services/performance/MemoryMonitor";
import {
	getStorageWarningMessage,
	shouldAllowProcessing as shouldAllowProcessingStorage,
} from "@utils/device/storage";

export interface OrchestratorConfig {
	batchSize: number;
	throttleMs: number;
	onProgress?: (current: number, total: number, fileName: string) => void;
	onComplete?: (total: number) => void;
	onError?: (error: Error) => void;
}

export interface ProcessingStats {
	total: number;
	processed: number;
	failed: number;
	pending: number;
	currentFileName?: string;
}

/**
 * ProcessingOrchestrator - Main coordinator for media processing pipeline
 */
export class ProcessingOrchestrator {
	private static isInitialized = false;
	private static isProcessing = false;
	private static isPaused = false;
	private static config: OrchestratorConfig = {
		batchSize: 100,
		throttleMs: 5000,
	};
	private static cleanupObserver: (() => void) | null = null;
	private static processingAbortController: AbortController | null = null;

	/**
	 * Initialize the orchestrator - sets up native observers and starts initial scan
	 */
	static async initialize(config?: Partial<OrchestratorConfig>): Promise<void> {
		if (this.isInitialized) {
			console.warn("ProcessingOrchestrator already initialized");
			return;
		}

		// Merge config
		this.config = { ...this.config, ...config };

		try {
			// Initialize memory monitor with 80% threshold
			MemoryMonitor.initialize({
				threshold: 0.8,
				checkInterval: 2000,
				enableLogging: true,
			});

			// Set up memory warning callback to pause processing
			MemoryMonitor.onMemoryWarning(async (memoryInfo) => {
				console.warn(
					`Memory threshold exceeded: ${(memoryInfo.usagePercentage * 100).toFixed(1)}% - Pausing processing`,
				);
				this.pause();

				// Trigger cleanup
				await MemoryMonitor.triggerCleanup();

				// Check memory again after cleanup
				const newMemoryInfo = await MemoryMonitor.getMemoryInfo();
				if (!newMemoryInfo.isAboveThreshold) {
					console.log("Memory returned to safe levels - Resuming processing");
					this.resume();
				}
			});

			// Start monitoring
			MemoryMonitor.startMonitoring();

			// Start initial scan to discover all existing media
			await this.performInitialScan();

			// Start native observer for real-time changes
			this.startNativeObserver();

			this.isInitialized = true;
			console.log("ProcessingOrchestrator initialized successfully");
		} catch (error) {
			console.error("Failed to initialize ProcessingOrchestrator:", error);
			this.config.onError?.(
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Perform initial scan of all media files on device
	 */
	private static async performInitialScan(): Promise<void> {
		console.log("Starting initial media scan...");

		return new Promise((resolve) => {
			let totalDiscovered = 0;

			const cleanup = MediaDiscoveryService.startNativeScan(
				async (changes: MediaChange[]) => {
					// Process batch of discovered media
					try {
						await this.processBatch(changes);
						totalDiscovered += changes.length;
					} catch (error) {
						console.error("Error processing batch during initial scan:", error);
						this.config.onError?.(
							error instanceof Error ? error : new Error(String(error)),
						);
					}
				},
				(total: number) => {
					// Scan complete
					console.log(`Initial scan complete. Discovered ${total} media files`);
					this.config.onComplete?.(total);
					cleanup();
					resolve();

					// Start processing queue
					this.startProcessingQueue();
				},
			);
		});
	}

	/**
	 * Process a batch of media changes from native modules
	 */
	private static async processBatch(changes: MediaChange[]): Promise<void> {
		for (const change of changes) {
			try {
				// Convert MediaChange to DiscoveredMedia format
				const discoveredMedia =
					MediaDiscoveryService.convertMediaChange(change);

				// Check if media file already exists in database
				const existingMedia = await MediaFileRepository.findByUri(
					discoveredMedia.uri,
				);

				if (existingMedia) {
					// Media already exists, check if it needs reprocessing
					if (change.action === "modified") {
						// Queue for reprocessing
						await this.queueForProcessing(existingMedia.id, 5); // Lower priority for modified files
					}
					continue;
				}

				// Create new media file record
				const mediaFile = await MediaFileRepository.create({
					uri: discoveredMedia.uri,
					filename: discoveredMedia.filename,
					mimeType: discoveredMedia.mimeType,
					width: discoveredMedia.width,
					height: discoveredMedia.height,
					fileSize: discoveredMedia.fileSize,
					creationDate: discoveredMedia.creationDate,
					modificationDate: discoveredMedia.modificationDate,
					latitude: discoveredMedia.latitude,
					longitude: discoveredMedia.longitude,
				});

				// Add to processing queue
				await this.queueForProcessing(mediaFile.id, 10); // Normal priority for new files
			} catch (error) {
				console.error(
					`Error processing media change: ${change.filename}`,
					error,
				);
				this.config.onError?.(
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	}

	/**
	 * Add media file to processing queue
	 */
	private static async queueForProcessing(
		mediaFileId: string,
		priority: number,
	): Promise<void> {
		try {
			// Check if already in queue
			const existing =
				await ProcessingQueueRepository.findByMediaFileId(mediaFileId);
			if (existing.length > 0) {
				// Already queued, skip
				return;
			}

			// Add to queue
			await ProcessingQueueRepository.create({
				mediaFileId,
				status: "pending",
				priority,
				retryCount: 0,
			});
		} catch (error) {
			console.error(`Error queueing media file ${mediaFileId}:`, error);
			throw error;
		}
	}

	/**
	 * Start the native observer for real-time media changes
	 */
	private static startNativeObserver(): void {
		console.log("Starting native media observer...");

		this.cleanupObserver = MediaDiscoveryService.startObserver(
			this.config.throttleMs,
			async (changes: MediaChange[]) => {
				console.log(
					`Received ${changes.length} media changes from native observer`,
				);
				try {
					await this.processBatch(changes);

					// Trigger processing if not already running
					if (!this.isProcessing) {
						this.startProcessingQueue();
					}
				} catch (error) {
					console.error("Error processing observer batch:", error);
					this.config.onError?.(
						error instanceof Error ? error : new Error(String(error)),
					);
				}
			},
		);
	}

	/**
	 * Start processing the queue (serial processing - 1 file at a time)
	 */
	static async startProcessingQueue(): Promise<void> {
		if (this.isProcessing) {
			console.log("Processing already in progress");
			return;
		}

		if (this.isPaused) {
			console.log("Processing is paused");
			return;
		}

		// Check storage before starting processing
		const storageCheck = await shouldAllowProcessingStorage();
		if (!storageCheck.allowed) {
			console.warn(
				`Cannot start processing: ${storageCheck.reason}`,
			);
			const warningMessage = await getStorageWarningMessage();
			if (warningMessage) {
				this.config.onError?.(new Error(warningMessage));
			}
			// Pause processing until storage is available
			this.pause();
			return;
		}

		this.isProcessing = true;
		this.processingAbortController = new AbortController();

		console.log("Starting processing queue...");

		try {
			let processedCount = 0;

			while (
				!this.isPaused &&
				!this.processingAbortController?.signal.aborted
			) {
				// Get next pending item from queue
				const nextItem = await ProcessingQueueRepository.getNextPending();

				if (!nextItem) {
					// Queue is empty
					console.log(`Processing complete. Processed ${processedCount} items`);
					break;
				}

				// Process the item
				try {
					await this.processQueueItem(nextItem);
					processedCount++;
				} catch (error) {
					console.error(`Error processing queue item ${nextItem.id}:`, error);
					// Continue to next item
				}
			}
		} finally {
			this.isProcessing = false;
			this.processingAbortController = null;
		}
	}

	/**
	 * Process a single queue item
	 */
	private static async processQueueItem(
		queueItem: ProcessingQueue,
	): Promise<void> {
		try {
			// Check storage before processing
			const storageCheck = await shouldAllowProcessingStorage();
			if (!storageCheck.allowed) {
				console.warn(
					`Storage check failed: ${storageCheck.reason} - Pausing processing`,
				);
				this.pause();

				// Notify via config callback
				const warningMessage = await getStorageWarningMessage();
				if (warningMessage) {
					this.config.onError?.(new Error(warningMessage));
				}

				throw new Error(
					storageCheck.reason || "Insufficient storage - Cannot continue processing",
				);
			}

			// Check memory before processing
			const isSafeToProcess = await MemoryMonitor.isSafeToProcess();
			if (!isSafeToProcess) {
				console.warn(
					"Memory usage above threshold - Pausing until memory is released",
				);
				this.pause();

				// Trigger cleanup and wait
				await MemoryMonitor.triggerCleanup();
				await new Promise((resolve) => setTimeout(resolve, 2000));

				// Re-check memory
				const retryCheck = await MemoryMonitor.isSafeToProcess();
				if (!retryCheck) {
					// Still not safe - bail out
					throw new Error("Memory threshold exceeded - Cannot continue processing");
				}

				// Safe to continue
				this.isPaused = false;
			}

			// Mark as processing
			await ProcessingQueueRepository.markAsProcessing(queueItem);

			// Get media file
			const mediaFile = await MediaFileRepository.findById(
				queueItem.mediaFileId,
			);
			if (!mediaFile) {
				throw new Error(`Media file not found: ${queueItem.mediaFileId}`);
			}

			// Notify progress
			const stats = await this.getStats();
			this.config.onProgress?.(
				stats.processed,
				stats.total,
				mediaFile.filename,
			);

			// Process media using ML services
			const processingResult = await ProcessingService.processMedia(
				mediaFile.uri,
			);

			if (processingResult.success) {
				// Update media file with processing results
				await MediaFileRepository.updateWithProcessingResult(
					mediaFile,
					processingResult,
				);

				// Update search index incrementally
				await SearchService.addToIndex(mediaFile.id);

				// Mark queue item as completed
				await ProcessingQueueRepository.markAsCompleted(queueItem);

				console.log(`Successfully processed: ${mediaFile.filename}`);
			} else {
				// Processing failed - mark as failed WITHOUT retry (per spec FR-080)
				await ProcessingQueueRepository.markAsFailed(
					queueItem,
					processingResult.error || "Processing failed",
				);

				// Mark media file as processed but failed
				await MediaFileRepository.update(mediaFile, { isProcessed: false });

				console.warn(
					`Failed to process: ${mediaFile.filename} - ${processingResult.error}`,
				);
			}
		} catch (error) {
			// Unexpected error - mark as failed
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			await ProcessingQueueRepository.markAsFailed(queueItem, errorMessage);
			console.error(`Processing error for queue item ${queueItem.id}:`, error);
			throw error;
		}
	}

	/**
	 * Pause processing queue
	 */
	static pause(): void {
		if (!this.isProcessing) {
			console.log("Processing is not running");
			return;
		}

		this.isPaused = true;
		console.log("Processing paused");
	}

	/**
	 * Resume processing queue
	 */
	static resume(): void {
		if (!this.isPaused) {
			console.log("Processing is not paused");
			return;
		}

		this.isPaused = false;
		console.log("Processing resumed");

		// Restart processing
		this.startProcessingQueue();
	}

	/**
	 * Stop processing queue immediately
	 */
	static stop(): void {
		this.isPaused = false;
		this.processingAbortController?.abort();
		console.log("Processing stopped");
	}

	/**
	 * Get current processing statistics
	 */
	static async getStats(): Promise<ProcessingStats> {
		const total = await ProcessingQueueRepository.count();
		const processed =
			await ProcessingQueueRepository.countByStatus("completed");
		const failed = await ProcessingQueueRepository.countByStatus("failed");
		const pending = await ProcessingQueueRepository.countByStatus("pending");

		return {
			total,
			processed,
			failed,
			pending,
		};
	}

	/**
	 * Get changes since a specific timestamp
	 */
	static async getChangesSince(timestamp: number): Promise<void> {
		return new Promise((resolve) => {
			const cleanup = MediaDiscoveryService.getChangesSinceNative(
				timestamp,
				async (changes: MediaChange[]) => {
					try {
						await this.processBatch(changes);
					} catch (error) {
						console.error("Error processing changes since timestamp:", error);
						this.config.onError?.(
							error instanceof Error ? error : new Error(String(error)),
						);
					}
				},
				(total: number) => {
					console.log(
						`Found ${total} changes since ${new Date(timestamp).toISOString()}`,
					);
					cleanup();
					resolve();

					// Trigger processing if not already running
					if (!this.isProcessing) {
						this.startProcessingQueue();
					}
				},
			);
		});
	}

	/**
	 * Shutdown the orchestrator - cleanup observers and stop processing
	 */
	static shutdown(): void {
		console.log("Shutting down ProcessingOrchestrator...");

		// Stop processing
		this.stop();

		// Stop memory monitoring
		MemoryMonitor.stopMonitoring();
		MemoryMonitor.clearCallbacks();

		// Cleanup native observer
		if (this.cleanupObserver) {
			this.cleanupObserver();
			this.cleanupObserver = null;
		}

		this.isInitialized = false;
		console.log("ProcessingOrchestrator shutdown complete");
	}

	/**
	 * Check if orchestrator is initialized
	 */
	static getIsInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Check if processing is active
	 */
	static getIsProcessing(): boolean {
		return this.isProcessing;
	}

	/**
	 * Check if processing is paused
	 */
	static getIsPaused(): boolean {
		return this.isPaused;
	}
}
