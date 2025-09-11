// services/gallery/GalleryMonitorV2.ts
// Drop-in replacement for existing GalleryMonitor with enhanced tracking

// Enhanced scanner integrated into main GalleryScanner
import { improvedFileTracker } from "./ImprovedFileTracker";
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
		totalFiles: 0,
		processedFiles: 0,
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
	private async checkForChanges(): Promise<void> {
		try {
			console.log(
				"[GalleryMonitorV2] Checking for changes with fingerprint tracking",
			);

			// Get stats BEFORE scan
			const statsBefore = improvedFileTracker.getStats();

			// Quick discovery scan (no processing)
			await galleryScanner.startScan({
				type: "incremental",
				processImmediately: false, // Just discovery, no processing
				smartFilterEnabled: true,
				batchSize: 100,
			});

			// Get stats AFTER scan
			const statsAfter = improvedFileTracker.getStats();
			const scanProgress = galleryScanner.getProgress();

			// Calculate ACTUAL changes
			const newFiles = scanProgress.newFiles || 0;
			const changedFiles = scanProgress.changedFiles || 0;

			// Only calculate deletions if total files decreased
			let deletedFiles = 0;
			if (statsAfter.totalFiles < statsBefore.totalFiles) {
				deletedFiles = statsBefore.totalFiles - statsAfter.totalFiles;
			}

			const now = new Date();
			const isInitialRun = this.lastStats.lastCheckTime === null;
			const hasChanges = newFiles > 0 || changedFiles > 0 || deletedFiles > 0;

			// Create event with accurate data
			const event: GalleryChangeEvent = {
				newImagesCount: newFiles,
				changedImagesCount: changedFiles,
				deletedImagesCount: deletedFiles,
				totalImagesCount: statsAfter.totalFiles,
				hasNewImages: newFiles > 0,
				hasChanges,
				lastCheckTime: now,
				newImageUris: scanProgress.currentFile
					? [scanProgress.currentFile]
					: [],
				batchId: scanProgress.batchId,
			};

			// Update cached stats
			this.lastStats = {
				totalFiles: statsAfter.totalFiles,
				processedFiles: statsAfter.processedFiles,
				lastCheckTime: now,
			};

			await this.saveState();

			// Log meaningful changes only
			if (hasChanges) {
				console.log(
					`[GalleryMonitorV2] ✅ Real changes detected: ` +
						`+${newFiles} new, ~${changedFiles} changed, -${deletedFiles} deleted`,
				);
			} else if (!isInitialRun) {
				console.log(
					`[GalleryMonitorV2] No changes. Tracking ${statsAfter.totalFiles} files`,
				);
			}

			// Notify callbacks only for real changes or initial run
			if (hasChanges || isInitialRun) {
				this.callbacks.forEach((callback) => {
					try {
						callback(event);
					} catch (error) {
						console.error("[GalleryMonitorV2] Error in callback:", error);
					}
				});
			}
		} catch (error) {
			console.error("[GalleryMonitorV2] Error checking for changes:", error);
		}
	}

	/**
	 * Force immediate check (backward compatible)
	 */
	async forceCheck(): Promise<GalleryChangeEvent | null> {
		try {
			await this.checkForChanges();

			const stats = improvedFileTracker.getStats();
			return {
				newImagesCount: 0,
				changedImagesCount: 0,
				deletedImagesCount: 0,
				totalImagesCount: stats.totalFiles,
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
		const stats = improvedFileTracker.getStats();
		return {
			isMonitoring: this.isMonitoring,
			lastImageCount: stats.totalFiles, // For backward compatibility
			lastCheckTime: this.lastStats.lastCheckTime,
			callbackCount: this.callbacks.size,
			// New enhanced fields
			totalTrackedFiles: stats.totalFiles,
			processedFiles: stats.processedFiles,
			pendingFiles: stats.pendingFiles,
			failedFiles: stats.failedFiles,
		};
	}

	/**
	 * Get detailed statistics (new method)
	 */
	getDetailedStats() {
		return improvedFileTracker.getStats();
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
			totalFiles: 0,
			processedFiles: 0,
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
		await improvedFileTracker.cleanup(options);
	}

	/**
	 * State persistence
	 */
	private async loadState() {
		try {
			const state = (await ScannerStorage.getObject(this.STORAGE_KEY)) as any;
			if (state && typeof state === "object") {
				this.lastStats = {
					totalFiles: state.totalFiles || 0,
					processedFiles: state.processedFiles || 0,
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
				totalFiles: this.lastStats.totalFiles,
				processedFiles: this.lastStats.processedFiles,
				lastCheckTime: this.lastStats.lastCheckTime?.getTime(),
				timestamp: Date.now(),
			};
			await ScannerStorage.setObject(this.STORAGE_KEY, state);
		} catch (error) {
			console.error("[GalleryMonitorV2] Error saving state:", error);
		}
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
			const stats = improvedFileTracker.getStats();
			console.log(`[Migration] Migrated ${stats.totalFiles} files`);

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

/*
// ================================
// USAGE EXAMPLES
// ================================

// Export singleton instance (drop-in replacement)
export const galleryMonitor = GalleryMonitorV2.getInstance();

// Export new enhanced scanner for direct use
export { enhancedGalleryScanner } from "./EnhancedGalleryScanner";


 * Example: Update background scanner to use new system
 
export const exampleBackgroundScannerUpdate = `
// In backgroundScanner.ts, replace:

// OLD:
galleryMonitor.subscribe((event) => {
    if (event.hasNewImages) {
        console.log(\`New images detected: \${event.newImagesCount}\`);
        this.forceImmediateScan = true;
    }
});

// NEW (Option 1 - Keep same API):
galleryMonitor.subscribe((event) => {
    if (event.hasNewImages) {
        console.log(\`New images detected: \${event.newImagesCount}\`);
        // Now we also know WHICH images are new
        console.log(\`New image URIs: \${event.newImageUris}\`);
        this.forceImmediateScan = true;
    }
});

// NEW (Option 2 - Use enhanced scanner directly):
async performEnhancedBackgroundScan() {
    const result = await enhancedGalleryScanner.scan({
        type: "new_only",
        processImmediately: true,
        smartFilterEnabled: true,
        progressCallback: (progress) => {
            BackgroundService.updateNotification({
                taskDesc: \`Processing \${progress.current}/\${progress.total} images...\`,
                progressBar: {
                    max: progress.total,
                    value: progress.current,
                    indeterminate: false,
                },
            });
        }
    });
    
    console.log(\`Scan complete: \${result.newFiles.length} new documents found\`);
}
`;
*/
