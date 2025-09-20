// services/processing/DocumentDetector.ts
// Simplified visual document detection

import { Image } from "react-native";
import RNFS from "react-native-fs";

class DocumentDetector {
	private static instance: DocumentDetector;
	private initialized = false;

	private constructor() {}

	static getInstance(): DocumentDetector {
		if (!DocumentDetector.instance) {
			DocumentDetector.instance = new DocumentDetector();
		}
		return DocumentDetector.instance;
	}

	/**
	 * Initialize the detector
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		this.initialized = true;
		console.log("[DocumentDetector] Initialized");
	}

	/**
	 * Detect if an image is likely a document
	 */
	async detectDocument(imageUri: string): Promise<boolean> {
		try {
			// Get image dimensions
			const dimensions = await this.getImageDimensions(imageUri);

			// Get file info
			const fileInfo = await this.getFileInfo(imageUri);

			// Calculate detection score
			const score = this.calculateDocumentScore({
				...dimensions,
				...fileInfo,
			});

			const isDocument = score > 0.5;

			console.log(
				`[DocumentDetector] ${fileInfo.fileName}: score=${score.toFixed(2)}, isDocument=${isDocument}`,
			);

			return isDocument;
		} catch (error) {
			console.error("[DocumentDetector] Detection failed:", error);
			return false;
		}
	}

	/**
	 * Get image dimensions
	 */
	private getImageDimensions(
		uri: string,
	): Promise<{ width: number; height: number; aspectRatio: number }> {
		return new Promise((resolve, reject) => {
			Image.getSize(
				uri,
				(width, height) => {
					resolve({
						width,
						height,
						aspectRatio: width / height,
					});
				},
				reject,
			);
		});
	}

	/**
	 * Get file information
	 */
	private async getFileInfo(
		uri: string,
	): Promise<{ fileSize: number; fileName: string; isScreenshot: boolean }> {
		try {
			const filePath = uri.replace("file://", "");
			const stat = await RNFS.stat(filePath);
			const fileName = filePath.split("/").pop() || "unknown";
			const fileNameLower = fileName.toLowerCase();

			return {
				fileSize: stat.size,
				fileName,
				isScreenshot:
					fileNameLower.includes("screenshot") ||
					fileNameLower.includes("screen shot") ||
					fileNameLower.includes("screen_shot"),
			};
		} catch (error) {
			return {
				fileSize: 0,
				fileName: "unknown",
				isScreenshot: false,
			};
		}
	}

	/**
	 * Calculate document detection score
	 */
	private calculateDocumentScore(params: {
		width: number;
		height: number;
		aspectRatio: number;
		fileSize: number;
		fileName: string;
		isScreenshot: boolean;
	}): number {
		let score = 0;
		const { width, height, aspectRatio, fileSize, fileName, isScreenshot } =
			params;

		// 1. Aspect Ratio Score (documents have standard ratios)
		const documentRatios = [
			{ ratio: 1.414, name: "A4" }, // A4 (210×297mm)
			{ ratio: 0.707, name: "A4 landscape" },
			{ ratio: 1.294, name: "Letter" }, // US Letter (8.5×11")
			{ ratio: 0.773, name: "Letter landscape" },
			{ ratio: 1.0, name: "Square" }, // Square documents
			{ ratio: 1.333, name: "4:3" }, // Common scan ratio
			{ ratio: 0.75, name: "3:4" },
		];

		// Find closest document ratio
		let minDiff = Number.MAX_VALUE;
		for (const docRatio of documentRatios) {
			const diff = Math.abs(aspectRatio - docRatio.ratio);
			if (diff < minDiff) {
				minDiff = diff;
			}
		}

		// Score based on how close to document ratio
		if (minDiff < 0.05) {
			score += 0.4; // Very close to document ratio
		} else if (minDiff < 0.15) {
			score += 0.25; // Somewhat close
		} else if (minDiff < 0.25) {
			score += 0.1; // Slightly close
		}

		// 2. Resolution Score (documents are usually high-res)
		const pixels = width * height;
		if (pixels > 2000000) {
			// > 2MP
			score += 0.2;
		} else if (pixels > 1000000) {
			// > 1MP
			score += 0.1;
		}

		// 3. File Size Score (documents compress well)
		const bytesPerPixel = fileSize / pixels;
		if (bytesPerPixel < 0.5 && bytesPerPixel > 0.05) {
			score += 0.15; // Good compression ratio for documents
		}

		// 4. Filename Analysis
		const fileNameLower = fileName.toLowerCase();
		const documentKeywords = [
			"scan",
			"doc",
			"document",
			"receipt",
			"invoice",
			"bill",
			"contract",
			"form",
			"letter",
			"certificate",
			"statement",
			"report",
			"pdf",
			"page",
			"copy",
		];

		if (documentKeywords.some((keyword) => fileNameLower.includes(keyword))) {
			score += 0.3;
		}

		// 5. Screenshot Bonus (screenshots of documents are common)
		if (isScreenshot) {
			// Check if it looks like a document screenshot
			if (aspectRatio > 0.5 && aspectRatio < 2.0) {
				score += 0.2;
			}
		}

		// 6. Photo Penalty (photos typically have different characteristics)
		const photoKeywords = ["img_", "dsc", "photo", "pic", "selfie", "portrait"];
		if (photoKeywords.some((keyword) => fileNameLower.includes(keyword))) {
			score -= 0.3;
		}

		// 7. Standard photo aspect ratios penalty
		const photoRatios = [1.5, 0.667, 1.778, 0.563]; // 3:2, 2:3, 16:9, 9:16
		const isPhotoRatio = photoRatios.some(
			(ratio) => Math.abs(aspectRatio - ratio) < 0.05,
		);
		if (isPhotoRatio) {
			score -= 0.2;
		}

		// Ensure score is between 0 and 1
		return Math.max(0, Math.min(1, score));
	}

	/**
	 * Batch detect documents
	 */
	async detectBatch(imageUris: string[]): Promise<Map<string, boolean>> {
		const results = new Map<string, boolean>();

		// Process in parallel with limit
		const BATCH_SIZE = 5;
		for (let i = 0; i < imageUris.length; i += BATCH_SIZE) {
			const batch = imageUris.slice(i, i + BATCH_SIZE);
			const promises = batch.map(async (uri) => {
				const isDocument = await this.detectDocument(uri);
				results.set(uri, isDocument);
			});

			await Promise.allSettled(promises);
		}

		return results;
	}
}

// Export singleton instance
export const documentDetector = DocumentDetector.getInstance();
