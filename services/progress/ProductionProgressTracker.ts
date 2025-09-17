// services/progress/ProductionProgressTracker.ts
// Enhanced version with all edge cases handled

import { BehaviorSubject } from "rxjs";
import { AppState, AppStateStatus } from "react-native";
import { ScannerStorage } from "../../storage/MMKVStorage";

export interface SimpleProgress {
	isActive: boolean;
	currentFile: string | null;
	processed: number;
	total: number;
	percentage: number;
	startTime?: number;
	estimatedTimeRemaining?: number;
}

class ProductionProgressTracker {
	private static instance: ProductionProgressTracker;

	private progress$ = new BehaviorSubject<SimpleProgress>({
		isActive: false,
		currentFile: null,
		processed: 0,
		total: 0,
		percentage: 0,
	});

	private hideTimer: NodeJS.Timeout | null = null;
	private appStateSubscription: any = null;
	private lastUpdateTime: number = 0;
	private processingRate: number = 0; // images per second

	// Constants
	private readonly STORAGE_KEY = "@scan_progress_state";
	private readonly MIN_UPDATE_INTERVAL = 100; // ms - prevent too frequent updates
	private readonly AUTO_HIDE_DELAY = 2000; // ms
	private readonly STALE_THRESHOLD = 30000; // 30 seconds - consider scan stuck

	private constructor() {
		this.initializeAppStateListener();
		this.loadSavedState();
	}

	static getInstance(): ProductionProgressTracker {
		if (!ProductionProgressTracker.instance) {
			ProductionProgressTracker.instance = new ProductionProgressTracker();
		}
		return ProductionProgressTracker.instance;
	}

	/**
	 * Listen for app state changes to handle background/foreground
	 */
	private initializeAppStateListener(): void {
		this.appStateSubscription = AppState.addEventListener(
			"change",
			this.handleAppStateChange.bind(this),
		);
	}

	/**
	 * Handle app state changes
	 */
	private handleAppStateChange(nextAppState: AppStateStatus): void {
		if (nextAppState === "background") {
			// Save state when going to background
			this.saveState();
		} else if (nextAppState === "active") {
			// Check for stale progress when returning
			this.checkForStaleProgress();
		}
	}

	/**
	 * Save current state to MMKV Storage
	 */
	private async saveState(): Promise<void> {
		try {
			const current = this.progress$.getValue();
			if (current.isActive) {
				await ScannerStorage.setObject(this.STORAGE_KEY, {
					...current,
					savedAt: Date.now(),
				});
			}
		} catch (error) {
			console.error("[ProgressTracker] Failed to save state:", error);
		}
	}

	/**
	 * Load saved state from MMKV Storage
	 */
	private async loadSavedState(): Promise<void> {
		try {
			const saved = await ScannerStorage.getObject(this.STORAGE_KEY) as any;
			if (saved) {
				const age = Date.now() - (saved.savedAt || 0);

				// Only restore if less than 5 minutes old
				if (age < 300000) {
					this.progress$.next({
						...saved,
						isActive: false, // Don't show as active on load
					});
				}

				// Clear saved state
				await ScannerStorage.removeItem(this.STORAGE_KEY);
			}
		} catch (error) {
			console.error("[ProgressTracker] Failed to load state:", error);
		}
	}

	/**
	 * Check if current progress is stale
	 */
	private checkForStaleProgress(): void {
		const current = this.progress$.getValue();
		if (current.isActive) {
			const timeSinceUpdate = Date.now() - this.lastUpdateTime;
			if (timeSinceUpdate > this.STALE_THRESHOLD) {
				console.warn("[ProgressTracker] Stale progress detected, hiding");
				this.hide();
			}
		}
	}

	/**
	 * Start tracking with validation
	 */
	start(totalImages: number): void {
		// Validate input
		if (totalImages <= 0) {
			console.warn("[ProgressTracker] Invalid total images:", totalImages);
			return;
		}

		// Clear any existing hide timer
		this.clearTimers();

		const progress: SimpleProgress = {
			isActive: true,
			currentFile: null,
			processed: 0,
			total: totalImages,
			percentage: 0,
			startTime: Date.now(),
			estimatedTimeRemaining: 0,
		};

		this.progress$.next(progress);
		this.lastUpdateTime = Date.now();

		console.log("[ProgressTracker] Started tracking", totalImages, "images");
	}

	/**
	 * Update progress with rate limiting and validation
	 */
	update(processedCount: number, currentFileName: string | null = null): void {
		// Rate limiting
		const now = Date.now();
		if (now - this.lastUpdateTime < this.MIN_UPDATE_INTERVAL) {
			return; // Skip too frequent updates
		}

		const current = this.progress$.getValue();

		// Validate
		if (!current.isActive) {
			console.warn("[ProgressTracker] Update called but not active");
			return;
		}

		if (processedCount < 0 || processedCount > current.total) {
			console.warn(
				"[ProgressTracker] Invalid processed count:",
				processedCount,
			);
			return;
		}

		// Calculate metrics
		const percentage = Math.min(
			100,
			Math.round((processedCount / current.total) * 100),
		);

		// Calculate processing rate and ETA
		let estimatedTimeRemaining = 0;
		if (current.startTime && processedCount > 0) {
			const elapsedTime = now - current.startTime;
			const rate = processedCount / (elapsedTime / 1000); // images per second
			this.processingRate = rate;

			const remaining = current.total - processedCount;
			estimatedTimeRemaining = rate > 0 ? (remaining / rate) * 1000 : 0;
		}

		const progress: SimpleProgress = {
			isActive: true,
			currentFile: currentFileName,
			processed: processedCount,
			total: current.total,
			percentage,
			startTime: current.startTime,
			estimatedTimeRemaining,
		};

		this.progress$.next(progress);
		this.lastUpdateTime = now;

		// Auto-complete if done
		if (processedCount >= current.total) {
			this.complete();
		}
	}

	/**
	 * Mark as complete with celebration
	 */
	complete(): void {
		const current = this.progress$.getValue();

		// Calculate final stats
		const processingTime = current.startTime
			? Date.now() - current.startTime
			: 0;

		console.log("[ProgressTracker] Scan complete:", {
			processed: current.total,
			timeMs: processingTime,
			rate: this.processingRate.toFixed(2) + " img/s",
		});

		// Show 100% completion
		const completedProgress: SimpleProgress = {
			isActive: true,
			currentFile: "Complete!",
			processed: current.total,
			total: current.total,
			percentage: 100,
			startTime: current.startTime,
			estimatedTimeRemaining: 0,
		};

		this.progress$.next(completedProgress);

		// Clear saved state
		ScannerStorage.removeItem(this.STORAGE_KEY).catch(() => {});

		// Auto-hide after delay
		this.hideTimer = setTimeout(() => {
			this.hide();
		}, this.AUTO_HIDE_DELAY);
	}

	/**
	 * Force hide with cleanup
	 */
	hide(): void {
		this.clearTimers();

		const hiddenProgress: SimpleProgress = {
			isActive: false,
			currentFile: null,
			processed: 0,
			total: 0,
			percentage: 0,
		};

		this.progress$.next(hiddenProgress);
		this.lastUpdateTime = 0;
		this.processingRate = 0;

		// Clear saved state
		ScannerStorage.removeItem(this.STORAGE_KEY).catch(() => {});
	}

	/**
	 * Clear all timers
	 */
	private clearTimers(): void {
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	/**
	 * Reset everything
	 */
	reset(): void {
		this.hide();
		this.clearTimers();
	}

	/**
	 * Clean up on app termination
	 */
	destroy(): void {
		this.reset();
		if (this.appStateSubscription) {
			this.appStateSubscription.remove();
		}
	}

	// Getters
	getProgress$() {
		return this.progress$.asObservable();
	}

	getCurrentProgress(): SimpleProgress {
		return this.progress$.getValue();
	}

	isScanning(): boolean {
		return this.progress$.getValue().isActive;
	}

	/**
	 * Get formatted time remaining
	 */
	getFormattedETA(): string {
		const current = this.progress$.getValue();
		if (!current.estimatedTimeRemaining) return "";

		const seconds = Math.round(current.estimatedTimeRemaining / 1000);
		if (seconds < 60) return `${seconds}s remaining`;

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, "0")} remaining`;
	}
}

export const progressTracker = ProductionProgressTracker.getInstance();
