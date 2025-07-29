import { HebrewPatterns } from "../hebrewPatterns";
import type { LocalOCREngine, OCRBlock, OCRResult } from "../ocrTypes";

export class MockEngine implements LocalOCREngine {
	name = "mock" as const;
	displayName = "Mock OCR (Demo)";
	private initialized = false;

	private mockTexts = {
		hebrew: {
			receipt: `סופר-פארם בע"מ
רח' דיזנגוף 50, תל אביב
ח.פ. 511234567
עוסק מורשה: 123456789

חשבונית מס קבלה
מספר: 2024001234
תאריך: 15/01/2024

פריטים:
אקמול 500 מ"ג - 2 יח' x ₪25.90 = ₪51.80
ויטמין D - 1 יח' x ₪89.90 = ₪89.90
משחת שיניים - 1 יח' x ₪15.90 = ₪15.90

סה"כ לפני מע"מ: ₪135.00
מע"מ 17%: ₪22.60
סה"כ לתשלום: ₪157.60

תודה על קנייתך!
טל: 03-1234567`,
			invoice: `חברת הייטק בע"מ
רח' הרצל 123, רמת גן
ח.פ. 987654321

חשבונית מס
מספר: INV-2024-001
תאריך: 20 בינואר 2024

לכבוד:
חברת לקוח בע"מ
רח' רוטשילד 1, תל אביב

שירותי פיתוח תוכנה - ינואר 2024
160 שעות x ₪350 = ₪56,000

סה"כ: ₪56,000
מע"מ 17%: ₪9,520
סה"כ כולל מע"מ: ₪65,520

תנאי תשלום: שוטף + 30`,
		},
		english: {
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
		},
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
		return ["en", "he"].includes(lang.toLowerCase());
	}

	getSupportedLanguages(): string[] {
		return ["en", "he"];
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
		const isHebrew = Math.random() > 0.5;
		const isReceipt = Math.random() > 0.5;
		const mockText = isHebrew
			? isReceipt
				? this.mockTexts.hebrew.receipt
				: this.mockTexts.hebrew.invoice
			: isReceipt
				? this.mockTexts.english.receipt
				: this.mockTexts.english.invoice;

		// Create blocks from lines
		const lines = mockText.split("\n").filter((line) => line.trim());
		const blocks: OCRBlock[] = lines.map((line, index) => {
			const isRTL = HebrewPatterns.getTextDirection(line) === "rtl";
			const hasHebrew = HebrewPatterns.isHebrewText(line);

			return {
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
				isRTL,
				language: hasHebrew ? "he" : "en",
			};
		});

		const languages = isHebrew ? ["he"] : ["en"];
		const processingTime = Date.now() - startTime;

		return {
			text: mockText,
			confidence: 0.88,
			blocks,
			languages,
			processingTime,
			engineName: this.name,
			memoryUsage: this.getMemoryUsage(),
		};
	}

	getMemoryUsage(): number {
		// Mock engine uses minimal memory
		return 5 * 1024 * 1024; // 5MB
	}
}
