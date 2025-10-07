/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */
import TextRecognition from "@react-native-ml-kit/text-recognition";

export interface TextRecognitionResult {
	text: string;
	blocks: string;
	processingTime: number;
}

export class TextRecognitionService {
	static async extractText(imageUri: string): Promise<TextRecognitionResult> {
		const startTime = Date.now();

		try {
			const result = await TextRecognition.recognize(imageUri);

			const processingTime = Date.now() - startTime;

			return {
				text: result.text,
				blocks: JSON.stringify(result.blocks),
				processingTime,
			};
		} catch (error) {
			console.error("TextRecognitionService.extractText error:", error);
			throw new Error(
				`Failed to extract text from image: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	static hasText(result: TextRecognitionResult): boolean {
		return result.text.trim().length > 0;
	}
}
