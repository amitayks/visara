import BackgroundService from "react-native-background-actions";
import { settingsStore } from "../../stores/settingsStore";
import { useScannerStore } from "../../stores/scannerStore";
import { galleryScanner } from "./GalleryScanner";
import { galleryPermissions } from "../permissions/galleryPermissions";
import { deviceInfo } from "../../utils/deviceInfo";
import { AppState, AppStateStatus } from "react-native";

interface BackgroundTaskOptions {
	taskName: string;
	taskTitle: string;
	taskDesc: string;
	taskIcon: {
		name: string;
		type: string;
		package?: string;
	};
	color: string;
	linkingURI?: string;
	parameters?: any;
}

export class BackgroundScanner {
	private static instance: BackgroundScanner | null = null;
	private isRunning = false;
	private isStarting = false;
	private scanInterval: NodeJS.Timeout | null = null;
	private appState: AppStateStatus = AppState.currentState;
	private appStateSubscription: any = null;
	private lastScanTime: Date | null = null;
	private currentTaskId: string | null = null;

	// Singleton pattern to prevent multiple instances
	static getInstance(): BackgroundScanner {
		if (!BackgroundScanner.instance) {
			BackgroundScanner.instance = new BackgroundScanner();
		}
		return BackgroundScanner.instance;
	}

	private constructor() {
		// Listen to app state changes
		this.appStateSubscription = AppState.addEventListener(
			"change",
			this.handleAppStateChange,
		);
	}

	private handleAppStateChange = (nextAppState: AppStateStatus) => {
		console.log(`[BackgroundScanner] App state changed: ${this.appState} -> ${nextAppState}`);
		this.appState = nextAppState;
		
		// Pause background scanning when app is in foreground
		if (nextAppState === "active" && this.isRunning) {
			console.log("[BackgroundScanner] App is in foreground, background scan continues");
		}
	};

	async startPeriodicScan(): Promise<void> {
		console.log("[BackgroundScanner] startPeriodicScan called");
		
		// Prevent multiple start attempts
		if (this.isStarting) {
			console.log("[BackgroundScanner] Already starting, ignoring duplicate call");
			return;
		}
		
		if (this.isRunning) {
			console.log("[BackgroundScanner] Already running, ignoring start request");
			return;
		}
		
		this.isStarting = true;
		
		try {
			const settings = settingsStore.getState().settings;

			if (!settings.autoScan) {
				console.log("[BackgroundScanner] Auto-scan is disabled");
				this.isStarting = false;
				return;
			}

			// Check permissions first - but safely
			const hasPermission = await this.checkPermissionsSafely();
			if (!hasPermission) {
				console.log("[BackgroundScanner] Gallery permission not granted");
				this.isStarting = false;
				return;
			}

			// Stop any existing task first
			if (this.currentTaskId) {
				console.log("[BackgroundScanner] Stopping existing task before starting new one");
				await this.stopPeriodicScan();
				// Wait for cleanup
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// Configure background service
			const options: BackgroundTaskOptions = {
				taskName: "GalleryScanner",
				taskTitle: "Document Scanner",
				taskDesc: "Looking for documents in your gallery",
				taskIcon: {
					name: "ic_launcher",
					type: "mipmap",
				},
				color: "#0066FF",
				linkingURI: "visara://scanner",
				parameters: {
					delay: 60000, // 1 minute minimum between scans
				},
			};

			console.log("[BackgroundScanner] Starting background service");
			
			// Start the background service
			await BackgroundService.start(this.backgroundTask, options);
			
			this.isRunning = true;
			this.currentTaskId = Date.now().toString();
			
			// Update store
			useScannerStore.getState().setBackgroundScanEnabled(true);
			
			console.log("[BackgroundScanner] Background service started successfully");
		} catch (error) {
			console.error("[BackgroundScanner] Failed to start:", error);
			this.isRunning = false;
			// Don't throw - handle gracefully
		} finally {
			this.isStarting = false;
		}
	}

	async stopPeriodicScan(): Promise<void> {
		console.log("[BackgroundScanner] stopPeriodicScan called");
		
		if (!this.isRunning && !BackgroundService.isRunning()) {
			console.log("[BackgroundScanner] Not running, nothing to stop");
			return;
		}

		try {
			console.log("[BackgroundScanner] Stopping background service");
			await BackgroundService.stop();
			
			this.isRunning = false;
			this.currentTaskId = null;
			
			// Clear interval if any
			if (this.scanInterval) {
				clearInterval(this.scanInterval);
				this.scanInterval = null;
			}
			
			// Update store
			useScannerStore.getState().setBackgroundScanEnabled(false);
			
			console.log("[BackgroundScanner] Background service stopped");
		} catch (error) {
			console.error("[BackgroundScanner] Error stopping:", error);
			// Reset state anyway
			this.isRunning = false;
			this.currentTaskId = null;
		}
	}

	private async checkPermissionsSafely(): Promise<boolean> {
		try {
			console.log("[BackgroundScanner] Checking permissions safely");
			const result = await galleryPermissions.checkPermission();
			const hasPermission = result.status === "granted";
			console.log(`[BackgroundScanner] Permission status: ${result.status}`);
			return hasPermission;
		} catch (error) {
			console.error("[BackgroundScanner] Permission check failed:", error);
			return false;
		}
	}

	private backgroundTask = async (taskData: any) => {
		console.log("[BackgroundScanner] Background task started");
		
		// Ensure this runs in background context only
		if (!BackgroundService.isRunning()) {
			console.log("[BackgroundScanner] Background service not running, exiting task");
			return;
		}
		
		// Keep the task running with periodic scans
		await new Promise(async (resolve) => {
			const settings = settingsStore.getState().settings;
			
			// Set up interval based on scan frequency
			const intervalMs = this.getIntervalMs(settings.scanFrequency);
			
			if (intervalMs > 0) {
				// Run initial scan after a delay
				setTimeout(() => {
					this.performBackgroundScan();
				}, 5000); // 5 second initial delay
				
				// Set up periodic scanning
				this.scanInterval = setInterval(async () => {
					if (await this.shouldRunScan()) {
						await this.performBackgroundScan();
					}
				}, intervalMs);
			}
			
			// Keep the task running indefinitely
			// In production, you might want to implement a more sophisticated
			// background task that can be stopped and started based on conditions
		});
	};

	private async performBackgroundScan() {
		const settings = settingsStore.getState().settings;
		
		try {
			// Check if we should run the scan
			const canRun = await this.shouldRunScan();
			if (!canRun) {
				console.log("[BackgroundScanner] Conditions not met for scan, skipping");
				return;
			}
			
			console.log("[BackgroundScanner] Starting background gallery scan");
			
			// Update notification
			if (BackgroundService.isRunning()) {
				await BackgroundService.updateNotification({
					taskDesc: "Scanning gallery for new documents...",
				});
			}
			
			// Run the scan with progress updates
			await galleryScanner.startScan(
				{
					batchSize: settings.maxScanBatchSize || 10,
					wifiOnly: settings.scanWifiOnly,
					smartFilterEnabled: settings.smartFilterEnabled,
					batterySaver: settings.batterySaver,
				},
				async (progress) => {
					// Update background service notification with progress
					const percentage = progress.totalImages > 0 
						? Math.round((progress.processedImages / progress.totalImages) * 100)
						: 0;
					
					if (BackgroundService.isRunning()) {
						await BackgroundService.updateNotification({
							taskDesc: `Scanning: ${progress.processedImages}/${progress.totalImages} images (${percentage}%)`,
						});
					}
					
					// Update store
					useScannerStore.getState().setScanProgress(progress);
				},
			);
			
			// Update last scan time
			this.lastScanTime = new Date();
			
			// Update notification to show completion
			if (BackgroundService.isRunning()) {
				await BackgroundService.updateNotification({
					taskDesc: "Scan complete. Waiting for next scan...",
				});
			}
			
			console.log("[BackgroundScanner] Background gallery scan completed");
		} catch (error) {
			console.error("[BackgroundScanner] Background scan failed:", error);
			
			if (BackgroundService.isRunning()) {
				await BackgroundService.updateNotification({
					taskDesc: "Scan failed. Will retry later...",
				});
			}
		}
	}

	private getIntervalMs(frequency: string): number {
		switch (frequency) {
			case "hourly":
				return 60 * 60 * 1000; // 1 hour
			case "daily":
				return 24 * 60 * 60 * 1000; // 24 hours
			case "weekly":
				return 7 * 24 * 60 * 60 * 1000; // 7 days
			case "manual":
			default:
				return 0; // No automatic scanning
		}
	}

	async shouldRunScan(): Promise<boolean> {
		const settings = settingsStore.getState().settings;

		// Check if auto-scan is enabled
		if (!settings.autoScan) {
			return false;
		}

		// Don't scan if app is in foreground (optional)
		if (this.appState === "active") {
			console.log("[BackgroundScanner] App is active, continuing scan anyway");
			// Note: Changed to allow scanning even when app is active
		}

		// Check device conditions
		const deviceCheck = await deviceInfo.canRunBackgroundTask({
			wifiOnly: settings.scanWifiOnly,
			batterySaver: settings.batterySaver || true,
			batteryThreshold: 0.2, // 20%
			memoryThreshold: 100, // 100MB
		});

		if (!deviceCheck.canRun) {
			console.log(`[BackgroundScanner] Skipping scan: ${deviceCheck.reason}`);
			return false;
		}

		// Check if enough time has passed since last scan
		if (this.lastScanTime) {
			const timeSinceLastScan = Date.now() - this.lastScanTime.getTime();
			const minInterval = this.getIntervalMs(settings.scanFrequency);
			
			if (minInterval > 0 && timeSinceLastScan < minInterval * 0.9) {
				// Allow 10% tolerance
				console.log("[BackgroundScanner] Too soon since last scan");
				return false;
			}
		}

		return true;
	}

	async isScanning(): Promise<boolean> {
		return galleryScanner.getProgress().isScanning || this.isRunning;
	}

	isBackgroundServiceRunning(): boolean {
		return this.isRunning && BackgroundService.isRunning();
	}

	async getBackgroundServiceStatus() {
		return {
			isRunning: this.isRunning,
			isServiceRunning: BackgroundService.isRunning(),
			lastScanTime: this.lastScanTime,
			currentProgress: galleryScanner.getProgress(),
		};
	}

	cleanup() {
		console.log("[BackgroundScanner] Cleaning up");
		
		// Clean up app state listener
		if (this.appStateSubscription) {
			this.appStateSubscription.remove();
		}
		
		// Stop any running scans
		this.stopPeriodicScan();
	}
}

// Export singleton instance
export const backgroundScanner = BackgroundScanner.getInstance();