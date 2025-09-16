import { ocrEngineManager } from "./OCREngineManager";
import { visualDocumentDetector } from "./visualDocumentDetector";
import { keywordExtractor } from "./keywordExtractor";
import type { OCRResult } from "./ocrTypes";

export interface SimpleProcessedDocument {
	id: string;
	imageUri: string;
	imageHash: string;
	ocrText: string;
	documentType: "receipt" | "invoice" | "id" | "letter" | "form" | "screenshot" | "unknown";
	confidence: number;
	processedAt: Date;
	keywords: string[];
	metadata: {
		vendor?: string;
		totalAmount?: number;
		currency?: string;
		date?: Date;
		language?: string;
	};
	// Simplified - no search vector needed for Phase 1
	imageWidth?: number;
	imageHeight?: number;
	imageSize?: number;
	imageTakenDate?: Date;
}

export class SimpleDocumentProcessor {
	private initialized = false;

	async initialize(): Promise<void> {
		if (this.initialized) return;
		
		try {
			// Only need to initialize OCR engine (MLKit)
			await ocrEngineManager.initialize();
			this.initialized = true;
			console.log("[SimpleDocumentProcessor] Initialized successfully");
		} catch (error) {
			console.error("[SimpleDocumentProcessor] Initialization failed:", error);
			throw error;
		}
	}

	async process(imageUri: string): Promise<SimpleProcessedDocument | null> {
		if (!this.initialized) {
			await this.initialize();
		}

		try {
			console.log("[SimpleDocumentProcessor] Starting processing:", imageUri);

			// 1. Visual document check (existing)
			const visualResult = await visualDocumentDetector.detectDocument(imageUri);
			
			// Reject if not likely a document (more selective threshold)
			if (visualResult.overallScore < 0.5) {
				console.log(`[SimpleDocumentProcessor] Document rejected: low visual score ${visualResult.overallScore.toFixed(2)}`);
				return null;
			}

			// 2. OCR with MLKit (Hebrew + English support)
			const ocrResult: OCRResult = await ocrEngineManager.processImage(imageUri, "mlkit");
			
			// Reject if no meaningful text found
			if (!ocrResult.text || ocrResult.text.trim().length < 10) {
				console.log("[SimpleDocumentProcessor] Document rejected: insufficient text");
				return null;
			}

			// 3. Simple rule-based extraction (no LLM needed)
			const documentType = this.classifyDocument(ocrResult.text);
			const amount = this.extractAmount(ocrResult.text);
			const vendor = this.extractVendor(ocrResult.text);
			const date = this.extractDate(ocrResult.text);
			const keywords = keywordExtractor.extractKeywords(ocrResult.text);

			// Generate document ID and hash (simplified)
			const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const imageHash = `hash_${Date.now()}`; // Simplified hash

			const result: SimpleProcessedDocument = {
				id: documentId,
				imageUri,
				imageHash,
				ocrText: ocrResult.text,
				documentType,
				confidence: Math.max(visualResult.overallScore, ocrResult.confidence / 100),
				processedAt: new Date(),
				keywords: keywords.slice(0, 15), // Limit keywords
				metadata: {
					vendor,
					totalAmount: amount?.value,
					currency: amount?.currency,
					date,
					language: ocrResult.language || "auto",
				},
			};

			console.log(`[SimpleDocumentProcessor] Successfully processed:`, {
			documentType: documentType,
			keywordCount: keywords.length,
			confidence: Math.max(visualResult.overallScore, ocrResult.confidence / 100),
			language: ocrResult.language,
			vendor: vendor,
			amount: amount?.value,
			currency: amount?.currency,
			hasDate: !!date,
			ocrTextLength: ocrResult.text.length
		});
			return result;

		} catch (error) {
			console.error("[SimpleDocumentProcessor] Processing failed:", error);
			return null;
		}
	}

	// Simple rule-based document classification
	private classifyDocument(text: string): SimpleProcessedDocument["documentType"] {
		const lowerText = text.toLowerCase();
		console.log(`[SimpleDocumentProcessor] Classifying document with ${text.length} chars, Hebrew: ${/[\u0590-\u05FF]/.test(text)}, English: ${/[A-Za-z]/.test(text)}`);

		// Receipt indicators (English and Hebrew)
		if (
			lowerText.includes("receipt") ||
			lowerText.includes("קבלה") ||
			lowerText.includes("total") ||
			lowerText.includes("סה״כ") ||
			lowerText.includes("סהכ") ||
			lowerText.includes("סך הכל") ||
			lowerText.includes("change") ||
			lowerText.includes("עודף") ||
			lowerText.includes("קיט") || // Kassit (receipt in Hebrew)
			lowerText.includes("חשבון") // Bill in Hebrew
		) {
			console.log(`[SimpleDocumentProcessor] Classified as RECEIPT`);
			return "receipt";
		}

		// Invoice indicators (English and Hebrew)
		if (
			lowerText.includes("invoice") ||
			lowerText.includes("חשבונית") ||
			lowerText.includes("bill") ||
			lowerText.includes("payment due") ||
			lowerText.includes("עסקה") ||
			lowerText.includes("חשבון עסקה") ||
			lowerText.includes("מס חשבונית") // Tax invoice
		) {
			console.log(`[SimpleDocumentProcessor] Classified as INVOICE`);
			return "invoice";
		}

		// ID document indicators
		if (
			lowerText.includes("id") ||
			lowerText.includes("identity") ||
			lowerText.includes("תעודת זהות") ||
			lowerText.includes("passport") ||
			lowerText.includes("דרכון") ||
			lowerText.includes("license") ||
			lowerText.includes("רישיון")
		) {
			return "id";
		}

		// Form indicators
		if (
			lowerText.includes("form") ||
			lowerText.includes("application") ||
			lowerText.includes("טופס") ||
			lowerText.includes("בקשה")
		) {
			return "form";
		}

		// Letter indicators
		if (
			lowerText.includes("dear") ||
			lowerText.includes("sincerely") ||
			lowerText.includes("regards") ||
			lowerText.includes("נכבד") ||
			lowerText.includes("בברכה")
		) {
			return "letter";
		}

		console.log(`[SimpleDocumentProcessor] Classified as UNKNOWN`);
		return "unknown";
	}

	// Simple amount extraction using regex
	private extractAmount(text: string): { value: number; currency: string } | null {
		// Try different currency patterns (English and Hebrew)
		const patterns = [
			// Shekel patterns
			/(?:₪|שקל|nis|שח)\s*([0-9,]+\.?[0-9]*)/i,
			/([0-9,]+\.?[0-9]*)\s*(?:₪|שקל|nis|שח)/i,
			// Dollar patterns
			/\$\s*([0-9,]+\.?[0-9]*)/i,
			/([0-9,]+\.?[0-9]*)\s*\$/i,
			// Euro patterns
			/€\s*([0-9,]+\.?[0-9]*)/i,
			/([0-9,]+\.?[0-9]*)\s*€/i,
			// Generic number patterns with context
			/total\s*:?\s*([0-9,]+\.?[0-9]*)/i,
			/סה״כ\s*:?\s*([0-9,]+\.?[0-9]*)/i,
			/סהכ\s*:?\s*([0-9,]+\.?[0-9]*)/i,
			/סך הכל\s*:?\s*([0-9,]+\.?[0-9]*)/i,
			/לתשלום\s*:?\s*([0-9,]+\.?[0-9]*)/i, // "To pay" in Hebrew
		];

		for (const pattern of patterns) {
			const match = text.match(pattern);
			if (match) {
				const amount = parseFloat(match[1].replace(/,/g, ""));
				if (!isNaN(amount) && amount > 0) {
					// Determine currency (Hebrew and English)
					let currency = "ILS"; // Default for Israel
					if (text.includes("$")) currency = "USD";
					else if (text.includes("€")) currency = "EUR";
					else if (text.includes("₪") || text.includes("שקל") || text.includes("שח") || text.includes("nis")) currency = "ILS";

					console.log(`[SimpleDocumentProcessor] Found amount: ${amount} ${currency} (pattern: ${pattern})`);
					return { value: amount, currency };
				}
			}
		}

		return null;
	}

	// Simple vendor extraction
	private extractVendor(text: string): string | undefined {
		const lines = text.split("\n").filter(line => line.trim().length > 0);
		
		// Usually vendor name is in the first few lines
		for (let i = 0; i < Math.min(3, lines.length); i++) {
			const line = lines[i].trim();
			
			// Skip lines that look like addresses or phone numbers
			if (
				line.match(/^\d+/) || // Starts with number
				line.includes("@") || // Email
				line.match(/\d{3}-\d{3}-\d{4}/) || // Phone
				line.length < 3 || // Too short
				line.length > 50 // Too long
			) {
				continue;
			}

			// This line might be the vendor name (Hebrew or English)
			if (line.match(/[א-ת]/) || line.match(/[a-zA-Z]/)) {
				console.log(`[SimpleDocumentProcessor] Found potential vendor: "${line}"`);
				return line.substring(0, 30); // Limit length
			}
		}

		return undefined;
	}

	// Simple date extraction
	private extractDate(text: string): Date | undefined {
		const datePatterns = [
			// DD/MM/YYYY or DD-MM-YYYY
			/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
			// MM/DD/YYYY
			/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
			// YYYY-MM-DD
			/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
		];

		for (const pattern of datePatterns) {
			const match = text.match(pattern);
			if (match) {
				try {
					// Try different date formats
					const date1 = new Date(`${match[3]}-${match[2]}-${match[1]}`); // DD/MM/YYYY
					const date2 = new Date(`${match[3]}-${match[1]}-${match[2]}`); // MM/DD/YYYY
					
					// Return the date that seems more reasonable (not in the future, not too old)
					const now = new Date();
					const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
					
					if (date1 >= twoYearsAgo && date1 <= now) return date1;
					if (date2 >= twoYearsAgo && date2 <= now) return date2;
				} catch (error) {
					// Invalid date, continue
				}
			}
		}

		return undefined;
	}

	// Get processing stats (simplified)
	getStats() {
		return {
			engineCount: 1, // Only MLKit
			memoryUsage: ocrEngineManager.getMemoryUsage(),
			initialized: this.initialized,
		};
	}

	async cleanup(): Promise<void> {
		await ocrEngineManager.cleanup();
		this.initialized = false;
		console.log("[SimpleDocumentProcessor] Cleanup completed");
	}
}

// Export singleton instance
export const simpleDocumentProcessor = new SimpleDocumentProcessor();