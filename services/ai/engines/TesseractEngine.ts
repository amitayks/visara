import TesseractOcr from "@onlytabs/react-native-tesseract-ocr";
import type {
	LocalOCREngine,
	OCRBlock,
	OCREngineName,
	OCRResult,
} from "../ocrTypes";

export class TesseractEngine implements LocalOCREngine {
	name: OCREngineName = "tesseract";
	displayName = "Tesseract OCR";
	private initialized = false;
	private tessDataPath: string | null = null;

	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			console.log("Initializing Tesseract engine...");

			// Tesseract is ready to use after installation
			this.tessDataPath = "eng";

			this.initialized = true;
			console.log("Tesseract engine initialized successfully");
		} catch (error) {
			console.error("Failed to initialize Tesseract:", error);
			throw error;
		}
	}

	async processImage(imageUri: string): Promise<OCRResult> {
		if (!this.initialized) {
			await this.initialize();
		}

		const startTime = Date.now();

		try {
			console.log(`Processing image with Tesseract: ${imageUri}`);

			// Configure Tesseract options for better accuracy
			const options = {
				whitelist: null, // All characters allowed
				blacklist: null,
			};

			// Perform OCR with English language
			const text = await TesseractOcr.recognize(imageUri, "eng", options);

			const processingTime = Date.now() - startTime;
			console.log(`Tesseract processing completed in ${processingTime}ms`);

			// Create text blocks from the result
			const blocks: OCRBlock[] = this.createTextBlocks(text);

			return {
				text: text.trim(),
				blocks,
				confidence: 0.85, // Tesseract doesn't provide overall confidence, using default
				engine: "tesseract",
				language: "en",
				processingTime,
			};
		} catch (error) {
			console.error("Tesseract processing error:", error);
			throw new Error(
				`Tesseract OCR failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private createTextBlocks(text: string): OCRBlock[] {
		// Split text into paragraphs/blocks
		const paragraphs = text.split(/\n\s*\n/);
		const blocks: OCRBlock[] = [];

		let yOffset = 0;
		paragraphs.forEach((paragraph, index) => {
			if (paragraph.trim()) {
				blocks.push({
					text: paragraph.trim(),
					confidence: 0.85, // Default confidence
					boundingBox: {
						text: paragraph.trim(),
						x: 0,
						y: yOffset,
						width: 100, // Placeholder values
						height: 50,
						confidence: 0.85,
					},
					language: "en",
				});
				yOffset += 60;
			}
		});

		return blocks;
	}

	supportsLanguage(lang: string): boolean {
		// Only support English
		return lang.toLowerCase() === "en" || lang.toLowerCase() === "eng";
	}

	getSupportedLanguages(): string[] {
		return ["en"];
	}

	async cleanup(): Promise<void> {
		this.initialized = false;
		console.log("Tesseract engine cleaned up");
	}

	isInitialized(): boolean {
		return this.initialized;
	}
}

export const tesseractEngine = new TesseractEngine();
