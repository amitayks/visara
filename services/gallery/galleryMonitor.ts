import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import { AppState, AppStateStatus } from "react-native";
import { ScannerStorage } from "../../storage/MMKVStorage";

export interface GalleryChangeEvent {
	newImagesCount: number;
	totalImagesCount: number;
	hasNewImages: boolean;
	lastCheckTime: Date;
}

type GalleryChangeCallback = (event: GalleryChangeEvent) => void;

class GalleryMonitor {
	private static instance: GalleryMonitor | null = null;
	private isMonitoring = false;
	private monitorInterval: NodeJS.Timeout | null = null;
	private lastImageCount = 0;
	private lastCheckTime: Date | null = null;
	private callbacks: Set<GalleryChangeCallback> = new Set();
	private appState: AppStateStatus = AppState.currentState;
	private appStateSubscription: any = null;
	
	private readonly MONITOR_INTERVAL = 10000; // Check every 10 seconds when monitoring
	private readonly STORAGE_KEY = "gallery_monitor_state";

	static getInstance(): GalleryMonitor {
		if (!GalleryMonitor.instance) {
			GalleryMonitor.instance = new GalleryMonitor();
		}
		return GalleryMonitor.instance;
	}

	private constructor() {
		this.loadState();
		
		// Listen to app state changes to pause/resume monitoring
		this.appStateSubscription = AppState.addEventListener(
			"change",
			this.handleAppStateChange,
		);
	}

	private handleAppStateChange = (nextAppState: AppStateStatus) => {
		const prevState = this.appState;
		this.appState = nextAppState;

		if (prevState.match(/inactive|background/) && nextAppState === "active") {
			// App came to foreground, check for changes immediately
			console.log("[GalleryMonitor] App came to foreground, checking for new images");
			this.checkForNewImages();
		}
	};

	private async loadState() {
		try {
			const state = await ScannerStorage.getObject(this.STORAGE_KEY) as any;
			if (state && typeof state === 'object') {
				this.lastImageCount = state.lastImageCount || 0;
				this.lastCheckTime = state.lastCheckTime ? new Date(state.lastCheckTime) : null;
				console.log("[GalleryMonitor] Loaded state:", { lastImageCount: this.lastImageCount, lastCheckTime: this.lastCheckTime });
			}
		} catch (error) {
			console.error("[GalleryMonitor] Error loading state:", error);
		}
	}

	private async saveState() {
		try {
			const state = {
				lastImageCount: this.lastImageCount,
				lastCheckTime: this.lastCheckTime?.getTime(),
				timestamp: Date.now(),
			};
			await ScannerStorage.setObject(this.STORAGE_KEY, state);
		} catch (error) {
			console.error("[GalleryMonitor] Error saving state:", error);
		}
	}

	async startMonitoring(): Promise<void> {
		if (this.isMonitoring) {
			console.log("[GalleryMonitor] Already monitoring");
			return;
		}

		console.log("[GalleryMonitor] Starting gallery monitoring");
		this.isMonitoring = true;

		// Do initial check
		await this.checkForNewImages();

		// Start periodic monitoring
		this.monitorInterval = setInterval(() => {
			this.checkForNewImages();
		}, this.MONITOR_INTERVAL);
	}

	stopMonitoring(): void {
		if (!this.isMonitoring) {
			return;
		}

		console.log("[GalleryMonitor] Stopping gallery monitoring");
		this.isMonitoring = false;

		if (this.monitorInterval) {
			clearInterval(this.monitorInterval);
			this.monitorInterval = null;
		}
	}

	private async checkForNewImages(): Promise<void> {
		try {
			console.log("[GalleryMonitor] Checking for new images...");
			
			// Get total count of ALL photos in gallery (unlimited)
			let currentImageCount = 0;
			let after: string | undefined;
			
			// Count all images in batches
			do {
				const photoBatch = await CameraRoll.getPhotos({
					first: 1000,
					assetType: "Photos",
					after: after,
				});
				
				currentImageCount += photoBatch.edges.length;
				after = photoBatch.page_info.has_next_page ? photoBatch.page_info.end_cursor : undefined;
				
			} while (after);
			
			console.log(`[GalleryMonitor] Current total image count: ${currentImageCount}`);

			const now = new Date();
			
			// If this is the first check, just store the count and return
			if (this.lastImageCount === 0) {
				this.lastImageCount = currentImageCount;
				this.lastCheckTime = now;
				await this.saveState();
				console.log(`[GalleryMonitor] Initial setup - found ${currentImageCount} images`);
				return;
			}

			// Compare with last known count
			const hasNewImages = currentImageCount > this.lastImageCount;
			const newImagesCount = hasNewImages ? currentImageCount - this.lastImageCount : 0;

			// Create event
			const event: GalleryChangeEvent = {
				newImagesCount,
				totalImagesCount: currentImageCount,
				hasNewImages,
				lastCheckTime: now,
			};

			// Update state
			const prevImageCount = this.lastImageCount;
			if (hasNewImages) {
				this.lastImageCount = currentImageCount;
				console.log(`[GalleryMonitor] ✅ Detected ${newImagesCount} new images (${prevImageCount} -> ${currentImageCount})`);
			} else {
				console.log(`[GalleryMonitor] No new images. Current count: ${currentImageCount}, Last check: ${now.toLocaleTimeString()}`);
			}
			
			this.lastCheckTime = now;
			await this.saveState();

			// Notify callbacks when new images are detected
			if (hasNewImages) {
				console.log(`[GalleryMonitor] 📢 Notifying ${this.callbacks.size} callbacks about new images`);
				this.callbacks.forEach(callback => {
					try {
						callback(event);
					} catch (error) {
						console.error("[GalleryMonitor] Error in callback:", error);
					}
				});
			}

		} catch (error) {
			console.error("[GalleryMonitor] Error checking for new images:", error);
		}
	}

	// Force immediate check (useful when app comes to foreground)
	async forceCheck(): Promise<GalleryChangeEvent | null> {
		try {
			await this.checkForNewImages();
			return {
				newImagesCount: 0,
				totalImagesCount: this.lastImageCount,
				hasNewImages: false,
				lastCheckTime: this.lastCheckTime || new Date(),
			};
		} catch (error) {
			console.error("[GalleryMonitor] Error in force check:", error);
			return null;
		}
	}

	// Subscribe to gallery changes
	subscribe(callback: GalleryChangeCallback): () => void {
		this.callbacks.add(callback);
		return () => {
			this.callbacks.delete(callback);
		};
	}

	// Get current monitoring status
	getStatus() {
		return {
			isMonitoring: this.isMonitoring,
			lastImageCount: this.lastImageCount,
			lastCheckTime: this.lastCheckTime,
			callbackCount: this.callbacks.size,
		};
	}

	// Reset the monitor state (useful for testing or reset scenarios)
	async reset(): Promise<void> {
		this.lastImageCount = 0;
		this.lastCheckTime = null;
		await ScannerStorage.removeItem(this.STORAGE_KEY);
		console.log("[GalleryMonitor] Monitor state reset");
	}

	cleanup(): void {
		console.log("[GalleryMonitor] Cleaning up");
		this.stopMonitoring();
		this.callbacks.clear();
		
		if (this.appStateSubscription) {
			this.appStateSubscription.remove();
		}
	}
}

// Export singleton instance
export const galleryMonitor = GalleryMonitor.getInstance();