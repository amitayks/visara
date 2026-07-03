import type { ImageLabelingResult } from "../ImageLabelingService";
import { ImageLabelingService } from "../ImageLabelingService";
import type { ProcessingResult } from "../ProcessingService";
import type { TextRecognitionResult } from "../TextRecognitionService";
import { TextRecognitionService } from "../TextRecognitionService";
import type { AnalysisEngineDescriptor } from "./AnalysisEngine";

export class MlKitEngine {
	static readonly descriptor: AnalysisEngineDescriptor = {
		id: "mlkit",
		tier: "tier0",
		capabilities: ["labels", "ocr"],
	};

	static async analyze(imageUri: string): Promise<ProcessingResult> {
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
			console.error("MlKitEngine.analyze error:", error);

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
}
