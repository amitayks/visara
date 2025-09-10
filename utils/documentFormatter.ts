// utils/documentFormatter.ts
import type { Document } from "../app/components/DocumentGrid";
import { formatDate, formatCurrency, safeString } from "./format";

export interface FormattedDocumentData {
	basicInfo: {
		id: string;
		documentType: string;
		confidence: string;
		createdAt: string;
		processedAt: string;
	};
	imageInfo: {
		imageUri: string;
		imageHash: string;
		imageWidth: string;
		imageHeight: string;
		imageSize: string;
		imageTakenDate: string;
	};
	extractedContent: {
		ocrText: string;
		keywords: string;
		searchVector: string;
	};
	businessData: {
		vendor: string;
		totalAmount: string;
		date: string;
		metadata: string;
	};
}

// CRITICAL: All fields must return strings, never null or undefined
export function formatDocumentAsJSON(
	document: Document,
): FormattedDocumentData {
	return {
		basicInfo: {
			id: safeString(document.id) || "Unknown ID",
			documentType: safeString(document.documentType) || "Unknown",
			confidence: document.confidence
				? `${Math.round(document.confidence * 100)}%`
				: "N/A",
			createdAt: formatDate(document.createdAt),
			processedAt: formatDate(document.processedAt),
		},
		imageInfo: {
			imageUri: safeString(document.imageUri) || "No URI",
			imageHash: safeString(document.imageHash) || "N/A",
			imageWidth: document.imageWidth ? `${document.imageWidth}px` : "N/A",
			imageHeight: document.imageHeight ? `${document.imageHeight}px` : "N/A",
			imageSize: document.imageSize
				? `${Math.round(document.imageSize / 1024)} KB`
				: "N/A",
			imageTakenDate: formatDate(document.imageTakenDate),
		},
		extractedContent: {
			ocrText: safeString(document.ocrText) || "No OCR text available",
			keywords:
				Array.isArray(document.keywords) && document.keywords.length > 0
					? document.keywords.join(", ")
					: "No keywords",
			searchVector: Array.isArray(document.searchVector)
				? `Array of ${document.searchVector.length} float values`
				: "No search vector",
		},
		businessData: {
			vendor: safeString(document.vendor) || "N/A",
			totalAmount: formatCurrency(document.totalAmount),
			date: formatDate(document.date),
			metadata: document.metadata
				? JSON.stringify(document.metadata, null, 2)
				: "No metadata",
		},
	};
}

export function formatDocumentAsJSONString(
	document: Document,
	indent: number = 2,
): string {
	try {
		const formattedData = formatDocumentAsJSON(document);
		return JSON.stringify(formattedData, null, indent);
	} catch (error) {
		console.error("[formatDocumentAsJSONString] Error:", error);
		return "{}";
	}
}

export function formatDocumentForDisplay(document: Document): string {
	try {
		const formattedData = formatDocumentAsJSON(document);

		let output = "";

		// Basic Information
		output += "=== BASIC INFORMATION ===\n";
		output += `ID: ${formattedData.basicInfo.id}\n`;
		output += `Document Type: ${formattedData.basicInfo.documentType}\n`;
		output += `Confidence: ${formattedData.basicInfo.confidence}\n`;
		output += `Created: ${formattedData.basicInfo.createdAt}\n`;
		output += `Processed: ${formattedData.basicInfo.processedAt}\n\n`;

		// Image Information
		output += "=== IMAGE INFORMATION ===\n";
		output += `Image URI: ${formattedData.imageInfo.imageUri}\n`;
		output += `Image Hash: ${formattedData.imageInfo.imageHash}\n`;

		if (
			formattedData.imageInfo.imageWidth !== "N/A" &&
			formattedData.imageInfo.imageHeight !== "N/A"
		) {
			output += `Dimensions: ${formattedData.imageInfo.imageWidth} × ${formattedData.imageInfo.imageHeight}\n`;
		} else {
			output += `Dimensions: N/A\n`;
		}

		output += `File Size: ${formattedData.imageInfo.imageSize}\n`;
		output += `Image Taken: ${formattedData.imageInfo.imageTakenDate}\n\n`;

		// Business Data
		output += "=== BUSINESS DATA ===\n";
		output += `Vendor: ${formattedData.businessData.vendor}\n`;
		output += `Amount: ${formattedData.businessData.totalAmount}\n`;
		output += `Date: ${formattedData.businessData.date}\n\n`;

		// Extracted Content
		output += "=== EXTRACTED CONTENT ===\n";
		output += `Keywords: ${formattedData.extractedContent.keywords}\n`;
		output += `Search Vector: ${formattedData.extractedContent.searchVector}\n\n`;

		// OCR Text (only if not "No OCR text available")
		if (formattedData.extractedContent.ocrText !== "No OCR text available") {
			output += "=== OCR TEXT ===\n";
			output += formattedData.extractedContent.ocrText + "\n\n";
		}

		// Metadata (only if not "No metadata")
		if (formattedData.businessData.metadata !== "No metadata") {
			output += "=== METADATA ===\n";
			output += formattedData.businessData.metadata + "\n";
		}

		return output;
	} catch (error) {
		console.error("[formatDocumentForDisplay] Error:", error);
		return "Error: Unable to format document data";
	}
}
