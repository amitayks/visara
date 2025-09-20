// services/processing/DocumentProcessor.ts
// Simplified document processing with OCR

import { ocrEngineManager } from "../ai/OCREngineManager";
import { keywordExtractor } from "../ai/keywordExtractor";
import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";
import { Image } from "react-native";

export interface ProcessedDocument {
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
	imageWidth?: number;
	imageHeight?: number;
	imageSize?: number;
	imageTakenDate?: Date;
}

class DocumentProcessor {
	private static instance: DocumentProcessor;
	private initialized = false;
	private processingLock = new Set<string>();

	private constructor() {}

	static getInstance(): DocumentProcessor {
		if (!DocumentProcessor.instance) {
			DocumentProcessor.instance = new DocumentProcessor();
		}
		return DocumentProcessor.instance;
	}

	/**
	 * Initialize the processor
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			await ocrEngineManager.initialize();
			this.initialized = true;
			console.log("[DocumentProcessor] Initialized");
		} catch (error) {
			console.error("[DocumentProcessor] Initialization failed:", error);
			throw error;
		}
	}

	/**
	 * Process a document image
	 */
	async process(imageUri: string): Promise<ProcessedDocument | null> {
		// Prevent duplicate processing
		if (this.processingLock.has(imageUri)) {
			console.log("[DocumentProcessor] Already processing:", imageUri);
			return null;
		}

		this.processingLock.add(imageUri);

		try {
			if (!this.initialized) {
				await this.initialize();
			}

			console.log("[DocumentProcessor] Processing:", imageUri.split("/").pop());

			// Get image metadata
			const metadata = await this.getImageMetadata(imageUri);

			// Generate hash for deduplication
			const imageHash = await this.generateImageHash(imageUri);

			// Perform OCR
			const ocrResult = await ocrEngineManager.processImage(imageUri, "mlkit");

			// Check if meaningful text was found
			if (!ocrResult.text || ocrResult.text.trim().length < 10) {
				console.log("[DocumentProcessor] Insufficient text found");
				return null;
			}

			// Extract keywords
			const keywords = keywordExtractor.extractKeywords(ocrResult.text, 10);

			// Detect document type
			const documentType = this.detectDocumentType(ocrResult.text, keywords);

			// Extract structured data
			const extractedData = this.extractStructuredData(
				ocrResult.text,
				documentType,
			);

			// Create processed document
			const processedDoc: ProcessedDocument = {
				id: this.generateDocumentId(),
				imageUri,
				imageHash,
				ocrText: ocrResult.text,
				documentType,
				confidence: ocrResult.confidence || 0.8,
				processedAt: new Date(),
				keywords,
				metadata: {
					...extractedData,
					language: ocrResult.language || "en",
				},
				...metadata,
			};

			console.log("[DocumentProcessor] ✅ Processed successfully:", {
				type: documentType,
				keywords: keywords.slice(0, 3),
				textLength: ocrResult.text.length,
			});

			return processedDoc;
		} catch (error) {
			console.error("[DocumentProcessor] Processing failed:", error);
			return null;
		} finally {
			this.processingLock.delete(imageUri);
		}
	}

	/**
	 * Get image metadata
	 */
	private async getImageMetadata(uri: string): Promise<{
		imageWidth?: number;
		imageHeight?: number;
		imageSize?: number;
		imageTakenDate?: Date;
	}> {
		try {
			// Get dimensions
			const dimensions = await new Promise<{ width: number; height: number }>(
				(resolve, reject) => {
					Image.getSize(
						uri,
						(width, height) => resolve({ width, height }),
						reject,
					);
				},
			);

			// Get file stats
			const filePath = uri.replace("file://", "");
			const stats = await RNFS.stat(filePath);

			return {
				imageWidth: dimensions.width,
				imageHeight: dimensions.height,
				imageSize: stats.size,
				imageTakenDate: new Date(stats.mtime),
			};
		} catch (error) {
			console.error("[DocumentProcessor] Failed to get metadata:", error);
			return {};
		}
	}

	/**
	 * Generate hash for image deduplication
	 */
	private async generateImageHash(uri: string): Promise<string> {
		try {
			const filePath = uri.replace("file://", "");
			const stats = await RNFS.stat(filePath);

			// Use file size and modification time for quick hash
			const hashInput = `${stats.size}-${stats.mtime}`;
			return CryptoJS.MD5(hashInput).toString();
		} catch (error) {
			// Fallback to URI hash
			return CryptoJS.MD5(uri).toString();
		}
	}

	/**
	 * Detect document type from text
	 */
	private detectDocumentType(text: string, keywords: string[]): "receipt" | "invoice" | "id" | "letter" | "form" | "screenshot" | "unknown" {
		const textLower = text.toLowerCase();
		const keywordsLower = keywords.map((k) => k.toLowerCase());

		// Receipt indicators
		if (
			this.containsAny(textLower, [
				"receipt",
				"total",
				"subtotal",
				"tax",
				"payment",
			]) ||
			this.arrayContainsAny(keywordsLower, ["receipt", "total", "paid"])
		) {
			return "receipt";
		}

		// Invoice indicators
		if (
			this.containsAny(textLower, [
				"invoice",
				"bill",
				"amount due",
				"billing",
			]) ||
			this.arrayContainsAny(keywordsLower, ["invoice", "billing"])
		) {
			return "invoice";
		}

		// ID/License indicators
		if (
			this.containsAny(textLower, [
				"license",
				"identification",
				"id card",
				"passport",
				"driver",
			]) ||
			this.arrayContainsAny(keywordsLower, ["license", "identification"])
		) {
			return "id";
		}

		// Letter/Email indicators
		if (
			this.containsAny(textLower, [
				"dear",
				"sincerely",
				"regards",
				"to whom",
				"from:",
			]) ||
			this.arrayContainsAny(keywordsLower, ["letter", "email"])
		) {
			return "letter";
		}

		// Form indicators
		if (
			this.containsAny(textLower, [
				"form",
				"application",
				"fill",
				"sign",
				"date:",
			]) ||
			this.arrayContainsAny(keywordsLower, ["form", "application"])
		) {
			return "form";
		}

		// Screenshot indicators (social media, web pages)
		if (
			this.containsAny(textLower, [
				"screenshot",
				"like",
				"share",
				"comment",
				"posted",
				"http",
			])
		) {
			return "screenshot";
		}

		return "unknown";
	}

	/**
	 * Extract structured data based on document type
	 */
	private extractStructuredData(
		text: string,
		documentType: string,
	): {
		vendor?: string;
		totalAmount?: number;
		currency?: string;
		date?: Date;
	} {
		const result: any = {};

		// Extract vendor/company name
		const vendorMatch = text.match(/^([A-Z][A-Za-z\s&]+)\n/);
		if (vendorMatch) {
			result.vendor = vendorMatch[1].trim();
		}

		// Extract amounts (for receipts/invoices)
		if (documentType === "receipt" || documentType === "invoice") {
			// Look for total amount
			const amountPatterns = [
				/(?:total|amount|sum)[:\s]+[$€£¥₹]\s?([\d,]+\.?\d*)/i,
				/[$€£¥₹]\s?([\d,]+\.?\d*)/,
				/([\d,]+\.?\d*)\s*(?:USD|EUR|GBP|INR)/i,
			];

			for (const pattern of amountPatterns) {
				const match = text.match(pattern);
				if (match) {
					result.totalAmount = parseFloat(match[1].replace(/,/g, ""));
					break;
				}
			}

			// Detect currency
			if (text.includes("$")) result.currency = "USD";
			else if (text.includes("€")) result.currency = "EUR";
			else if (text.includes("£")) result.currency = "GBP";
			else if (text.includes("₹")) result.currency = "INR";
		}

		// Extract date
		const datePatterns = [
			/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
			/(\d{4}[/-]\d{1,2}[/-]\d{1,2})/,
			/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{2,4}/i,
		];

		for (const pattern of datePatterns) {
			const match = text.match(pattern);
			if (match) {
				const parsedDate = new Date(match[1]);
				if (!isNaN(parsedDate.getTime())) {
					result.date = parsedDate;
					break;
				}
			}
		}

		return result;
	}

	/**
	 * Helper to check if text contains any of the keywords
	 */
	private containsAny(text: string, keywords: string[]): boolean {
		return keywords.some((keyword) => text.includes(keyword));
	}

	private arrayContainsAny(textArray: string[], keywords: string[]): boolean {
		return textArray.some((text) => keywords.some((keyword) => text.includes(keyword)));
	}

	/**
	 * Generate unique document ID
	 */
	private generateDocumentId(): string {
		return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}

// Export singleton instance
export const documentProcessor = DocumentProcessor.getInstance();
