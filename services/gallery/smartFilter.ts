import { Platform } from "react-native";
import RNFS from "react-native-fs";

export interface SmartFilterOptions {
	minFileSize: number; // in KB
	maxFileSize?: number; // in KB  
	maxAspectRatio: number;
	priorityKeywords: string[];
	skipPatterns: RegExp[];
	dateRange?: { start: Date; end: Date };
	excludeMimeTypes?: string[];
	includeScreenshots?: boolean;
}

export interface AssetInfo {
	uri: string;
	filename?: string;
	width?: number;
	height?: number;
	timestamp?: number;
	mimeType?: string;
	fileSize?: number;
}

export class SmartFilter {
	private static defaultOptions: SmartFilterOptions = {
		minFileSize: 100, // 100KB minimum
		maxFileSize: 50 * 1024, // 50MB maximum
		maxAspectRatio: 3, // Skip panoramas
		priorityKeywords: [
			"doc",
			"document",
			"receipt",
			"scan",
			"invoice",
			"bill",
			"contract",
			"form",
			"id",
			"passport",
			"license",
			"certificate",
			"report",
			"statement",
			"letter",
			"memo",
			"pdf",
		],
		skipPatterns: [
			/meme/i,
			/gif$/i,
			/wallpaper/i,
			/selfie/i,
			/thumbnail/i,
			/\.thumb\./i,
			/cache/i,
			/temp/i,
			/whatsapp.*images/i, // Skip WhatsApp media folder
			/facebook/i,
			/instagram/i,
			/snapchat/i,
			/twitter/i,
			/telegram/i,
		],
		includeScreenshots: false,
	};

	private options: SmartFilterOptions;

	constructor(options: Partial<SmartFilterOptions> = {}) {
		this.options = { ...SmartFilter.defaultOptions, ...options };
	}

	async shouldProcess(asset: AssetInfo): Promise<{
		shouldProcess: boolean;
		priority: number; // 0-10, higher means higher priority
		reason?: string;
	}> {
		// Check if it's a priority document based on filename
		const priority = this.calculatePriority(asset);
		
		// Always process high priority items
		if (priority >= 8) {
			return { shouldProcess: true, priority };
		}

		// Apply exclusion filters
		const exclusionResult = await this.checkExclusions(asset);
		if (!exclusionResult.pass) {
			return {
				shouldProcess: false,
				priority: 0,
				reason: exclusionResult.reason,
			};
		}

		// Apply inclusion filters
		const inclusionResult = await this.checkInclusions(asset);
		
		return {
			shouldProcess: inclusionResult.pass,
			priority: inclusionResult.pass ? priority : 0,
			reason: inclusionResult.reason,
		};
	}

	private calculatePriority(asset: AssetInfo): number {
		let priority = 5; // Base priority

		const filename = (asset.filename || "").toLowerCase();
		const path = (asset.uri || "").toLowerCase();

		// Check for priority keywords in filename
		for (const keyword of this.options.priorityKeywords) {
			if (filename.includes(keyword) || path.includes(keyword)) {
				priority += 3;
				break;
			}
		}

		// Check for document-related folders
		const documentFolders = ["documents", "downloads", "scans", "receipts"];
		for (const folder of documentFolders) {
			if (path.includes(`/${folder}/`)) {
				priority += 2;
				break;
			}
		}

		// Check for specific file patterns
		if (filename.match(/\d{4}-\d{2}-\d{2}/)) {
			// Date pattern in filename
			priority += 1;
		}

		if (filename.match(/invoice[\s_-]?\d+/i) || filename.match(/receipt[\s_-]?\d+/i)) {
			// Invoice or receipt with number
			priority += 2;
		}

		// Screenshots can be documents too (if enabled)
		if (this.options.includeScreenshots && this.isScreenshot(asset)) {
			priority += 1;
		}

		return Math.min(priority, 10);
	}

	private async checkExclusions(asset: AssetInfo): Promise<{
		pass: boolean;
		reason?: string;
	}> {
		const filename = (asset.filename || "").toLowerCase();
		const path = (asset.uri || "").toLowerCase();

		// Check skip patterns
		for (const pattern of this.options.skipPatterns) {
			if (pattern.test(filename) || pattern.test(path)) {
				return {
					pass: false,
					reason: `Matched skip pattern: ${pattern}`,
				};
			}
		}

		// Check aspect ratio
		if (
			this.options.maxAspectRatio &&
			asset.width &&
			asset.height &&
			asset.width > 0 &&
			asset.height > 0
		) {
			const aspectRatio =
				Math.max(asset.width, asset.height) /
				Math.min(asset.width, asset.height);
			
			if (aspectRatio > this.options.maxAspectRatio) {
				return {
					pass: false,
					reason: `Aspect ratio ${aspectRatio.toFixed(2)} exceeds maximum ${this.options.maxAspectRatio}`,
				};
			}
		}

		// Check date range
		if (this.options.dateRange && asset.timestamp) {
			const assetDate = new Date(asset.timestamp * 1000); // Convert to milliseconds
			if (
				assetDate < this.options.dateRange.start ||
				assetDate > this.options.dateRange.end
			) {
				return {
					pass: false,
					reason: "Outside specified date range",
				};
			}
		}

		// Check MIME type exclusions
		if (this.options.excludeMimeTypes && asset.mimeType) {
			if (this.options.excludeMimeTypes.includes(asset.mimeType)) {
				return {
					pass: false,
					reason: `Excluded MIME type: ${asset.mimeType}`,
				};
			}
		}

		// Check for screenshots (if not included)
		if (!this.options.includeScreenshots && this.isScreenshot(asset)) {
			return {
				pass: false,
				reason: "Screenshot excluded",
			};
		}

		return { pass: true };
	}

	private async checkInclusions(asset: AssetInfo): Promise<{
		pass: boolean;
		reason?: string;
	}> {
		// Check file size
		if (asset.fileSize !== undefined) {
			const sizeInKB = asset.fileSize / 1024;
			
			if (sizeInKB < this.options.minFileSize) {
				return {
					pass: false,
					reason: `File size ${sizeInKB.toFixed(1)}KB below minimum ${this.options.minFileSize}KB`,
				};
			}
			
			if (this.options.maxFileSize && sizeInKB > this.options.maxFileSize) {
				return {
					pass: false,
					reason: `File size ${sizeInKB.toFixed(1)}KB exceeds maximum ${this.options.maxFileSize}KB`,
				};
			}
		} else if (Platform.OS === "ios" && asset.uri) {
			// Try to get file size on iOS
			try {
				const fileInfo = await RNFS.stat(asset.uri);
				const sizeInKB = fileInfo.size / 1024;
				
				if (sizeInKB < this.options.minFileSize) {
					return {
						pass: false,
						reason: `File size ${sizeInKB.toFixed(1)}KB below minimum ${this.options.minFileSize}KB`,
					};
				}
				
				if (this.options.maxFileSize && sizeInKB > this.options.maxFileSize) {
					return {
						pass: false,
						reason: `File size ${sizeInKB.toFixed(1)}KB exceeds maximum ${this.options.maxFileSize}KB`,
					};
				}
			} catch (error) {
				// If we can't get file size, continue processing
			}
		}

		// Check if it appears to be a document-like image
		if (this.isDocumentLikeImage(asset)) {
			return { pass: true, reason: "Document-like image characteristics" };
		}

		return { pass: true };
	}

	private isScreenshot(asset: AssetInfo): boolean {
		const filename = (asset.filename || "").toLowerCase();
		const path = (asset.uri || "").toLowerCase();

		// Common screenshot patterns
		const screenshotPatterns = [
			/screenshot/i,
			/screen\s*shot/i,
			/screen\s*capture/i,
			/^img_\d+/i, // Common Android screenshot pattern
			/^photo_\d{4}-\d{2}-\d{2}/i, // iOS screenshot pattern
		];

		for (const pattern of screenshotPatterns) {
			if (pattern.test(filename) || pattern.test(path)) {
				return true;
			}
		}

		// Check for screenshot dimensions (exact device screen sizes)
		if (asset.width && asset.height) {
			const commonScreenSizes = [
				{ width: 1080, height: 1920 }, // Full HD
				{ width: 1440, height: 2560 }, // QHD
				{ width: 1125, height: 2436 }, // iPhone X/XS/11 Pro
				{ width: 1242, height: 2688 }, // iPhone XS Max/11 Pro Max
				{ width: 828, height: 1792 }, // iPhone XR/11
				{ width: 1170, height: 2532 }, // iPhone 12/13/14
				{ width: 1284, height: 2778 }, // iPhone 12/13/14 Pro Max
			];

			for (const size of commonScreenSizes) {
				if (
					(asset.width === size.width && asset.height === size.height) ||
					(asset.width === size.height && asset.height === size.width)
				) {
					return true;
				}
			}
		}

		return false;
	}

	private isDocumentLikeImage(asset: AssetInfo): boolean {
		// Check if image has document-like aspect ratio
		if (asset.width && asset.height) {
			const aspectRatio = asset.width / asset.height;
			
			// Common document aspect ratios
			const documentRatios = [
				{ ratio: 1.414, tolerance: 0.05 }, // A4 (√2:1)
				{ ratio: 1.294, tolerance: 0.05 }, // Letter (11:8.5)
				{ ratio: 1.0, tolerance: 0.1 }, // Square documents
			];

			for (const doc of documentRatios) {
				if (
					Math.abs(aspectRatio - doc.ratio) < doc.tolerance ||
					Math.abs(1 / aspectRatio - doc.ratio) < doc.tolerance
				) {
					return true;
				}
			}
		}

		return false;
	}

	updateOptions(options: Partial<SmartFilterOptions>) {
		this.options = { ...this.options, ...options };
	}

	getOptions(): SmartFilterOptions {
		return { ...this.options };
	}
}

export const smartFilter = new SmartFilter();