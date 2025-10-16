/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */
import { ImageLabelingService } from "./ImageLabelingService";
import { TextRecognitionService } from "./TextRecognitionService";
import type { ImageLabelingResult } from "./ImageLabelingService";
import type { TextRecognitionResult } from "./TextRecognitionService";
import {
	ProcessingErrorHandler,
	type ProcessingError,
} from "@services/error/ProcessingErrorHandler";

export interface ProcessingResult {
	imageLabeling: ImageLabelingResult;
	textRecognition: TextRecognitionResult;
	totalProcessingTime: number;
	success: boolean;
	error?: string;
	processingError?: ProcessingError;
}

export interface QueueItem {
	id: string;
	imageUri: string;
	priority: number;
	retryCount: number;
}

export class ProcessingService {
	private static queue: QueueItem[] = [];
	private static isProcessing = false;
	// NO RETRY LOGIC - Constitutional requirement: failed files get badge, no automatic retry
	private static maxRetries = 0;

	static async processMedia(imageUri: string): Promise<ProcessingResult> {
		const startTime = Date.now();
		let imageLabelingResult: ImageLabelingResult | null = null;
		let textRecognitionResult: TextRecognitionResult | null = null;

		try {
			// Run both ML services in parallel
			const [labelingResult, recognitionResult] = await Promise.all([
				ImageLabelingService.processImage(imageUri),
				TextRecognitionService.extractText(imageUri),
			]);

			imageLabelingResult = labelingResult;
			textRecognitionResult = recognitionResult;

			const totalProcessingTime = Date.now() - startTime;

			return {
				imageLabeling: imageLabelingResult,
				textRecognition: textRecognitionResult,
				totalProcessingTime,
				success: true,
			};
		} catch (error) {
			console.error("ProcessingService.processMedia error:", error);

			const totalProcessingTime = Date.now() - startTime;

			// Use ProcessingErrorHandler to map error and log failed file
			const processingError = ProcessingErrorHandler.handleError(
				error instanceof Error ? error : new Error(String(error)),
				imageUri,
			);

			return {
				imageLabeling: imageLabelingResult || {
					labels: [],
					processingTime: 0,
				},
				textRecognition: textRecognitionResult || {
					text: "",
					blocks: "[]",
					processingTime: 0,
				},
				totalProcessingTime,
				success: false,
				error: processingError.userMessage,
				processingError,
			};
		}
	}

	static addToQueue(item: QueueItem): void {
		// Insert based on priority (higher priority first)
		const insertIndex = this.queue.findIndex(
			(queueItem) => queueItem.priority < item.priority,
		);

		if (insertIndex === -1) {
			this.queue.push(item);
		} else {
			this.queue.splice(insertIndex, 0, item);
		}

		// Start processing if not already running
		if (!this.isProcessing) {
			this.processQueue();
		}
	}

	static async processQueue(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) {
			return;
		}

		this.isProcessing = true;

		while (this.queue.length > 0) {
			const item = this.queue.shift();
			if (!item) break;

			try {
				const result = await this.processMedia(item.imageUri);

				// NO RETRY - Constitutional requirement
				// Failed files are logged in ProcessingErrorHandler and marked with badge
				if (!result.success) {
					console.warn(
						`File processing failed (no retry): ${item.imageUri}`,
						result.error,
					);
				}
			} catch (error) {
				console.error(`Failed to process queue item ${item.id}:`, error);
				// NO RETRY - file will be marked as failed
			}
		}

		this.isProcessing = false;
	}

	static clearQueue(): void {
		this.queue = [];
	}

	static getQueueLength(): number {
		return this.queue.length;
	}

	static isQueueProcessing(): boolean {
		return this.isProcessing;
	}

	/**
	 * @deprecated No retry logic per constitutional requirement
	 * This method is kept for backward compatibility but has no effect
	 */
	static setMaxRetries(_maxRetries: number): void {
		console.warn(
			"ProcessingService.setMaxRetries is deprecated: No retry logic per constitutional requirement",
		);
		// maxRetries is always 0 - no retries allowed
	}
}
