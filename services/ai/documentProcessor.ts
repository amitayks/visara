import ImageResizer from "@bam.tech/react-native-image-resizer";
import RNFS from "react-native-fs";
import { imageStorage } from "../imageStorage";
import { thumbnailService } from "../thumbnailService";
import { keywordExtractor } from "./keywordExtractor";
import { ocrEngineManager } from "./OCREngineManager";
import type { OCREngineName } from "./ocrTypes";

export interface DocumentResult {
	id: string;
	imageUri: string;
	thumbnailUri?: string;
	imageHash: string;
	ocrText: string;
	metadata: ExtractedMetadata;
	documentType:
		| "receipt"
		| "invoice"
		| "id"
		| "letter"
		| "form"
		| "screenshot"
		| "unknown";
	confidence: number;
	processedAt: Date;
	imageTakenDate?: Date;
	keywords: string[];
	searchVector: number[];
	imageWidth?: number;
	imageHeight?: number;
	imageSize?: number;
}

export interface ExtractedMetadata {
	vendor?: string;
	amounts?: Array<{
		value: number;
		currency: string;
		isTotal?: boolean;
	}>;
	items?: Array<{
		name: string;
		price?: number;
		quantity?: number;
	}>;
	dates?: Array<{
		date: Date;
		type: "transaction" | "due" | "issued" | "unknown";
	}>;
	location?: {
		address?: string;
		city?: string;
		country?: string;
	};
	hybridResult?: any; // Store the full hybrid processing result
	confidence: number;
}

export interface ProcessingOptions {
	preprocessImage?: boolean;
	extractStructuredData?: boolean;
	confidenceThreshold?: number;
	ocrEngine?: OCREngineName;
}

export class DocumentProcessor {
	private defaultOptions: ProcessingOptions = {
		preprocessImage: true,
		extractStructuredData: true,
		confidenceThreshold: 0.7,
		ocrEngine: "tesseract",
	};

	async processImage(
		imageUri: string,
		options: ProcessingOptions = {},
	): Promise<DocumentResult> {
		const opts = { ...this.defaultOptions, ...options };
		const startTime = Date.now();

		try {
			// Calculate image hash first for deduplication
			const imageHash = await thumbnailService.calculateImageHash(imageUri);

			// Get image info
			const imageInfo = await thumbnailService.getImageInfo(imageUri);

			// Copy original image to permanent storage
			const permanentImageUri = await imageStorage.copyImageToPermanentStorage(
				imageUri,
				imageHash,
			);

			// Create thumbnail
			let thumbnailUri: string | undefined;
			let permanentThumbnailUri: string | undefined;
			try {
				const thumbnailResult =
					await thumbnailService.createThumbnail(imageUri);
				thumbnailUri = thumbnailResult.thumbnailUri;
				// Copy thumbnail to permanent storage
				permanentThumbnailUri =
					await imageStorage.copyThumbnailToPermanentStorage(
						thumbnailUri,
						imageHash,
					);
				console.log(
					`Thumbnail created with ${(thumbnailResult.compressionRatio * 100).toFixed(1)}% size reduction`,
				);
			} catch (error) {
				console.error("Failed to create thumbnail:", error);
			}

			let processedImageUri = imageUri;

			// Skip preprocessing for ML Kit as it can handle original images better
			// and has issues with cached file paths
			if (opts.preprocessImage && opts.ocrEngine !== "mlkit") {
				processedImageUri = await this.preprocessImage(imageUri);
			}

			const ocrResult = await this.performOCR(
				processedImageUri,
				opts.ocrEngine,
			);

			const documentType = this.detectDocumentType(ocrResult.text);

			let metadata: ExtractedMetadata = { confidence: 0 };

			if (opts.extractStructuredData) {
				switch (documentType) {
					case "receipt":
						metadata = await this.extractReceiptMetadata(ocrResult.text);
						break;
					case "invoice":
						metadata = await this.extractInvoiceMetadata(ocrResult.text);
						break;
					default:
						metadata = await this.extractGenericMetadata(ocrResult.text);
				}
			}

			// Extract keywords and document date
			const keywords = keywordExtractor.extractKeywords(ocrResult.text);
			const documentDate = keywordExtractor.extractDocumentDate(ocrResult.text);

			// Generate search vector
			const searchVector = keywordExtractor.generateSearchVector(
				ocrResult.text,
				keywords,
			);

			const overallConfidence = this.calculateOverallConfidence(
				ocrResult.confidence,
				metadata.confidence,
				documentType,
			);

			const result: DocumentResult = {
				id: this.generateId(),
				imageUri: permanentImageUri,
				thumbnailUri: permanentThumbnailUri,
				imageHash,
				ocrText: ocrResult.text,
				metadata,
				documentType,
				confidence: overallConfidence,
				processedAt: new Date(),
				imageTakenDate: imageInfo.takenDate,
				keywords,
				searchVector,
				imageWidth: imageInfo.width,
				imageHeight: imageInfo.height,
				imageSize: imageInfo.size,
			};

			const processingTime = Date.now() - startTime;
			console.log(
				`Document processed successfully in ${processingTime}ms - Type: ${documentType}, Confidence: ${(overallConfidence * 100).toFixed(1)}%`,
			);
			
			// Log the URIs being saved
			console.log(`Saving document with URIs:
				Original: ${imageUri}
				Permanent: ${permanentImageUri}
				Thumbnail: ${permanentThumbnailUri || 'none'}
			`);

			return result;
		} catch (error) {
			console.error("Error processing document:", error);
			throw error; // Throw the error instead of returning a failed document
		}
	}

	private async preprocessImage(imageUri: string): Promise<string> {
		try {
			const manipulatedImage = await ImageResizer.createResizedImage(
				imageUri,
				1500, // maxWidth
				1500, // maxHeight
				"JPEG",
				90, // quality (0-100)
				0, // rotation
				undefined, // outputPath (let it generate)
				false, // keepMeta
			);

			// Return the resized image directly
			return manipulatedImage.uri;
		} catch (error) {
			console.error("Error preprocessing image:", error);
			return imageUri;
		}
	}

	async performOCR(
		imageUri: string,
		engineName: OCREngineName = "mlkit",
	): Promise<{ text: string; confidence: number }> {
		try {
			// Initialize engine manager if needed
			await ocrEngineManager.initialize();

			// Process with selected engine
			const result = await ocrEngineManager.processImage(imageUri, engineName);

			return {
				text: result.text,
				confidence: result.confidence,
			};
		} catch (error) {
			console.error("Error performing OCR:", error);
			return { text: "", confidence: 0 };
		}
	}

	private detectDocumentType(text: string): DocumentResult["documentType"] {
		const lowerText = text.toLowerCase();

		const receiptKeywords = [
			"receipt",
			"total",
			"subtotal",
			"tax",
			"payment",
			"cash",
			"change",
			"sale",
		];
		const invoiceKeywords = [
			"invoice",
			"bill to",
			"due date",
			"invoice number",
			"net",
			"gross",
		];
		const idKeywords = [
			"id",
			"license",
			"passport",
			"identification",
			"date of birth",
			"expires",
		];
		const formKeywords = [
			"form",
			"application",
			"signature",
			"date signed",
			"checkbox",
			"fill",
		];

		const countKeywords = (keywords: string[]) =>
			keywords.filter((keyword) => lowerText.includes(keyword)).length;

		const scores = {
			receipt: countKeywords(receiptKeywords),
			invoice: countKeywords(invoiceKeywords),
			id: countKeywords(idKeywords),
			form: countKeywords(formKeywords),
		};

		const maxScore = Math.max(...Object.values(scores));

		if (maxScore > 2) {
			return (
				(Object.entries(scores).find(
					([_, score]) => score === maxScore,
				)?.[0] as DocumentResult["documentType"]) || "unknown"
			);
		}

		if (lowerText.includes("screenshot")) return "screenshot";
		if (text.split("\n").length > 10) return "letter";

		return "unknown";
	}

	async extractReceiptMetadata(text: string): Promise<ExtractedMetadata> {
		const metadata: ExtractedMetadata = {
			amounts: [],
			items: [],
			dates: [],
			confidence: 0,
		};

		try {
			const vendorMatch = text.match(/^([A-Z][A-Za-z\s&'.-]+)(?:\n|$)/m);
			if (vendorMatch) {
				metadata.vendor = vendorMatch[1].trim();
			}

			const amountRegex =
				/(?:[$€£¥₹]|USD|EUR|GBP)\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/gi;
			const amountMatches = Array.from(text.matchAll(amountRegex));

			metadata.amounts = amountMatches
				.map((match) => {
					const value = parseFloat(
						match[1].replace(/[,\s]/g, "").replace(/,/g, "."),
					);
					const currency = match[0].match(/[$€£¥₹]|USD|EUR|GBP/i)?.[0] || "USD";

					const isTotal = /total|sum|amount due/i.test(
						text.substring(
							Math.max(0, match.index! - 20),
							match.index! + match[0].length + 20,
						),
					);

					return { value, currency, isTotal };
				})
				.filter((amount) => !isNaN(amount.value));

			const itemRegex =
				/^(.+?)\s+(?:x\s*)?(\d+)?\s*[$€£¥₹]?\s*(\d+[.,]\d{2})/gm;
			const itemMatches = Array.from(text.matchAll(itemRegex));

			metadata.items = itemMatches
				.map((match) => ({
					name: match[1].trim(),
					quantity: match[2] ? parseInt(match[2]) : 1,
					price: parseFloat(match[3].replace(",", ".")),
				}))
				.filter((item) => item.name.length > 2 && item.name.length < 50);

			const dateRegex =
				/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g;
			const dateMatches = Array.from(text.matchAll(dateRegex));

			metadata.dates = dateMatches
				.map((match) => {
					try {
						return {
							date: new Date(match[0]),
							type: "transaction" as const,
						};
					} catch {
						return null;
					}
				})
				.filter(Boolean) as ExtractedMetadata["dates"];

			const addressRegex =
				/\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/i;
			const addressMatch = text.match(addressRegex);
			if (addressMatch) {
				metadata.location = { address: addressMatch[0] };
			}

			const confidenceFactors = [
				metadata.vendor ? 0.2 : 0,
				metadata.amounts && metadata.amounts.length > 0 ? 0.3 : 0,
				metadata.items && metadata.items.length > 0 ? 0.3 : 0,
				metadata.dates && metadata.dates.length > 0 ? 0.1 : 0,
				metadata.location ? 0.1 : 0,
			];

			metadata.confidence = confidenceFactors.reduce(
				(sum, factor) => sum + factor,
				0,
			);
		} catch (error) {
			console.error("Error extracting receipt metadata:", error);
		}

		return metadata;
	}

	async extractInvoiceMetadata(text: string): Promise<ExtractedMetadata> {
		const metadata: ExtractedMetadata = {
			amounts: [],
			items: [],
			dates: [],
			confidence: 0,
		};

		try {
			const vendorMatch =
				text.match(/(?:From|Bill From|Vendor|Company):\s*([^\n]+)/i) ||
				text.match(/^([A-Z][A-Za-z\s&'.-]+)(?:\n|$)/m);
			if (vendorMatch) {
				metadata.vendor = vendorMatch[1].trim();
			}

			const invoiceAmountRegex =
				/(?:Total|Amount Due|Net|Gross|Subtotal)[\s:]*(?:[$€£¥₹]|USD|EUR|GBP)?\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/gi;
			const amountMatches = Array.from(text.matchAll(invoiceAmountRegex));

			metadata.amounts = amountMatches
				.map((match) => {
					const value = parseFloat(
						match[1].replace(/[,\s]/g, "").replace(/,/g, "."),
					);
					const isTotal = /total|amount due/i.test(match[0]);

					return {
						value,
						currency: "USD",
						isTotal,
					};
				})
				.filter((amount) => !isNaN(amount.value));

			const lineItemRegex =
				/^(.+?)\s+(\d+)?\s*(?:@\s*)?[$€£¥₹]?\s*(\d+[.,]\d{2})\s*[$€£¥₹]?\s*(\d+[.,]\d{2})?/gm;
			const itemMatches = Array.from(text.matchAll(lineItemRegex));

			metadata.items = itemMatches
				.map((match) => {
					const quantity = match[2] ? parseInt(match[2]) : 1;
					const unitPrice = parseFloat(match[3].replace(",", "."));
					const totalPrice = match[4]
						? parseFloat(match[4].replace(",", "."))
						: unitPrice * quantity;

					return {
						name: match[1].trim(),
						quantity,
						price: totalPrice,
					};
				})
				.filter((item) => item.name.length > 2 && item.name.length < 100);

			const datePatterns = [
				{
					regex: /Invoice Date[\s:]*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
					type: "issued",
				},
				{
					regex: /Due Date[\s:]*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
					type: "due",
				},
				{
					regex: /Date[\s:]*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
					type: "unknown",
				},
			];

			metadata.dates = datePatterns
				.map((pattern) => {
					const match = text.match(pattern.regex);
					if (match) {
						try {
							return {
								date: new Date(match[1]),
								type: pattern.type as "issued" | "due" | "unknown",
							};
						} catch {
							return null;
						}
					}
					return null;
				})
				.filter(Boolean) as ExtractedMetadata["dates"];

			const addressMatch = text.match(
				/(?:Bill To|Ship To|Address)[\s:]*([^\n]+(?:\n[^\n]+)*)/i,
			);
			if (addressMatch) {
				const addressLines = addressMatch[1].trim().split("\n");
				metadata.location = {
					address: addressLines[0],
					city: addressLines.length > 1 ? addressLines[1] : undefined,
				};
			}

			const confidenceFactors = [
				metadata.vendor ? 0.2 : 0,
				metadata.amounts && metadata.amounts.length > 0 ? 0.3 : 0,
				metadata.items && metadata.items.length > 0 ? 0.2 : 0,
				metadata.dates && metadata.dates.length > 0 ? 0.2 : 0,
				metadata.location ? 0.1 : 0,
			];

			metadata.confidence = confidenceFactors.reduce(
				(sum, factor) => sum + factor,
				0,
			);
		} catch (error) {
			console.error("Error extracting invoice metadata:", error);
		}

		return metadata;
	}

	private async extractGenericMetadata(
		text: string,
	): Promise<ExtractedMetadata> {
		const metadata: ExtractedMetadata = {
			amounts: [],
			dates: [],
			confidence: 0,
		};

		try {
			const firstLine = text.split("\n")[0]?.trim();
			if (firstLine && firstLine.length < 100) {
				metadata.vendor = firstLine;
			}

			const amountRegex =
				/(?:[$€£¥₹]|USD|EUR|GBP)\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/gi;
			const amountMatches = Array.from(text.matchAll(amountRegex));

			metadata.amounts = amountMatches
				.map((match) => ({
					value: parseFloat(match[1].replace(/[,\s]/g, "").replace(/,/g, ".")),
					currency: "USD",
				}))
				.filter((amount) => !isNaN(amount.value));

			const dateRegex =
				/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g;
			const dateMatches = Array.from(text.matchAll(dateRegex));

			metadata.dates = dateMatches
				.map((match) => {
					try {
						return {
							date: new Date(match[0]),
							type: "unknown" as const,
						};
					} catch {
						return null;
					}
				})
				.filter(Boolean) as ExtractedMetadata["dates"];

			metadata.confidence = 0.3;
		} catch (error) {
			console.error("Error extracting generic metadata:", error);
		}

		return metadata;
	}

	async processBatch(
		imageUris: string[],
		options: ProcessingOptions = {},
		onProgress?: (processed: number, total: number) => void,
	): Promise<DocumentResult[]> {
		const results: DocumentResult[] = [];
		const total = imageUris.length;

		for (let i = 0; i < imageUris.length; i++) {
			try {
				const result = await this.processImage(imageUris[i], options);
				results.push(result);

				if (onProgress) {
					onProgress(i + 1, total);
				}
			} catch (error) {
				console.error(`Error processing image ${i + 1}/${total}:`, error);

				// Calculate hash even for failed images
				const imageHash = await thumbnailService.calculateImageHash(
					imageUris[i],
				);

				results.push({
					id: this.generateId(),
					imageUri: imageUris[i],
					imageHash,
					ocrText: "",
					metadata: { confidence: 0 },
					documentType: "unknown",
					confidence: 0,
					processedAt: new Date(),
					keywords: [],
					searchVector: [],
				});
			}
		}

		return results;
	}

	private calculateOverallConfidence(
		ocrConfidence: number,
		metadataConfidence: number,
		documentType: string,
	): number {
		const typeConfidence = documentType === "unknown" ? 0.5 : 0.8;

		const weights = {
			ocr: 0.4,
			metadata: 0.4,
			type: 0.2,
		};

		return (
			ocrConfidence * weights.ocr +
			metadataConfidence * weights.metadata +
			typeConfidence * weights.type
		);
	}

	private generateId(): string {
		return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}
}

export const documentProcessor = new DocumentProcessor();
