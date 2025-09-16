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
		const supportedLangs = ["en", "he", "auto"];
		return supportedLangs.includes(lang.toLowerCase());
	}

	getSupportedLanguages(): string[] {
		return ["en", "he", "auto"];
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

			// Use MLKit with automatic language detection (supports Hebrew + English)
			const result = await TextRecognition.recognize(processedUri);

			// Detect language from text content
			const detectedLanguage = this.detectLanguage(result.text);
			
			console.log(`[MLKitEngine] OCR Results:`, {
				textLength: result.text.length,
				detectedLanguage: detectedLanguage,
				blockCount: result.blocks.length,
				hasHebrew: /[\u0590-\u05FF]/.test(result.text),
				hasEnglish: /[A-Za-z]/.test(result.text),
				firstFewChars: result.text.substring(0, 50)
			});
			
			// Process blocks
			const blocks: OCRBlock[] = result.blocks.map((block) => ({
				text: block.text,
				confidence: 0.9, // MLKit provides good confidence
				boundingBox: {
					text: block.text,
					x: block.frame?.left || 0,
					y: block.frame?.top || 0,
					width: block.frame?.width || 0,
					height: block.frame?.height || 0,
					confidence: 0.9,
				},
				language: detectedLanguage,
			}));

			return {
				text: result.text,
				blocks,
				confidence: 0.9,
				language: detectedLanguage,
				processingTime: Date.now() - startTime,
				engine: this.name,
			};
		} catch (error) {
			console.error("ML Kit processing failed:", error);
			throw error;
		}
	}

	private detectLanguage(text: string): string {
		// Simple language detection based on character patterns
		const hebrewPattern = /[\u0590-\u05FF]/; // Hebrew Unicode range
		const englishPattern = /[A-Za-z]/;
		
		const hasHebrew = hebrewPattern.test(text);
		const hasEnglish = englishPattern.test(text);
		
		if (hasHebrew && hasEnglish) {
			return "auto"; // Mixed languages
		} else if (hasHebrew) {
			return "he"; // Hebrew
		} else if (hasEnglish) {
			return "en"; // English
		} else {
			return "auto"; // Unknown, let MLKit decide
		}
	}
}
