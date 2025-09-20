// utils/documentValidator.ts
/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import type { SimpleProcessedDocument } from "../services/ai/SimpleDocumentProcessor";

/**
 * Validates and sanitizes document data before saving to database
 * This prevents null/undefined values from causing rendering issues
 */
export class DocumentValidator {
	/**
	 * Validates a SimpleProcessedDocument and ensures all fields are properly formatted
	 */
	static validateAndSanitize(result: SimpleProcessedDocument): SimpleProcessedDocument {
		console.log("[DocumentValidator] Validating document data");

		// Create a clean copy of the result
		const sanitized: SimpleProcessedDocument = {
			...result,
			// Ensure required fields are never null/undefined
			imageUri: result.imageUri || "",
			imageHash: result.imageHash || "",
			ocrText: result.ocrText || "",
			documentType: result.documentType || "unknown",
			confidence: typeof result.confidence === "number" ? result.confidence : 0,
			processedAt: result.processedAt || new Date(),
			metadata: result.metadata || {},
			keywords: Array.isArray(result.keywords) ? result.keywords : [],

			// Optional numeric fields - keep as null if not present
			imageWidth:
				typeof result.imageWidth === "number" ? result.imageWidth : undefined,
			imageHeight:
				typeof result.imageHeight === "number" ? result.imageHeight : undefined,
			imageSize:
				typeof result.imageSize === "number" ? result.imageSize : undefined,

			// Optional date field
			imageTakenDate:
				result.imageTakenDate instanceof Date
					? result.imageTakenDate
					: undefined,
		};

		// Validate metadata structure
		if (sanitized.metadata) {
			sanitized.metadata = DocumentValidator.sanitizeMetadata(sanitized.metadata);
		}

		// Log validation results
		DocumentValidator.logValidationResults(result, sanitized);

		return sanitized;
	}

	/**
	 * Sanitizes metadata to ensure all fields are safe for rendering
	 */
	private static sanitizeMetadata(metadata: any): any {
		const cleaned: any = {};

		// Safely copy vendor
		if (metadata.vendor) {
			cleaned.vendor = String(metadata.vendor);
		}

		// Safely copy totalAmount
		if (typeof metadata.totalAmount === "number") {
			cleaned.totalAmount = metadata.totalAmount;
		}

		// Safely copy currency
		if (metadata.currency) {
			cleaned.currency = String(metadata.currency);
		}

		// Safely copy date
		if (metadata.date instanceof Date) {
			cleaned.date = metadata.date;
		}

		// Safely copy language
		if (metadata.language) {
			cleaned.language = String(metadata.language);
		}

		return cleaned;
	}

	/**
	 * Logs validation results for debugging
	 */
	private static logValidationResults(
		original: SimpleProcessedDocument,
		sanitized: SimpleProcessedDocument,
	): void {
		const changes: string[] = [];

		// Check for fields that were modified
		if (!original.imageUri && sanitized.imageUri) {
			changes.push("imageUri: added default");
		}
		if (!original.documentType && sanitized.documentType) {
			changes.push('documentType: set to "unknown"');
		}
		if (original.confidence === null || original.confidence === undefined) {
			changes.push("confidence: set to 0");
		}
		if (
			!Array.isArray(original.keywords) &&
			Array.isArray(sanitized.keywords)
		) {
			changes.push("keywords: initialized as empty array");
		}

		if (changes.length > 0) {
			console.log(
				`[DocumentValidator] Sanitized ${changes.length} fields:`,
				changes,
			);
		} else {
			console.log("[DocumentValidator] No sanitization needed");
		}
	}

	/**
	 * Validates if a document has the minimum required data for display
	 */
	static isValidForDisplay(document: any): boolean {
		if (!document) return false;
		if (!document.id) return false;
		if (!document.imageUri) return false;

		// Check that required fields exist and are the correct type
		if (typeof document.id !== "string") return false;
		if (typeof document.imageUri !== "string") return false;

		// Optional fields should be the correct type if present
		if (document.vendor && typeof document.vendor !== "string") return false;
		if (document.totalAmount && typeof document.totalAmount !== "number")
			return false;

		return true;
	}
}

// Export singleton instance for convenience
export const documentValidator = DocumentValidator;
