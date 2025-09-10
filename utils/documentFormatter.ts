import type { Document } from "../app/components/DocumentGrid";
import { formatDate, formatCurrency } from "./format";

export interface FormattedDocumentData {
	basicInfo: {
		id: string;
		documentType: string | null;
		confidence: number | null;
		createdAt: string;
		processedAt: string | null;
	};
	imageInfo: {
		imageUri: string;
		imageHash: string | null;
		imageWidth: number | null;
		imageHeight: number | null;
		imageSize: number | null;
		imageTakenDate: string | null;
	};
	extractedContent: {
		ocrText: string | null;
		keywords: string[] | null;
		searchVector: string | null; // Simplified representation
	};
	businessData: {
		vendor: string | null;
		totalAmount: string | null;
		date: string | null;
		metadata: any;
	};
}

export function formatDocumentAsJSON(document: Document): FormattedDocumentData {
	return {
		basicInfo: {
			id: document.id,
			documentType: document.documentType || null,
			confidence: document.confidence ? Math.round(document.confidence * 100) / 100 : null,
			createdAt: formatDate(document.createdAt),
			processedAt: document.processedAt ? formatDate(document.processedAt) : null,
		},
		imageInfo: {
			imageUri: document.imageUri,
			imageHash: document.imageHash || null,
			imageWidth: document.imageWidth || null,
			imageHeight: document.imageHeight || null,
			imageSize: document.imageSize || null,
			imageTakenDate: document.imageTakenDate ? formatDate(document.imageTakenDate) : null,
		},
		extractedContent: {
			ocrText: document.ocrText || null,
			keywords: document.keywords || null,
			searchVector: document.searchVector 
				? `Array of ${document.searchVector.length} float values`
				: null,
		},
		businessData: {
			vendor: document.vendor || null,
			totalAmount: document.totalAmount ? formatCurrency(document.totalAmount) : null,
			date: document.date ? formatDate(document.date) : null,
			metadata: document.metadata || null,
		},
	};
}

export function formatDocumentAsJSONString(document: Document, indent: number = 2): string {
	const formattedData = formatDocumentAsJSON(document);
	return JSON.stringify(formattedData, null, indent);
}

export function formatDocumentForDisplay(document: Document): string {
	const formattedData = formatDocumentAsJSON(document);
	
	let output = "";
	
	// Basic Information
	output += "=== BASIC INFORMATION ===\n";
	output += `ID: ${formattedData.basicInfo.id}\n`;
	output += `Document Type: ${formattedData.basicInfo.documentType || "Unknown"}\n`;
	output += `Confidence: ${formattedData.basicInfo.confidence ? formattedData.basicInfo.confidence + "%" : "N/A"}\n`;
	output += `Created: ${formattedData.basicInfo.createdAt}\n`;
	output += `Processed: ${formattedData.basicInfo.processedAt || "N/A"}\n\n`;
	
	// Image Information
	output += "=== IMAGE INFORMATION ===\n";
	output += `Image URI: ${formattedData.imageInfo.imageUri}\n`;
	output += `Image Hash: ${formattedData.imageInfo.imageHash || "N/A"}\n`;
	if (formattedData.imageInfo.imageWidth && formattedData.imageInfo.imageHeight) {
		output += `Dimensions: ${formattedData.imageInfo.imageWidth} × ${formattedData.imageInfo.imageHeight} px\n`;
	}
	output += `File Size: ${formattedData.imageInfo.imageSize ? `${Math.round(formattedData.imageInfo.imageSize / 1024)} KB` : "N/A"}\n`;
	output += `Image Taken: ${formattedData.imageInfo.imageTakenDate || "N/A"}\n\n`;
	
	// Business Data
	output += "=== BUSINESS DATA ===\n";
	output += `Vendor: ${formattedData.businessData.vendor || "N/A"}\n`;
	output += `Amount: ${formattedData.businessData.totalAmount || "N/A"}\n`;
	output += `Date: ${formattedData.businessData.date || "N/A"}\n\n`;
	
	// Extracted Content
	output += "=== EXTRACTED CONTENT ===\n";
	output += `Keywords: ${formattedData.extractedContent.keywords ? formattedData.extractedContent.keywords.join(", ") : "N/A"}\n`;
	output += `Search Vector: ${formattedData.extractedContent.searchVector || "N/A"}\n\n`;
	
	// OCR Text
	if (formattedData.extractedContent.ocrText) {
		output += "=== OCR TEXT ===\n";
		output += formattedData.extractedContent.ocrText + "\n\n";
	}
	
	// Metadata
	if (formattedData.businessData.metadata) {
		output += "=== METADATA ===\n";
		output += JSON.stringify(formattedData.businessData.metadata, null, 2) + "\n";
	}
	
	return output;
}