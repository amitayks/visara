/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */
import { ImageLabelingService } from "./ImageLabelingService";
import { TextRecognitionService } from "./TextRecognitionService";
import type { ImageLabelingResult } from "./ImageLabelingService";
import type { TextRecognitionResult } from "./TextRecognitionService";

export interface ProcessingResult {
	imageLabeling: ImageLabelingResult;
	textRecognition: TextRecognitionResult;
	totalProcessingTime: number;
	success: boolean;
	error?: string;
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
	private static maxRetries = 1;

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
				error:
					error instanceof Error ? error.message : "Unknown processing error",
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

				if (!result.success && item.retryCount < this.maxRetries) {
					// Re-add to queue with incremented retry count
					this.addToQueue({
						...item,
						retryCount: item.retryCount + 1,
						priority: item.priority - 1, // Lower priority for retries
					});
				}
			} catch (error) {
				console.error(`Failed to process queue item ${item.id}:`, error);

				if (item.retryCount < this.maxRetries) {
					this.addToQueue({
						...item,
						retryCount: item.retryCount + 1,
						priority: item.priority - 1,
					});
				}
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

	static setMaxRetries(maxRetries: number): void {
		this.maxRetries = maxRetries;
	}
}
