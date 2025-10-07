/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */
import ImageLabeling from "@react-native-ml-kit/image-labeling";

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

	static async processImage(imageUri: string): Promise<ImageLabelingResult> {
		const startTime = Date.now();

		try {
			const labels = await ImageLabeling.label(imageUri);

			const filteredLabels = labels
				.filter((label) => label.confidence >= this.MIN_CONFIDENCE)
				.map((label) => ({
					text: label.text,
					confidence: label.confidence,
					index: label.index,
				}));

			const processingTime = Date.now() - startTime;

			return {
				labels: filteredLabels,
				processingTime,
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
