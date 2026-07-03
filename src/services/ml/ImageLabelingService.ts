/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */
import {
	type ClassificationModelName,
	ClassificationModule,
	isAvailable,
	models,
} from "react-native-executorch";

export interface ImageLabel {
	text: string;
	confidence: number;
	index: number;
}

export interface ImageLabelingResult {
	labels: ImageLabel[];
	processingTime: number;
}

export class ImageLabelingService {
	private static readonly MIN_CONFIDENCE = 0.5;

	/**
	 * Lazily-loaded, memoized executorch classification module
	 * (`efficientnet-v2-s`, ImageNet-1k). Same concurrency/retry memo as the OCR
	 * service (design D3): concurrent calls await the same promise; a rejected
	 * load clears the memo so a later call can retry.
	 */
	private static modulePromise: Promise<
		ClassificationModule<ClassificationModelName>
	> | null = null;

	private static loadModule(): Promise<
		ClassificationModule<ClassificationModelName>
	> {
		if (!this.modulePromise) {
			// Force the XNNPACK backend for simulator safety (design D8); CoreML on
			// the iOS simulator can be unreliable. On-device iOS may switch to CoreML
			// for speed once the POC measures latency.
			this.modulePromise = ClassificationModule.fromModelName(
				models.classification.efficientnet_v2_s({ backend: "xnnpack" }),
			).catch((error: unknown) => {
				// Clear the memo so a later call can retry the load.
				this.modulePromise = null;
				throw error;
			});
		}
		return this.modulePromise;
	}

	static async processImage(imageUri: string): Promise<ImageLabelingResult> {
		const startTime = Date.now();

		if (!isAvailable) {
			throw new Error(
				"Image labeling unavailable: the ExecuTorch runtime is not available on this device",
			);
		}

		try {
			const classificationModule = await this.loadModule();
			const scores = await classificationModule.forward(imageUri);

			// `scores` is Record<label, confidence>. Keep labels >= MIN_CONFIDENCE,
			// rank by confidence (highest first), and index by rank (design D4).
			// POC-gated: threshold / top-k cap / index semantics are tuned from the
			// real ImageNet-1k output during the #4 POC run.
			const labels: ImageLabel[] = Object.entries(scores)
				.filter(([, confidence]) => confidence >= this.MIN_CONFIDENCE)
				.sort(([, a], [, b]) => b - a)
				.map(([text, confidence], index) => ({ text, confidence, index }));

			return {
				labels,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			console.error("ImageLabelingService.processImage error:", error);
			throw new Error(
				`Failed to process image labels: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	static setMinConfidence(minConfidence: number): void {
		if (minConfidence < 0 || minConfidence > 1) {
			throw new Error("Confidence must be between 0 and 1");
		}
		(this.MIN_CONFIDENCE as number) = minConfidence;
	}
}
