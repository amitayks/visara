import TextRecognition, {
	TextRecognitionScript,
} from "@react-native-ml-kit/text-recognition";
import { HebrewPatterns } from "../hebrewPatterns";
import { ImagePreprocessor } from "../imagePreprocessor";
import type { LocalOCREngine, OCRBlock, OCRResult } from "../ocrTypes";

export class MLKitEngine implements LocalOCREngine {
	name = "mlkit" as const;
	displayName = "ML Kit Text Recognition";
	private initialized = false;
	private supportedLanguages = ["en", "he", "ar", "hi", "ja", "ko", "zh"];

	async initialize(): Promise<void> {
		try {
			// ML Kit initializes automatically on first use
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
		return this.supportedLanguages.includes(lang.toLowerCase());
	}

	getSupportedLanguages(): string[] {
		return [...this.supportedLanguages];
	}

	async processImage(uri: string): Promise<OCRResult> {
		const startTime = Date.now();
		let processedUri = uri;

		if (!this.initialized) {
			await this.initialize();
		}

		try {
			// Convert file URI to proper format if needed
			// If the URI doesn't start with file:// or content://, add file:// prefix
			if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http')) {
				processedUri = `file://${uri}`;
			}

			console.log(`ML Kit processing image - Original: ${uri}, Processed: ${processedUri}`);

			// Use Latin script recognizer for mixed Hebrew/English text
			// ML Kit's Latin recognizer actually supports Hebrew as well
			const result = await TextRecognition.recognize(processedUri);

			// Process blocks
			const blocks: OCRBlock[] = [];
			const detectedLanguages = new Set<string>();
			let totalConfidence = 0;
			let blockCount = 0;

			for (const block of result.blocks) {
				const blockText = block.text;

				// Detect text direction and language
				const isRTL = HebrewPatterns.getTextDirection(blockText) === "rtl";
				const hasHebrew = HebrewPatterns.isHebrewText(blockText);

				if (hasHebrew) {
					detectedLanguages.add("he");
				}
				if (/[a-zA-Z]/.test(blockText)) {
					detectedLanguages.add("en");
				}

				// Calculate block confidence (ML Kit doesn't provide confidence, so we estimate)
				const blockConfidence = this.estimateConfidence(blockText, block);
				totalConfidence += blockConfidence;
				blockCount++;

				const ocrBlock: OCRBlock = {
					text: blockText,
					confidence: blockConfidence,
					boundingBox: {
						text: blockText,
						x: block.frame ? (block.frame as any).x || 0 : 0,
						y: block.frame ? (block.frame as any).y || 0 : 0,
						width: block.frame ? block.frame.width || 0 : 0,
						height: block.frame ? block.frame.height || 0 : 0,
						confidence: blockConfidence,
					},
					isRTL,
					language: hasHebrew ? "he" : "en",
				};

				blocks.push(ocrBlock);
			}

			const overallConfidence =
				blockCount > 0 ? totalConfidence / blockCount : 0;
			const processingTime = Date.now() - startTime;

			return {
				text: result.text,
				confidence: overallConfidence,
				blocks,
				languages: Array.from(detectedLanguages),
				processingTime,
				engineName: this.name,
				memoryUsage: this.getMemoryUsage(),
			};
		} catch (error: any) {
			console.error("ML Kit OCR error:", error);
			console.error("Error processing with mlkit:", error);
			
			// If it's a file access error, try to provide more helpful error message
			if (error?.message && error.message.includes('No content provider')) {
				const newError = new Error(
					`ML Kit cannot access the image file. This might be due to:\n` +
					`1. File permissions\n` +
					`2. Cached file path not accessible\n` +
					`3. File has been moved or deleted\n` +
					`Original URI: ${uri}\n` +
					`Processed URI: ${processedUri}\n` +
					`Original error: ${error.message}`
				);
				throw newError;
			}
			
			throw error;
		}
	}

	private estimateConfidence(text: string, block: any): number {
		// Estimate confidence based on text characteristics
		let confidence = 0.7; // Base confidence

		// Check text length
		if (text.length > 3) {
			confidence += 0.1;
		}

		// Check for valid characters
		const validCharRatio = this.getValidCharacterRatio(text);
		confidence += validCharRatio * 0.2;

		// Check block size (very small blocks might be noise)
		const blockArea = block.frame.width * block.frame.height;
		if (blockArea > 100) {
			confidence += 0.05;
		}

		// Cap confidence at 0.95
		return Math.min(confidence, 0.95);
	}

	private getValidCharacterRatio(text: string): number {
		// Count valid characters (letters, numbers, common punctuation)
		const validPattern = /[\u0590-\u05FF\u0600-\u06FFa-zA-Z0-9\s.,!?;:'"()-]/g;
		const validChars = (text.match(validPattern) || []).length;
		return text.length > 0 ? validChars / text.length : 0;
	}

	getMemoryUsage(): number {
		// Estimate memory usage (ML Kit manages its own memory)
		// Return a rough estimate based on image processing
		return 50 * 1024 * 1024; // ~50MB estimate
	}
}
