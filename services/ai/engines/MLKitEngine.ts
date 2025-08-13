import TextRecognition from "@react-native-ml-kit/text-recognition";
import { ImagePreprocessor } from "../imagePreprocessor";
import type { LocalOCREngine, OCRBlock, OCRResult } from "../ocrTypes";

export class MLKitEngine implements LocalOCREngine {
	name = "mlkit" as const;
	displayName = "ML Kit Text Recognition";
	private initialized = false;

	async initialize(): Promise<void> {
		try {
			this.initialized = true;
			await ImagePreprocessor.initialize();
		} catch (error) {
			console.error("Failed to initialize ML Kit:", error);
			throw error;
		}
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	supportsLanguage(lang: string): boolean {
		return lang.toLowerCase() === "en";
	}

	getSupportedLanguages(): string[] {
		return ["en"];
	}

	async processImage(uri: string): Promise<OCRResult> {
		const startTime = Date.now();

		if (!this.initialized) {
			await this.initialize();
		}

		try {
			// Fix URI format
			let processedUri = uri;
			if (!uri.startsWith("file://") && !uri.startsWith("content://")) {
				processedUri = `file://${uri}`;
			}

			// Simple recognition for English only
			const result = await TextRecognition.recognize(processedUri);

			// Process blocks
			const blocks: OCRBlock[] = result.blocks.map((block) => ({
				text: block.text,
				confidence: 0.9, // Default high confidence for English
				boundingBox: {
					text: block.text,
					x: block.frame?.left || 0,
					y: block.frame?.top || 0,
					width: block.frame?.width || 0,
					height: block.frame?.height || 0,
					confidence: 0.9,
				},
				language: "en",
			}));

			return {
				text: result.text,
				blocks,
				confidence: 0.9,
				language: "en",
				processingTime: Date.now() - startTime,
				engine: this.name,
			};
		} catch (error) {
			console.error("ML Kit processing failed:", error);
			throw error;
		}
	}
}
