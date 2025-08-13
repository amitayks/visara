import { Image } from "react-native";
import RNFS from "react-native-fs";
import CryptoJS from "crypto-js";
import nlp from "compromise";
import ImageResizer from "@bam.tech/react-native-image-resizer";
import { embeddingService } from "../search/simpleEmbeddingService";
import { keywordExtractor } from "./keywordExtractor";
import { ocrEngineManager } from "./OCREngineManager";
import type { OCREngineName } from "./ocrTypes";
import { TempFileTracker } from "../memory/cleanupRegistry";
import { memoryManager } from "../memory/memoryManager";
import { visualDocumentDetector } from "./visualDocumentDetector";

export interface DocumentResult {
	id: string;
	imageUri: string;
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
	private activeProcessingCount = 0;
	private readonly MAX_CONCURRENT_PROCESSING = 2; // Limit concurrent processing

	private defaultOptions: ProcessingOptions = {
		preprocessImage: true,
		extractStructuredData: true,
		confidenceThreshold: 0.7,
		ocrEngine: "mlkit", // Changed from tesseract to mlkit for better memory management
	};

	async processImage(
		imageUri: string,
		options: ProcessingOptions = {},
	): Promise<DocumentResult> {
		// Wait if too many images are being processed
		while (this.activeProcessingCount >= this.MAX_CONCURRENT_PROCESSING) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		this.activeProcessingCount++;

		// Create temp file tracker for this processing session
		const tempTracker = new TempFileTracker("documentProcessor");

		try {
			const opts = { ...this.defaultOptions, ...options };
			const startTime = Date.now();

			// Check memory before processing
			const memStatus = memoryManager.getMemoryStatus();
			if (memStatus.isCriticalMemory) {
				console.warn("[DocumentProcessor] Critical memory, triggering cleanup");
				await memoryManager.emergencyCleanup();
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Calculate image hash for deduplication using URI and basic properties
			const imageHash = await this.calculateImageHash(imageUri);

			// Get basic image info
			const imageInfo = await this.getImageInfo(imageUri);

			// Perform visual document detection FIRST
			const visualFeatures =
				await visualDocumentDetector.detectDocument(imageUri);
			console.log(
				`[DocumentProcessor] Visual detection score: ${(visualFeatures.overallScore * 100).toFixed(1)}%`,
			);

			// Perform OCR directly on the device URI
			const ocrResult = await this.performOCRWithMemoryCleanup(
				imageUri,
				opts.ocrEngine,
				tempTracker, // Pass the tracker
			);

			const documentType = this.detectDocumentType(ocrResult.text);

			let metadata: ExtractedMetadata = { confidence: 0 };

			if (opts.extractStructuredData) {
				metadata = await this.extractMetadata(ocrResult.text, documentType);
			}

			// Combine visual and OCR confidence
			const confidence = this.calculateCombinedConfidence(
				visualFeatures.overallScore,
				ocrResult.confidence,
				documentType,
				ocrResult.text.length,
				metadata.confidence,
			);

			const keywords = await this.extractKeywords(ocrResult.text);
			const searchVector = await this.generateSearchVector(ocrResult.text);

			const result: DocumentResult = {
				id: this.generateId(),
				imageUri, // Store original device URI directly
				imageHash,
				ocrText: ocrResult.text,
				metadata,
				documentType,
				confidence,
				processedAt: new Date(),
				keywords,
				searchVector,
				imageWidth: imageInfo.width,
				imageHeight: imageInfo.height,
				imageSize: imageInfo.size,
				imageTakenDate: imageInfo.takenDate,
			};

			const processingTime = Date.now() - startTime;
			console.log(
				`Document processed in ${processingTime}ms - Type: ${documentType}, Confidence: ${(confidence * 100).toFixed(1)}%`,
			);

			return result;
		} catch (error) {
			console.error("Error processing document:", error);
			throw error;
		} finally {
			// ALWAYS cleanup temp files, even on error
			await tempTracker.cleanupAll();
			this.activeProcessingCount--;

			// Trigger GC hint after processing
			if (global.gc) {
				global.gc();
			}
		}
	}

	// Calculate image hash for deduplication using URI and file properties
	private async calculateImageHash(imageUri: string): Promise<string> {
		try {
			// For content:// URIs, create hash from URI itself (stable identifier)
			if (imageUri.startsWith("content://")) {
				return CryptoJS.SHA256(imageUri).toString();
			}

			// For file:// URIs, try to get file stats for more unique hash
			try {
				const stats = await RNFS.stat(imageUri);
				const hashInput = `${imageUri}-${stats.size}-${stats.mtime}`;
				return CryptoJS.SHA256(hashInput).toString();
			} catch (error) {
				// Fallback to URI-based hash
				return CryptoJS.SHA256(imageUri).toString();
			}
		} catch (error) {
			console.error("Error calculating image hash:", error);
			// Ultimate fallback
			return CryptoJS.SHA256(imageUri).toString();
		}
	}

	// Get basic image information
	private async getImageInfo(imageUri: string): Promise<{
		width?: number;
		height?: number;
		size?: number;
		takenDate?: Date;
	}> {
		try {
			// Get image dimensions using React Native Image
			const dimensions = await new Promise<{ width: number; height: number }>(
				(resolve, reject) => {
					Image.getSize(
						imageUri,
						(width, height) => resolve({ width, height }),
						(error) => reject(error),
					);
				},
			);

			let size: number | undefined;
			let takenDate: Date | undefined;

			// Try to get file size for file:// URIs
			if (imageUri.startsWith("file://")) {
				try {
					const stats = await RNFS.stat(imageUri);
					size = stats.size;
					takenDate = new Date(stats.mtime);
				} catch (error) {
					// Ignore stat errors for content URIs
				}
			}

			return {
				width: dimensions.width,
				height: dimensions.height,
				size,
				takenDate,
			};
		} catch (error) {
			console.error("Error getting image info:", error);
			return {};
		}
	}

	private async preprocessImage(
		imageUri: string,
		tempTracker?: TempFileTracker,
	): Promise<string> {
		try {
			// DON'T cache preprocessed images - they're temporary!
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

			// ONLY track for cleanup, don't cache
			if (tempTracker) {
				tempTracker.add(manipulatedImage.uri);
			} else {
				// Register with memory manager if no tracker provided
				memoryManager.registerTempFile(manipulatedImage.uri, "preprocessImage");
			}

			// Return the temp file directly - NO CACHING
			return manipulatedImage.uri;
		} catch (error) {
			console.error("Error preprocessing image:", error);
			return imageUri;
		}
	}

	private async performOCRWithMemoryCleanup(
		imageUri: string,
		engineName: OCREngineName = "mlkit",
		tempTracker?: TempFileTracker, // ADD THIS PARAMETER
	): Promise<{ text: string; confidence: number }> {
		try {
			let processUri = imageUri;
			let needsCleanup = false;

			// Always preprocess content:// URIs as they can't be read directly by OCR engines
			if (imageUri.startsWith("content://")) {
				console.log("Preprocessing content URI for OCR");
				processUri = await this.preprocessImage(imageUri, tempTracker);
				needsCleanup = false; // Already tracked by tempTracker
			} else {
				// For file URIs, resize if too large
				const imageInfo = await this.getImageSize(imageUri);

				if (imageInfo.width > 2000 || imageInfo.height > 2000) {
					console.log(
						`Resizing large image for OCR: ${imageInfo.width}x${imageInfo.height}`,
					);
					const resized = await ImageResizer.createResizedImage(
						imageUri,
						Math.min(2000, imageInfo.width),
						Math.min(2000, imageInfo.height),
						"JPEG",
						85,
						0,
					);
					processUri = resized.uri;

					// TRACK THIS TEMP FILE!
					if (tempTracker) {
						tempTracker.add(resized.uri);
					} else {
						memoryManager.registerTempFile(resized.uri, "ocrResize");
					}

					needsCleanup = false; // Don't double-cleanup
				}
			}

			// Initialize engine manager if needed
			await ocrEngineManager.initialize();

			const result = await ocrEngineManager.processImage(
				processUri,
				engineName,
			);

			// Clean up processed image if it was created during preprocessing
			if (needsCleanup && processUri !== imageUri) {
				try {
					await RNFS.unlink(processUri);
				} catch (e) {
					// Ignore cleanup errors
					console.log(
						"Note: Could not clean up temporary file:",
						e instanceof Error ? e.message : String(e),
					);
				}
			}

			return result;
		} catch (error) {
			console.error("Error performing OCR:", error);
			return { text: "", confidence: 0 };
		}
	}

	private async getImageSize(
		uri: string,
	): Promise<{ width: number; height: number }> {
		return new Promise((resolve, reject) => {
			Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
		});
	}

	private detectDocumentType(text: string): DocumentResult["documentType"] {
		const lowerText = text.toLowerCase();

		// Receipt indicators (weighted keywords)
		const receiptKeywords = {
			strong: [
				"receipt",
				"total",
				"subtotal",
				"tax",
				"payment",
				"cash",
				"credit",
				"debit",
				"change",
				"paid",
				"amount due",
			],
			medium: [
				"amount",
				"price",
				"qty",
				"quantity",
				"item",
				"purchase",
				"sale",
				"transaction",
				"$",
				"usd",
				"eur",
			],
			weak: ["date", "time", "thank", "store", "customer", "cashier", "order"],
		};

		// Invoice indicators
		const invoiceKeywords = {
			strong: [
				"invoice",
				"bill",
				"invoice no",
				"invoice number",
				"due date",
				"payment terms",
				"remittance",
			],
			medium: [
				"billable",
				"net",
				"gross",
				"vat",
				"billing",
				"po number",
				"account",
			],
			weak: ["client", "customer", "vendor", "company", "address"],
		};

		// ID indicators
		const idKeywords = {
			strong: [
				"license",
				"passport",
				"identification",
				"date of birth",
				"expires",
				"dob",
				"exp",
				"dl#",
			],
			medium: ["id", "card", "number", "issued", "valid"],
			weak: ["name", "address", "signature"],
		};

		// Form indicators
		const formKeywords = {
			strong: [
				"form",
				"application",
				"checkbox",
				"fill in",
				"complete",
				"sign here",
			],
			medium: ["signature", "date signed", "applicant", "section"],
			weak: ["name", "address", "phone", "email"],
		};

		// Calculate weighted scores
		let receiptScore = 0;
		let invoiceScore = 0;
		let idScore = 0;
		let formScore = 0;

		// Check receipt keywords
		receiptKeywords.strong.forEach((kw) => {
			if (lowerText.includes(kw)) receiptScore += 3;
		});
		receiptKeywords.medium.forEach((kw) => {
			if (lowerText.includes(kw)) receiptScore += 2;
		});
		receiptKeywords.weak.forEach((kw) => {
			if (lowerText.includes(kw)) receiptScore += 1;
		});

		// Check invoice keywords
		invoiceKeywords.strong.forEach((kw) => {
			if (lowerText.includes(kw)) invoiceScore += 3;
		});
		invoiceKeywords.medium.forEach((kw) => {
			if (lowerText.includes(kw)) invoiceScore += 2;
		});
		invoiceKeywords.weak.forEach((kw) => {
			if (lowerText.includes(kw)) invoiceScore += 1;
		});

		// Check ID keywords
		idKeywords.strong.forEach((kw) => {
			if (lowerText.includes(kw)) idScore += 3;
		});
		idKeywords.medium.forEach((kw) => {
			if (lowerText.includes(kw)) idScore += 2;
		});
		idKeywords.weak.forEach((kw) => {
			if (lowerText.includes(kw)) idScore += 1;
		});

		// Check form keywords
		formKeywords.strong.forEach((kw) => {
			if (lowerText.includes(kw)) formScore += 3;
		});
		formKeywords.medium.forEach((kw) => {
			if (lowerText.includes(kw)) formScore += 2;
		});
		formKeywords.weak.forEach((kw) => {
			if (lowerText.includes(kw)) formScore += 1;
		});

		// Determine type based on scores with thresholds
		const scores = {
			receipt: receiptScore,
			invoice: invoiceScore,
			id: idScore,
			form: formScore,
		};

		const maxScore = Math.max(...Object.values(scores));

		// Need at least a score of 5 to be confident
		if (maxScore >= 5) {
			const documentType = Object.entries(scores).find(
				([_, score]) => score === maxScore,
			)?.[0];

			if (documentType === "id") return "id";
			if (documentType === "receipt") return "receipt";
			if (documentType === "invoice") return "invoice";
			if (documentType === "form") return "form";
		}

		// Check for screenshot indicators
		if (
			lowerText.includes("screenshot") ||
			lowerText.includes("screen capture")
		) {
			return "screenshot";
		}

		// Check if it might be a letter (multiple paragraphs of text)
		const lines = text.split("\n").filter((line) => line.trim().length > 0);
		if (lines.length > 10 && text.length > 500) {
			return "letter";
		}

		return "unknown";
	}

	private async extractMetadata(
		text: string,
		documentType: DocumentResult["documentType"],
	): Promise<ExtractedMetadata> {
		switch (documentType) {
			case "receipt":
				return await this.extractReceiptMetadata(text);
			case "invoice":
				return await this.extractInvoiceMetadata(text);
			default:
				return await this.extractGenericMetadata(text);
		}
	}

	private async extractKeywords(text: string): Promise<string[]> {
		const doc = nlp(text);
		const keywords: Set<string> = new Set();

		// Extract nouns and proper nouns
		doc
			.nouns()
			.out("array")
			.forEach((noun: string) => {
				if (noun.length > 2) keywords.add(noun.toLowerCase());
			});

		// Extract organizations and people
		doc
			.organizations()
			.out("array")
			.forEach((org: string) => keywords.add(org.toLowerCase()));
		doc
			.people()
			.out("array")
			.forEach((person: string) => keywords.add(person.toLowerCase()));

		// Extract money values
		doc
			.money()
			.out("array")
			.forEach((money: string) => keywords.add(money));

		// Add document type
		keywords.add(this.detectDocumentType(text));

		// Add vendor if detected
		const vendorMatch = text.match(/^([A-Z][A-Za-z\s&'.-]+)(?:\n|$)/m);
		if (vendorMatch) {
			keywords.add(vendorMatch[1].trim().toLowerCase());
		}

		// Also get keywords from keywordExtractor for additional coverage
		const extractedKeywords = keywordExtractor.extractKeywords(text);
		extractedKeywords.forEach((kw) => keywords.add(kw.toLowerCase()));

		return Array.from(keywords).slice(0, 20); // Limit to 20 keywords
	}

	private async generateSearchVector(text: string): Promise<number[]> {
		// Generate embedding for the document using the new embedding service
		return await embeddingService.generateEmbedding(text);
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
				const imageHash = await this.calculateImageHash(imageUris[i]);

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

	private calculateCombinedConfidence(
		visualScore: number,
		ocrConfidence: number,
		documentType: string,
		textLength: number,
		metadataConfidence: number,
	): number {
		// Weight visual features more heavily than OCR confidence
		let confidence = visualScore * 0.5; // 50% weight on visual

		// Add OCR contribution only if text was found
		if (textLength > 50) {
			confidence += 0.2; // Bonus for having text
		}

		// Add bonus for specific document types
		if (documentType !== "unknown") {
			confidence += 0.2;
		}

		// Add small OCR confidence contribution
		confidence += ocrConfidence * 0.1;

		// Add metadata confidence if available
		if (metadataConfidence > 0) {
			confidence += metadataConfidence * 0.05;
		}

		return Math.min(confidence, 1.0);
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
