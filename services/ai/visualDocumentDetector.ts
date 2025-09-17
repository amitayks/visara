import { Image, NativeModules, Platform } from "react-native";
import RNFS from "react-native-fs";
import ImageResizer from "@bam.tech/react-native-image-resizer";
import { ImagePixelAnalyzer } from "./ImagePixelAnalyzer";

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
	documentType?:
		| "receipt"
		| "invoice"
		| "photo"
		| "screenshot"
		| "meme"
		| "unknown";
}

export class VisualDocumentDetector {
	/**
	 * Properly detect if an image is likely a document
	 * This implementation actually analyzes the image pixels
	 */
	async detectDocument(imageUri: string): Promise<DocumentFeatures> {
		try {
			console.log(
				`[VisualDetector] Analyzing: ${imageUri.substring(imageUri.lastIndexOf("/") + 1)}`,
			);

			// 1. Get image dimensions
			const dimensions = await this.getImageDimensions(imageUri);
			const aspectRatio = dimensions.width / dimensions.height;

			// 2. Create a small thumbnail for quick analysis (saves memory)
			const thumbnailUri = await this.createThumbnail(imageUri);

			// 3. Analyze the actual image data
			const pixelData = await this.analyzePixels(thumbnailUri);

			// 4. Check for document-specific patterns
			const documentPatterns = this.detectDocumentPatterns(pixelData);

			// 5. Calculate individual scores
			const scores = {
				// Text presence score (documents have high text density)
				textScore: this.calculateTextScore(pixelData),

				// Color distribution (documents are usually monochrome or low saturation)
				colorScore: this.calculateColorScore(pixelData),

				// Structure score (documents have regular patterns)
				structureScore: this.calculateStructureScore(documentPatterns),

				// Aspect ratio score (documents have standard ratios)
				aspectScore: this.calculateAspectScore(aspectRatio),

				// Edge detection (documents have sharp edges)
				edgeScore: this.calculateEdgeScore(pixelData),

				// Whitespace score (documents have organized whitespace)
				whitespaceScore: this.calculateWhitespaceScore(pixelData),
			};

			// 6. Apply different weights based on detected patterns
			const weights = this.determineWeights(pixelData, aspectRatio);

			// 7. Calculate overall score
			const overallScore =
				scores.textScore * weights.text +
				scores.colorScore * weights.color +
				scores.structureScore * weights.structure +
				scores.aspectScore * weights.aspect +
				scores.edgeScore * weights.edge +
				scores.whitespaceScore * weights.whitespace;

			// 8. Determine document type
			const documentType = this.classifyImageType(
				scores,
				pixelData,
				aspectRatio,
			);

			// Clean up thumbnail
			await this.cleanupThumbnail(thumbnailUri);

			const result = {
				hasRectangularShape: scores.edgeScore > 0.7,
				edgeDensity: scores.edgeScore,
				textRegionCount: pixelData.hasText ? Math.floor(scores.textScore * 10) : 2,
				contrastRatio: pixelData.contrast,
				whiteSpaceRatio: scores.whitespaceScore,
				aspectRatio,
				overallScore,
				textDensity: scores.textScore,
				colorVariance: pixelData.colorVariance,
				hasTableStructure: documentPatterns.hasTable,
				hasStraightLines: documentPatterns.hasLines,
				documentType,
			};

			console.log(`[VisualDetector] Results:`, {
				type: documentType,
				score: overallScore.toFixed(3),
				isDocument: overallScore >= 0.5,
				scores: Object.entries(scores)
					.map(([k, v]) => `${k}: ${v.toFixed(2)}`)
					.join(", "),
			});

			return result;
		} catch (error) {
			console.error("[VisualDetector] Analysis failed:", error);
			return this.getDefaultFeatures();
		}
	}

	/**
	 * Create a small thumbnail for analysis (saves memory)
	 */
	private async createThumbnail(imageUri: string): Promise<string> {
		try {
			// Resize to 200px width for analysis (much faster and uses less memory)
			const resized = await ImageResizer.createResizedImage(
				imageUri,
				200, // width
				200, // height
				"JPEG",
				80, // quality
				0, // rotation
				undefined,
				true, // keep meta
			);

			return resized.uri;
		} catch (error) {
			console.warn(
				"[VisualDetector] Thumbnail creation failed, using original",
			);
			return imageUri;
		}
	}

	/**
	 * Analyze pixel data from the image using the ImagePixelAnalyzer
	 */
	private async analyzePixels(imageUri: string): Promise<any> {
		// Use the new ImagePixelAnalyzer
		const analysis = await ImagePixelAnalyzer.analyzeImage(imageUri);
		
		return {
			contrast: analysis.contrast,
			colorVariance: analysis.colorCount > 50 ? 0.8 : 0.2,
			whiteSpaceRatio: analysis.contrast > 0.7 ? 0.4 : 0.1,
			edgeStrength: analysis.edgeStrength,
			compressionRatio: analysis.colorCount < 20 ? 0.8 : 0.3,
			hasText: analysis.hasText,
			isMonochrome: analysis.colorCount < 15,
			brightness: analysis.brightness,
			saturation: analysis.colorCount > 100 ? 0.7 : 0.2,
		};
	}

	/**
	 * Detect document-specific patterns
	 */
	private detectDocumentPatterns(pixelData: any): any {
		const patterns = {
			hasTable: false,
			hasLines: false,
			hasHeader: false,
			hasFooter: false,
			columnCount: 1,
			textBlocks: 0,
		};

		// High contrast and low color variance suggests text document
		if (pixelData.contrast > 0.7 && pixelData.colorVariance < 0.3) {
			patterns.hasLines = true;
			patterns.textBlocks = 5;
		}

		// Very high contrast with compression suggests receipt/invoice
		if (pixelData.contrast > 0.75 && pixelData.compressionRatio > 0.7) {
			patterns.hasTable = true;
			patterns.hasHeader = true;
			patterns.columnCount = 2;
		}

		return patterns;
	}

	/**
	 * Calculate text presence score
	 */
	private calculateTextScore(pixelData: any): number {
		// High contrast + low color variance = likely text
		if (pixelData.contrast > 0.7 && pixelData.colorVariance < 0.3) {
			return 0.9;
		}
		if (pixelData.contrast > 0.6 && pixelData.colorVariance < 0.4) {
			return 0.7;
		}
		if (pixelData.hasText) {
			return 0.5;
		}
		return 0.2;
	}

	/**
	 * Calculate color distribution score
	 */
	private calculateColorScore(pixelData: any): number {
		// Documents are usually monochrome or very low saturation
		if (pixelData.isMonochrome) {
			return 0.95;
		}
		if (pixelData.saturation < 0.2) {
			return 0.8;
		}
		if (pixelData.saturation < 0.4) {
			return 0.5;
		}
		// High saturation = probably a photo or meme
		return 0.1;
	}

	/**
	 * Calculate structure score based on patterns
	 */
	private calculateStructureScore(patterns: any): number {
		let score = 0.3; // Base score

		if (patterns.hasTable) score += 0.3;
		if (patterns.hasLines) score += 0.2;
		if (patterns.hasHeader) score += 0.1;
		if (patterns.textBlocks > 3) score += 0.1;

		return Math.min(score, 1.0);
	}

	/**
	 * Calculate aspect ratio score
	 */
	private calculateAspectScore(aspectRatio: number): number {
		// A4 portrait: ~0.707
		if (aspectRatio > 0.65 && aspectRatio < 0.75) {
			return 0.95;
		}
		// A4 landscape: ~1.414
		if (aspectRatio > 1.3 && aspectRatio < 1.5) {
			return 0.95;
		}
		// Letter portrait: ~0.773
		if (aspectRatio > 0.75 && aspectRatio < 0.8) {
			return 0.9;
		}
		// Receipt (narrow): ~0.3-0.5
		if (aspectRatio > 0.3 && aspectRatio < 0.5) {
			return 0.85;
		}
		// Square (probably Instagram/social media)
		if (aspectRatio > 0.95 && aspectRatio < 1.05) {
			return 0.2;
		}
		// Very wide or very tall (probably screenshot or photo)
		if (aspectRatio < 0.3 || aspectRatio > 2) {
			return 0.1;
		}
		return 0.4;
	}

	/**
	 * Calculate edge score (documents have sharp edges)
	 */
	private calculateEdgeScore(pixelData: any): number {
		return pixelData.edgeStrength || 0.5;
	}

	/**
	 * Calculate whitespace organization score
	 */
	private calculateWhitespaceScore(pixelData: any): number {
		// Documents have organized whitespace
		if (pixelData.whiteSpaceRatio > 0.3 && pixelData.whiteSpaceRatio < 0.6) {
			return 0.8;
		}
		if (pixelData.whiteSpaceRatio > 0.2 && pixelData.whiteSpaceRatio < 0.7) {
			return 0.5;
		}
		// Too little or too much whitespace = not a document
		return 0.2;
	}

	/**
	 * Determine scoring weights based on detected patterns
	 */
	private determineWeights(pixelData: any, aspectRatio: number): any {
		// If it looks like a screenshot (wide aspect, medium contrast)
		if (aspectRatio > 1.7 && pixelData.contrast < 0.65) {
			return {
				text: 0.15,
				color: 0.15,
				structure: 0.15,
				aspect: 0.3, // Penalize screenshot aspect ratios
				edge: 0.15,
				whitespace: 0.1,
			};
		}

		// If it looks like a photo (high color variance, low contrast)
		if (pixelData.colorVariance > 0.6 && pixelData.contrast < 0.6) {
			return {
				text: 0.1,
				color: 0.4, // Heavily weight against colorful images
				structure: 0.1,
				aspect: 0.2,
				edge: 0.1,
				whitespace: 0.1,
			};
		}

		// Standard document weights
		return {
			text: 0.25,
			color: 0.2,
			structure: 0.2,
			aspect: 0.15,
			edge: 0.1,
			whitespace: 0.1,
		};
	}

	/**
	 * Classify the type of image
	 */
	private classifyImageType(
		scores: any,
		pixelData: any,
		aspectRatio: number,
	): DocumentFeatures["documentType"] {
		const overallScore =
			scores.textScore * 0.25 +
			scores.colorScore * 0.2 +
			scores.structureScore * 0.2 +
			scores.aspectScore * 0.15 +
			scores.edgeScore * 0.1 +
			scores.whitespaceScore * 0.1;

		// Clear photo indicators
		if (pixelData.colorVariance > 0.7 && pixelData.saturation > 0.6) {
			return "photo";
		}

		// Screenshot indicators
		if (aspectRatio > 1.7 && scores.aspectScore < 0.3) {
			return "screenshot";
		}

		// Meme indicators (square-ish, some text, high saturation)
		if (
			aspectRatio > 0.9 &&
			aspectRatio < 1.1 &&
			scores.textScore > 0.3 &&
			pixelData.saturation > 0.4
		) {
			return "meme";
		}

		// Document indicators
		if (overallScore > 0.6 && scores.structureScore > 0.5) {
			// Receipt (narrow aspect, high contrast)
			if (aspectRatio < 0.5 && pixelData.contrast > 0.75) {
				return "receipt";
			}
			// Invoice (standard aspect, table structure)
			if (scores.structureScore > 0.7) {
				return "invoice";
			}
		}

		return overallScore > 0.5 ? "unknown" : "photo";
	}

	/**
	 * Clean up temporary thumbnail
	 */
	private async cleanupThumbnail(thumbnailUri: string): Promise<void> {
		try {
			if (thumbnailUri.includes("resized")) {
				await RNFS.unlink(thumbnailUri);
			}
		} catch (error) {
			// Ignore cleanup errors
		}
	}

	/**
	 * Get image dimensions
	 */
	private async getImageDimensions(
		uri: string,
	): Promise<{ width: number; height: number }> {
		return new Promise((resolve, reject) => {
			Image.getSize(
				uri,
				(width, height) => resolve({ width, height }),
				(error) => {
					console.error("[VisualDetector] Failed to get dimensions:", error);
					resolve({ width: 1000, height: 1000 }); // Default
				},
			);
		});
	}

	/**
	 * Default features for error cases
	 */
	private getDefaultFeatures(): DocumentFeatures {
		return {
			hasRectangularShape: false,
			edgeDensity: 0,
			textRegionCount: 0,
			contrastRatio: 0,
			whiteSpaceRatio: 0,
			aspectRatio: 1,
			overallScore: 0,
			textDensity: 0,
			colorVariance: 1,
			hasTableStructure: false,
			hasStraightLines: false,
			documentType: "unknown",
		};
	}
}

export const visualDocumentDetector = new VisualDocumentDetector();
