import type { LocalOCREngine, OCRBlock, OCRResult } from "../ocrTypes";

export class MockEngine implements LocalOCREngine {
	name = "mock" as const;
	displayName = "Mock OCR (Demo)";
	private initialized = false;

	private mockTexts = {
		receipt: `SUPERMARKET CHAIN
123 Main Street, New York
Tax ID: 12-3456789

RECEIPT
Date: 01/15/2024
Trans: 001234

Items:
Milk 1L - 2x $3.99 = $7.98
Bread - 1x $2.49 = $2.49
Eggs dozen - 1x $4.99 = $4.99

Subtotal: $15.46
Tax (8%): $1.24
Total: $16.70

Thank you for shopping!`,
		
		invoice: `TECH SOLUTIONS INC.
456 Tech Park Ave
San Francisco, CA 94105

INVOICE #2024-001
Date: January 20, 2024

Bill To:
Customer Corp
789 Business Blvd
New York, NY 10001

Software Development Services
40 hours @ $150/hr = $6,000

Subtotal: $6,000
Tax (8.5%): $510
Total Due: $6,510

Terms: Net 30`,
	};

	async initialize(): Promise<void> {
		// Simulate initialization delay
		await new Promise((resolve) => setTimeout(resolve, 100));
		this.initialized = true;
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	supportsLanguage(lang: string): boolean {
		return lang.toLowerCase() === 'en';
	}

	getSupportedLanguages(): string[] {
		return ['en'];
	}

	async processImage(uri: string): Promise<OCRResult> {
		const startTime = Date.now();

		if (!this.initialized) {
			await this.initialize();
		}

		// Simulate processing delay
		await new Promise((resolve) =>
			setTimeout(resolve, 300 + Math.random() * 700),
		);

		// Randomly select a mock text
		const isReceipt = Math.random() > 0.5;
		const mockText = isReceipt ? this.mockTexts.receipt : this.mockTexts.invoice;

		// Create blocks from lines
		const lines = mockText.split("\n").filter((line) => line.trim());
		const blocks: OCRBlock[] = lines.map((line, index) => ({
			text: line,
			confidence: 0.85 + Math.random() * 0.1, // 85-95% confidence
			boundingBox: {
				text: line,
				x: 10,
				y: 10 + index * 30,
				width: 300,
				height: 25,
				confidence: 0.9,
			},
			language: 'en',
		}));

		const processingTime = Date.now() - startTime;

		return {
			text: mockText,
			confidence: 0.88,
			blocks,
			language: 'en',
			processingTime,
			engine: this.name,
		};
	}
}