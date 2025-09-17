// services/gallery/GalleryMonitorV2.ts
// Drop-in replacement for existing GalleryMonitor with enhanced tracking

// Enhanced scanner integrated into main GalleryScanner
import { fixedImageTracker } from "./FixedImageTracker";
import { galleryScanner } from "./GalleryScanner";
import { AppState, AppStateStatus } from "react-native";
import { ScannerStorage } from "../../storage/MMKVStorage";

export interface GalleryChangeEvent {
	newImagesCount: number;
	changedImagesCount: number;
	deletedImagesCount: number;
	totalImagesCount: number;
	hasNewImages: boolean;
	hasChanges: boolean;
	lastCheckTime: Date;
	// New fields
	newImageUris?: string[];
	changedImageUris?: string[];
	batchId?: string;
}

interface MonitorOptions {
	triggerScan?: boolean;
}

type GalleryChangeCallback = (event: GalleryChangeEvent) => void;

/**
 * Enhanced Gallery Monitor - Drop-in replacement for old GalleryMonitor
 * Maintains same API but uses fingerprint tracking internally
 */
export class GalleryMonitorV2 {
	private static instance: GalleryMonitorV2 | null = null;
	private isMonitoring = false;
	private monitorInterval: NodeJS.Timeout | null = null;
	private callbacks: Set<GalleryChangeCallback> = new Set();
	private appState: AppStateStatus = AppState.currentState;
	private appStateSubscription: any = null;

	// Configuration
	private readonly MONITOR_INTERVAL = 60 * 1000; // 60 seconds
	private readonly STORAGE_KEY = "gallery_monitor_v2_state";

	// Cached stats for quick checks
	private lastStats = {
		totalImages: 0,
		processedImages: 0,
		lastCheckTime: null as Date | null,
	};

	static getInstance(): GalleryMonitorV2 {
		if (!GalleryMonitorV2.instance) {
			GalleryMonitorV2.instance = new GalleryMonitorV2();
		}
		return GalleryMonitorV2.instance;
	}

	private constructor() {
		this.loadState();

		// Listen to app state changes
		this.appStateSubscription = AppState.addEventListener(
			"change",
			this.handleAppStateChange,
		);
	}

	private handleAppStateChange = (nextAppState: AppStateStatus) => {
		const prevState = this.appState;
		this.appState = nextAppState;

		if (prevState.match(/inactive|background/) && nextAppState === "active") {
			// App came to foreground
			console.log("[GalleryMonitorV2] App foregrounded, checking for changes");
			this.checkForChanges();
		}
	};

	/**
	 * Start monitoring for gallery changes
	 * Backward compatible with old API
	 */
	async startMonitoring(): Promise<void> {
		if (this.isMonitoring) {
			console.log("[GalleryMonitorV2] Already monitoring");
			return;
		}

		console.log("[GalleryMonitorV2] Starting enhanced monitoring");
		this.isMonitoring = true;

		// Do initial check
		await this.checkForChanges();

		// Start periodic monitoring
		this.monitorInterval = setInterval(() => {
			this.checkForChanges();
		}, this.MONITOR_INTERVAL);
	}

	/**
	 * Stop monitoring
	 */
	stopMonitoring(): void {
		if (!this.isMonitoring) return;

		console.log("[GalleryMonitorV2] Stopping monitoring");
		this.isMonitoring = false;

		if (this.monitorInterval) {
			clearInterval(this.monitorInterval);
			this.monitorInterval = null;
		}
	}

	/**
	 * Main change detection using enhanced file tracking
	 */
	// async checkForChanges(options: MonitorOptions = {}): Promise<void> {
	// 	try {
	// 		console.log(
	// 			"[GalleryMonitorV2] Checking for changes with fingerprint tracking",
	// 		);

	// 		// Get stats BEFORE scan
	// 		const statsBefore = fixedImageTracker.getStats();

	// 		// Quick discovery scan (no processing)
	// 		await galleryScanner.startScan({
	// 			type: "incremental",
	// 			processImmediately: false, // Just discovery, no processing
	// 			scanNewOnly: true, // Only look for new images
	// 			batchSize: 100,
	// 		});

	// 		// Get stats AFTER scan
	// 		const statsAfter = fixedImageTracker.getStats();
	// 		const scanProgress = galleryScanner.getProgress();

	// 		// Calculate ACTUAL changes
	// 		const newFiles = scanProgress.newFiles || 0;
	// 		const changedFiles = scanProgress.changedFiles || 0;

	// 		// Only calculate deletions if total files decreased
	// 		let deletedFiles = 0;
	// 		if (statsAfter.totalImages < statsBefore.totalImages) {
	// 			deletedFiles = statsBefore.totalImages - statsAfter.totalImages;
	// 		}

	// 		const now = new Date();
	// 		const isInitialRun = this.lastStats.lastCheckTime === null;
	// 		const hasChanges = newFiles > 0 || changedFiles > 0 || deletedFiles > 0;

	// 		// Create event with accurate data
	// 		const event: GalleryChangeEvent = {
	// 			newImagesCount: newFiles,
	// 			changedImagesCount: changedFiles,
	// 			deletedImagesCount: deletedFiles,
	// 			totalImagesCount: statsAfter.totalImages,
	// 			hasNewImages: newFiles > 0,
	// 			hasChanges,
	// 			lastCheckTime: now,
	// 			newImageUris: scanProgress.currentFile
	// 				? [scanProgress.currentFile]
	// 				: [],
	// 			batchId: scanProgress.batchId,
	// 		};

	// 		// Update cached stats
	// 		this.lastStats = {
	// 			totalImages: statsAfter.totalImages,
	// 			processedImages: statsAfter.processedImages,
	// 			lastCheckTime: now,
	// 		};

	// 		await this.saveState();

	// 		// Log meaningful changes only
	// 		if (hasChanges) {
	// 			console.log(
	// 				`[GalleryMonitorV2] ✅ Real changes detected: ` +
	// 					`+${newFiles} new, ~${changedFiles} changed, -${deletedFiles} deleted`,
	// 			);

	// 			// CRITICAL: Trigger scan if new files detected
	// 			if (newFiles > 0 && !galleryScanner.getProgress().isScanning) {
	// 				console.log(
	// 					`[GalleryMonitorV2] Triggering scan for ${newFiles} new files`,
	// 				);

	// 				// Use a small delay to prevent race conditions
	// 				setTimeout(async () => {
	// 					try {
	// 						await galleryScanner.startScan({
	// 							type: "incremental",
	// 							processImmediately: true,
	// 							scanNewOnly: true,
	// 						});
	// 					} catch (error) {
	// 						console.error("[GalleryMonitorV2] Failed to start scan:", error);
	// 					}
	// 				}, 1000);
	// 			}
	// 		} else if (!isInitialRun) {
	// 			console.log(
	// 				`[GalleryMonitorV2] No changes. Tracking ${statsAfter.totalImages} files`,
	// 			);
	// 		}

	// 		// Notify callbacks only for real changes or initial run
	// 		if (hasChanges || isInitialRun) {
	// 			this.callbacks.forEach((callback) => {
	// 				try {
	// 					callback(event);
	// 				} catch (error) {
	// 					console.error("[GalleryMonitorV2] Error in callback:", error);
	// 				}
	// 			});
	// 		}
	// 	} catch (error) {
	// 		console.error("[GalleryMonitorV2] Error checking for changes:", error);
	// 	}
	// }

	// services/gallery/GalleryMonitorV2.ts
	async checkForChanges(): Promise<void> {
		try {
			// Get stats before
			const statsBefore = galleryScanner.getStats();

			// Quick scan for new images only
			await galleryScanner.startScan({
				scanNewOnly: true,
				processImmediately: false, // Just discovery
				batchSize: 100,
			});

			// Get stats after
			const statsAfter = galleryScanner.getStats();

			// Check for new images
			const newImages = statsAfter.totalImages - statsBefore.totalImages;

			if (newImages > 0) {
				console.log(`[GalleryMonitorV2] Found ${newImages} new images`);

				// Emit event for listeners
				this.emitChangeEvent({
					newImagesCount: newImages,
					hasNewImages: true,
					totalImagesCount: statsAfter.totalImages,
				});
			}
		} catch (error) {
			console.error("[GalleryMonitorV2] Check failed:", error);
		}
	}

	/**
	 * Force immediate check (backward compatible)
	 */
	async forceCheck(): Promise<GalleryChangeEvent | null> {
		try {
			await this.checkForChanges();

			const stats = fixedImageTracker.getStats();
			return {
				newImagesCount: 0,
				changedImagesCount: 0,
				deletedImagesCount: 0,
				totalImagesCount: stats.totalImages,
				hasNewImages: false,
				hasChanges: false,
				lastCheckTime: this.lastStats.lastCheckTime || new Date(),
			};
		} catch (error) {
			console.error("[GalleryMonitorV2] Error in force check:", error);
			return null;
		}
	}

	/**
	 * Subscribe to gallery changes (backward compatible)
	 */
	subscribe(callback: GalleryChangeCallback): () => void {
		this.callbacks.add(callback);
		return () => {
			this.callbacks.delete(callback);
		};
	}

	/**
	 * Get current status (backward compatible)
	 */
	getStatus() {
		const stats = fixedImageTracker.getStats();
		return {
			isMonitoring: this.isMonitoring,
			lastImageCount: stats.totalImages, // For backward compatibility
			lastCheckTime: this.lastStats.lastCheckTime,
			callbackCount: this.callbacks.size,
			// New enhanced fields
			totalTrackedFiles: stats.totalImages,
			processedImages: stats.processedImages,
			pendingImages: stats.pendingImages,
			failedImages: stats.failedImages,
		};
	}

	/**
	 * Get detailed statistics (new method)
	 */
	getDetailedStats() {
		return fixedImageTracker.getStats();
	}

	/**
	 * Reset monitor state (backward compatible)
	 */
	async reset(): Promise<void> {
		console.log("[GalleryMonitorV2] Resetting monitor state");

		// Stop monitoring
		this.stopMonitoring();

		// Clear callbacks
		this.callbacks.clear();

		// Reset stats
		this.lastStats = {
			totalImages: 0,
			processedImages: 0,
			lastCheckTime: null,
		};

		// Clear storage
		await ScannerStorage.removeItem(this.STORAGE_KEY);

		// Note: We don't clear the file tracker data
		// Use cleanup() for that if needed
	}

	/**
	 * Cleanup old tracking data (new method)
	 */
	async cleanupTrackingData(options?: {
		daysToKeep?: number;
		keepFailed?: boolean;
		removeOrphans?: boolean;
	}): Promise<void> {
		await fixedImageTracker.clearAll();
	}

	/**
	 * State persistence
	 */
	private async loadState() {
		try {
			const state = (await ScannerStorage.getObject(this.STORAGE_KEY)) as any;
			if (state && typeof state === "object") {
				this.lastStats = {
					totalImages: state.totalImages || 0,
					processedImages: state.processedImages || 0,
					lastCheckTime: state.lastCheckTime
						? new Date(state.lastCheckTime)
						: null,
				};

				console.log("[GalleryMonitorV2] Loaded state:", this.lastStats);
			}
		} catch (error) {
			console.error("[GalleryMonitorV2] Error loading state:", error);
		}
	}

	private async saveState() {
		try {
			const state = {
				totalImages: this.lastStats.totalImages,
				processedImages: this.lastStats.processedImages,
				lastCheckTime: this.lastStats.lastCheckTime?.getTime(),
				timestamp: Date.now(),
			};
			await ScannerStorage.setObject(this.STORAGE_KEY, state);
		} catch (error) {
			console.error("[GalleryMonitorV2] Error saving state:", error);
		}
	}

	/**
	 * Emit change event to all callbacks
	 */
	private emitChangeEvent(event: Partial<GalleryChangeEvent>): void {
		const fullEvent: GalleryChangeEvent = {
			newImagesCount: 0,
			changedImagesCount: 0,
			deletedImagesCount: 0,
			totalImagesCount: 0,
			hasNewImages: false,
			hasChanges: false,
			lastCheckTime: new Date(),
			...event,
		};

		this.callbacks.forEach((callback) => {
			try {
				callback(fullEvent);
			} catch (error) {
				console.error("[GalleryMonitorV2] Error in callback:", error);
			}
		});
	}

	/**
	 * Cleanup on destroy
	 */
	cleanup(): void {
		console.log("[GalleryMonitorV2] Cleaning up");
		this.stopMonitoring();
		this.callbacks.clear();

		if (this.appStateSubscription) {
			this.appStateSubscription.remove();
			this.appStateSubscription = null;
		}
	}
}

// ================================
// MIGRATION HELPER
// ================================

/**
 * Seamless migration from old to new system
 */
export async function migrateToV2(): Promise<void> {
	console.log("[Migration] Starting migration to GalleryMonitorV2");

	try {
		// 1. Check if old data exists
		const oldMonitorState = await ScannerStorage.getObject(
			"gallery_monitor_state",
		);
		const oldProcessedHashes = await ScannerStorage.getObject<string[]>(
			"processed_image_hashes",
		);

		if (oldMonitorState || oldProcessedHashes) {
			console.log("[Migration] Found old data to migrate");

			// 2. Initialize new system
			const monitor = GalleryMonitorV2.getInstance();

			// 3. File tracker will auto-migrate hashes in its constructor
			// Just need to ensure it's initialized
			const stats = fixedImageTracker.getStats();
			console.log(`[Migration] Migrated ${stats.totalImages} files`);

			// 4. Clean up old data (optional, can keep for rollback)
			// await ScannerStorage.removeItem("gallery_monitor_state");
			// await ScannerStorage.removeItem("processed_image_hashes");

			console.log("[Migration] Migration completed successfully");
		} else {
			console.log("[Migration] No old data found, starting fresh");
		}
	} catch (error) {
		console.error("[Migration] Migration failed:", error);
		throw error;
	}
}
