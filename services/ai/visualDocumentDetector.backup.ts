// services/ai/QuickFixVisualDetector.ts
// QUICK FIX - Drop-in replacement for your current visualDocumentDetector.ts
// This is a simpler fix that improves detection without full rewrite

import { Image } from "react-native";
import RNFS from "react-native-fs";

export interface DocumentFeatures {
	hasRectangularShape: boolean;
	edgeDensity: number;
	textRegionCount: number;
	contrastRatio: number;
	whiteSpaceRatio: number;
	aspectRatio: number;
	overallScore: number;
	textDensity?: number;
	colorVariance?: number;
	hasTableStructure?: boolean;
	hasStraightLines?: boolean;
}

export class VisualDocumentDetector {
	async detectDocument(imageUri: string): Promise<DocumentFeatures> {
		try {
			const dimensions = await this.getImageDimensions(imageUri);
			const aspectRatio = dimensions.width / dimensions.height;

			// Get file stats for better detection
			const stats = await RNFS.stat(imageUri).catch(() => null);
			const fileSize = stats?.size || 0;
			const fileName = imageUri.toLowerCase();

			// IMPROVED: Better detection logic
			let score = 0;
			let textRegions = 0;
			let confidence = 0;

			// 1. Aspect Ratio Analysis (Documents have standard ratios)
			const aspectScore = this.getAspectRatioScore(aspectRatio);
			score += aspectScore * 0.25;

			// 2. File Size Analysis (Documents compress well)
			const sizeScore = this.getFileSizeScore(fileSize, dimensions);
			score += sizeScore * 0.15;

			// 3. Filename Analysis (More nuanced)
			const nameScore = this.getFilenameScore(fileName);
			score += nameScore * 0.1;

			// 4. Screenshot Detection (PENALTY)
			const screenshotPenalty = this.getScreenshotPenalty(
				fileName,
				aspectRatio,
			);
			score -= screenshotPenalty;

			// 5. Photo Detection (PENALTY)
			const photoPenalty = this.getPhotoPenalty(
				fileName,
				fileSize,
				aspectRatio,
			);
			score -= photoPenalty;

			// 6. Document Boost (if it really looks like a document)
			const documentBoost = this.getDocumentBoost(
				aspectRatio,
				fileSize,
				fileName,
			);
			score += documentBoost;

			// Ensure score is between 0 and 1
			score = Math.max(0, Math.min(1, score));

			// Estimate other features based on score
			const isLikelyDocument = score > 0.5;
			textRegions = isLikelyDocument ? Math.floor(score * 10) : 2;
			const contrast = isLikelyDocument ? 0.7 + score * 0.2 : 0.4;
			const whiteSpace = isLikelyDocument ? 0.3 + score * 0.2 : 0.1;

			console.log(
				`[QuickFix] ${fileName.substring(fileName.lastIndexOf("/") + 1)}:`,
				{
					aspectRatio: aspectRatio.toFixed(2),
					aspectScore: aspectScore.toFixed(2),
					sizeScore: sizeScore.toFixed(2),
					nameScore: nameScore.toFixed(2),
					screenshotPenalty: screenshotPenalty.toFixed(2),
					photoPenalty: photoPenalty.toFixed(2),
					documentBoost: documentBoost.toFixed(2),
					finalScore: score.toFixed(3),
					decision: score >= 0.5 ? "✅ DOCUMENT" : "❌ NOT DOCUMENT",
				},
			);

			return {
				hasRectangularShape: score > 0.6,
				edgeDensity: score * 0.8,
				textRegionCount: textRegions,
				contrastRatio: contrast,
				whiteSpaceRatio: whiteSpace,
				aspectRatio,
				overallScore: score,
				textDensity: score * 0.7,
				colorVariance: 1 - score,
				hasTableStructure: score > 0.7 && aspectRatio < 0.6,
				hasStraightLines: score > 0.6,
			};
		} catch (error) {
			console.error("[QuickFix] Error:", error);
			return {
				hasRectangularShape: false,
				edgeDensity: 0,
				textRegionCount: 0,
				contrastRatio: 0,
				whiteSpaceRatio: 0,
				aspectRatio: 1,
				overallScore: 0,
			};
		}
	}

	private getAspectRatioScore(ratio: number): number {
		// A4 Portrait (0.707)
		if (ratio >= 0.65 && ratio <= 0.75) return 0.95;

		// US Letter Portrait (0.773)
		if (ratio >= 0.75 && ratio <= 0.82) return 0.93;

		// A4 Landscape (1.414)
		if (ratio >= 1.35 && ratio <= 1.48) return 0.93;

		// US Letter Landscape (1.294)
		if (ratio >= 1.22 && ratio <= 1.35) return 0.91;

		// Receipt (narrow, 0.3-0.5)
		if (ratio >= 0.25 && ratio <= 0.5) return 0.88;

		// Wide receipt/invoice
		if (ratio >= 0.5 && ratio <= 0.65) return 0.85;

		// Square (Instagram/Social - BAD)
		if (ratio >= 0.95 && ratio <= 1.05) return 0.1;

		// Ultra wide (Screenshot - BAD)
		if (ratio > 1.8) return 0.05;

		// Ultra tall (Screenshot - BAD)
		if (ratio < 0.25) return 0.05;

		// Other
		return 0.3;
	}

	private getFileSizeScore(
		fileSize: number,
		dimensions: { width: number; height: number },
	): number {
		if (fileSize === 0) return 0.3; // Unknown

		const pixels = dimensions.width * dimensions.height;
		const bytesPerPixel = fileSize / pixels;

		// Documents compress well (lots of white space, text)
		// Typical document: 0.1-0.5 bytes per pixel
		if (bytesPerPixel < 0.1) return 0.7; // Very compressed (good)
		if (bytesPerPixel < 0.3) return 0.85; // Well compressed (very good)
		if (bytesPerPixel < 0.5) return 0.7; // Moderately compressed (good)
		if (bytesPerPixel < 1.0) return 0.4; // Some compression
		if (bytesPerPixel < 2.0) return 0.2; // Photo-like
		return 0.1; // Heavy photo
	}

	private getFilenameScore(fileName: string): number {
		// Positive indicators
		if (fileName.includes("scan")) return 0.9;
		if (fileName.includes("doc")) return 0.85;
		if (fileName.includes("receipt")) return 0.95;
		if (fileName.includes("קבלה")) return 0.95; // Hebrew receipt
		if (fileName.includes("invoice")) return 0.95;
		if (fileName.includes("חשבונית")) return 0.95; // Hebrew invoice
		if (fileName.includes("bill")) return 0.9;
		if (fileName.includes("contract")) return 0.9;
		if (fileName.includes("form")) return 0.85;
		if (fileName.includes("letter")) return 0.85;
		if (fileName.includes("pdf")) return 0.8; // Converted from PDF

		// Negative indicators
		if (fileName.includes("screenshot")) return 0;
		if (fileName.includes("img_")) return 0.2; // Camera photo
		if (fileName.includes("photo")) return 0.1;
		if (fileName.includes("selfie")) return 0;
		if (fileName.includes("meme")) return 0;
		if (fileName.includes("whatsapp")) return 0.1;
		if (fileName.includes("instagram")) return 0;
		if (fileName.includes("facebook")) return 0;

		return 0.3; // Neutral
	}

	private getScreenshotPenalty(fileName: string, aspectRatio: number): number {
		let penalty = 0;

		// Strong screenshot indicators
		if (fileName.includes("screenshot")) penalty += 0.5;
		if (fileName.includes("screen")) penalty += 0.3;

		// Aspect ratio indicators
		if (aspectRatio > 1.9) penalty += 0.3; // Very wide (mobile screenshot)
		if (aspectRatio > 2.1) penalty += 0.4; // Ultra wide

		// Platform indicators
		if (fileName.includes("ios_") || fileName.includes("android_"))
			penalty += 0.2;

		return Math.min(penalty, 0.7); // Cap penalty
	}

	private getPhotoPenalty(
		fileName: string,
		fileSize: number,
		aspectRatio: number,
	): number {
		let penalty = 0;

		// Photo indicators
		if (fileName.includes("img_")) penalty += 0.2;
		if (fileName.includes("photo")) penalty += 0.3;
		if (fileName.includes("camera")) penalty += 0.2;
		if (fileName.includes("dcim")) penalty += 0.15; // Camera folder
		if (fileName.includes("jpg") && fileSize > 2000000) penalty += 0.2; // Large JPEG

		// Social media indicators
		if (fileName.includes("whatsapp")) penalty += 0.3;
		if (fileName.includes("telegram")) penalty += 0.3;
		if (fileName.includes("instagram")) penalty += 0.4;
		if (fileName.includes("facebook")) penalty += 0.4;
		if (fileName.includes("snapchat")) penalty += 0.4;
		if (fileName.includes("tiktok")) penalty += 0.4;

		// Square photos (social media)
		if (aspectRatio > 0.95 && aspectRatio < 1.05) penalty += 0.3;

		return Math.min(penalty, 0.6); // Cap penalty
	}

	private getDocumentBoost(
		aspectRatio: number,
		fileSize: number,
		fileName: string,
	): number {
		let boost = 0;

		// Strong document indicators combo
		const hasDocumentName =
			fileName.includes("doc") ||
			fileName.includes("scan") ||
			fileName.includes("receipt") ||
			fileName.includes("invoice");
		const hasDocumentAspect =
			(aspectRatio > 0.65 && aspectRatio < 0.82) ||
			(aspectRatio > 1.22 && aspectRatio < 1.48);
		const hasGoodCompression = fileSize > 0 && fileSize < 1000000;

		if (hasDocumentName && hasDocumentAspect) boost += 0.3;
		if (hasDocumentAspect && hasGoodCompression) boost += 0.2;
		if (hasDocumentName && hasGoodCompression) boost += 0.15;

		// Receipt-specific boost
		if (aspectRatio > 0.25 && aspectRatio < 0.5 && hasGoodCompression) {
			boost += 0.25;
		}

		return Math.min(boost, 0.4); // Cap boost
	}

	private async getImageDimensions(
		uri: string,
	): Promise<{ width: number; height: number }> {
		return new Promise((resolve) => {
			Image.getSize(
				uri,
				(width, height) => resolve({ width, height }),
				() => resolve({ width: 1000, height: 1000 }), // Default on error
			);
		});
	}
}

export const visualDocumentDetector = new VisualDocumentDetector();
