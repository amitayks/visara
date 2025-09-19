// services/progress/SmartProgressController.ts
import { progressTracker } from "./ProductionProgressTracker";
import { notificationProgress } from "../notifications/NotificationProgressManager";

/**
 * Smart controller that decides when to show progress UI
 * - Shows progress bar + notification for actual processing
 * - Hides both for monitoring/discovery scans
 */
export class SmartProgressController {
	private static instance: SmartProgressController;

	// Scan type detection
	private isMonitoringScan = false;
	private isProcessingScan = false;
	private scanStartTime = 0;
	private lastUpdateTime = 0;

	// Thresholds
	private readonly MIN_IMAGES_FOR_UI = 5; // Don't show UI for less than 5 images
	private readonly QUICK_SCAN_THRESHOLD = 3000; // 3 seconds = monitoring scan
	private readonly UPDATE_THROTTLE = 500; // Only update every 500ms

	private constructor() {}

	static getInstance(): SmartProgressController {
		if (!SmartProgressController.instance) {
			SmartProgressController.instance = new SmartProgressController();
		}
		return SmartProgressController.instance;
	}

	/**
	 * Called when scan starts
	 * Determines if UI should be shown based on scan type
	 */
	onScanStart(options: {
		totalImages: number;
		scanType?: "monitoring" | "processing" | "initial";
		isBackground?: boolean;
		scanNewOnly?: boolean;
	}): void {
		console.log("[SmartProgress] Scan starting:", options);

		this.scanStartTime = Date.now();

		// Determine scan type
		if (
			options.scanType === "monitoring" ||
			options.totalImages < this.MIN_IMAGES_FOR_UI
		) {
			// Monitoring scan - NO UI
			this.isMonitoringScan = true;
			this.isProcessingScan = false;

			console.log("[SmartProgress] Monitoring scan - UI disabled");

			// Don't show any progress UI
			progressTracker.hide();
			notificationProgress.forceHide();
		} else {
			// Processing scan - SHOW UI
			this.isMonitoringScan = false;
			this.isProcessingScan = true;

			console.log("[SmartProgress] Processing scan - UI enabled");

			// Start progress tracking
			progressTracker.start(options.totalImages);

			// Start notification if in background
			if (options.isBackground) {
				notificationProgress.startProcessingNotification(options.totalImages);
			}
		}
	}

	/**
	 * Called for each progress update
	 */
	onProgressUpdate(
		processed: number,
		total: number,
		currentFile: string | null,
	): void {
		// Skip UI updates for monitoring scans
		if (this.isMonitoringScan) {
			return;
		}

		// Throttle updates to prevent excessive re-renders
		const now = Date.now();
		if (now - this.lastUpdateTime < this.UPDATE_THROTTLE) {
			return;
		}
		this.lastUpdateTime = now;

		// Update progress for processing scans
		if (this.isProcessingScan) {
			progressTracker.update(processed, currentFile);
		}
	}

	/**
	 * Called when scan completes
	 */
	onScanComplete(stats: {
		totalProcessed: number;
		newImages: number;
		duration: number;
	}): void {
		console.log("[SmartProgress] Scan complete:", stats);

		// Hide progress UI
		if (this.isProcessingScan) {
			progressTracker.complete();
			notificationProgress.hideNotification();
		}

		// Reset state
		this.isMonitoringScan = false;
		this.isProcessingScan = false;
		this.scanStartTime = 0;
		this.lastUpdateTime = 0;
	}

	/**
	 * Force hide all progress UI
	 */
	hideAll(): void {
		progressTracker.hide();
		notificationProgress.forceHide();
		this.isMonitoringScan = false;
		this.isProcessingScan = false;
		this.lastUpdateTime = 0;
	}

	/**
	 * Check if we should show UI for current scan
	 */
	shouldShowUI(): boolean {
		return this.isProcessingScan && !this.isMonitoringScan;
	}

	/**
	 * Get scan start time for duration calculation
	 */
	getScanStartTime(): number {
		return this.scanStartTime;
	}
}

// Export singleton
export const smartProgress = SmartProgressController.getInstance();

// ============================================
// Integration Helpers
// ============================================

/**
 * Helper function to determine scan type from options
 */
export function detectScanType(options: {
	scanNewOnly?: boolean;
	totalImages?: number;
	isBackground?: boolean;
	source?: "manual" | "background" | "monitor";
}): "monitoring" | "processing" | "initial" {
	// Quick checks are monitoring
	if (options.source === "monitor") {
		return "monitoring";
	}

	// Small batches are monitoring
	if (options.totalImages && options.totalImages < 5) {
		return "monitoring";
	}

	// Background scans with scanNewOnly are monitoring
	if (
		options.isBackground &&
		options.scanNewOnly &&
		options.totalImages === 0
	) {
		return "monitoring";
	}

	// Everything else is processing
	return "processing";
}

/**
 * Wrapper for gallery scanner to add smart progress
 */
export function wrapScannerWithProgress(scanner: any) {
	const originalStartScan = scanner.startScan.bind(scanner);

	scanner.startScan = async (options: any, progressCallback?: any) => {
		// Detect scan type
		const scanType = detectScanType({
			...options,
			totalImages: (await scanner.getTotalImagesCount?.()) || 0,
		});

		// Configure smart progress
		smartProgress.onScanStart({
			totalImages: options.totalImages || 0,
			scanType,
			isBackground: options.isBackground || false,
			scanNewOnly: options.scanNewOnly || false,
		});

		// Wrap progress callback
		const wrappedCallback = progressCallback
			? (progress: any) => {
					// Update smart progress
					smartProgress.onProgressUpdate(
						progress.processedImages,
						progress.totalImages,
						progress.currentFile,
					);

					// Call original callback
					progressCallback(progress);
				}
			: undefined;

		try {
			// Run original scan
			const result = await originalStartScan(options, wrappedCallback);

			// Complete
			smartProgress.onScanComplete({
				totalProcessed: scanner.getProgress().processedImages,
				newImages: scanner.getProgress().newFiles || 0,
				duration: Date.now() - smartProgress.getScanStartTime(),
			});

			return result;
		} catch (error) {
			// Hide on error
			smartProgress.hideAll();
			throw error;
		}
	};

	return scanner;
}
