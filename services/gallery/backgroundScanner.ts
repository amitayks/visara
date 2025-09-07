// services/gallery/backgroundScanner.ts
import BackgroundService from "react-native-background-actions";
import { settingsStore } from "../../stores/settingsStore";
import { useScannerStore } from "../../stores/scannerStore";
import { galleryScanner } from "./GalleryScanner";
import { galleryPermissions } from "../permissions/galleryPermissions";
import { nativeDeviceInfo } from "../../utils/nativeDeviceInfo";
import {
	AppState,
	AppStateStatus,
	InteractionManager,
	Platform,
} from "react-native";

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
	private shouldStop = false;
	private isPaused = false; // Track if scanning is paused

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
		console.log(
			`[BackgroundScanner] App state changed: ${this.appState} -> ${nextAppState}`,
		);

		const prevState = this.appState;
		this.appState = nextAppState;

		// Handle state transitions
		if (prevState === "active" && nextAppState.match(/inactive|background/)) {
			// App going to background
			console.log("[BackgroundScanner] App going to background");
			this.handleAppBackground();
		} else if (
			prevState.match(/inactive|background/) &&
			nextAppState === "active"
		) {
			// App coming to foreground
			console.log("[BackgroundScanner] App coming to foreground");
			this.handleAppForeground();
		}
	};

	private handleAppBackground() {
		// Don't pause if we're running as a background service
		if (this.isRunning && BackgroundService.isRunning()) {
			console.log("[BackgroundScanner] Continuing scan in background service");
			// The background service will keep running
		} else {
			console.log("[BackgroundScanner] Pausing non-service scan");
			this.isPaused = true;
		}
	}

	private handleAppForeground() {
		if (this.isPaused) {
			console.log("[BackgroundScanner] Resuming scan from pause");
			this.isPaused = false;
			// Resume any paused scans
			if (this.isRunning) {
				this.resumeScan();
			}
		}
	}

	private async resumeScan() {
		// Resume scanning if it was paused
		const progress = galleryScanner.getProgress();
		if (progress.isScanning && this.isPaused) {
			console.log("[BackgroundScanner] Resuming gallery scan");
			// The scan will automatically continue
		}
	}

	async startPeriodicScan(): Promise<void> {
		console.log("[BackgroundScanner] startPeriodicScan called");

		if (this.isStarting) {
			console.log(
				"[BackgroundScanner] Already starting, ignoring duplicate call",
			);
			return;
		}

		if (this.isRunning) {
			console.log(
				"[BackgroundScanner] Already running, ignoring start request",
			);
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

			// Check permissions first
			const hasPermission = await this.checkPermissionsSafely();
			if (!hasPermission) {
				console.log("[BackgroundScanner] Gallery permission not granted");
				this.isStarting = false;
				return;
			}

			// Stop any existing task first
			if (this.currentTaskId) {
				console.log(
					"[BackgroundScanner] Stopping existing task before starting new one",
				);
				await this.stopPeriodicScan();
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			// Configure background service with proper options
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

			// Reset flags
			this.shouldStop = false;
			this.isPaused = false;

			// Start the background service
			await BackgroundService.start(this.backgroundTask, options);

			this.isRunning = true;
			this.currentTaskId = Date.now().toString();

			// Update store
			useScannerStore.getState().setBackgroundScanEnabled(true);

			console.log(
				"[BackgroundScanner] Background service started successfully",
			);
		} catch (error) {
			console.error("[BackgroundScanner] Failed to start:", error);
			this.isRunning = false;
		} finally {
			this.isStarting = false;
		}
	}

	// Background task that runs in foreground service
	private backgroundTask = async (taskData: any) => {
		console.log("[BackgroundScanner] Background task started");

		try {
			// Important: This runs in a foreground service context
			// It will continue even when app is in background

			while (!this.shouldStop && BackgroundService.isRunning()) {
				try {
					// Check if we should run scan
					const shouldRun = await this.shouldRunScan();

					if (shouldRun && !this.isPaused) {
						console.log("[BackgroundScanner] Running background scan");

						// Update notification
						if (BackgroundService.isRunning()) {
							await BackgroundService.updateNotification({
								taskDesc: "Scanning gallery for documents...",
							});
						}

						// Perform the scan
						await this.performBackgroundScan();

						// Update last scan time
						this.lastScanTime = new Date();

						// Update notification
						if (BackgroundService.isRunning()) {
							await BackgroundService.updateNotification({
								taskDesc: "Scan complete. Waiting for next scan...",
							});
						}
					} else if (this.isPaused) {
						console.log("[BackgroundScanner] Scan paused, waiting...");
					} else {
						console.log(
							"[BackgroundScanner] Skipping scan - conditions not met",
						);
					}

					// Calculate sleep time
					const settings = settingsStore.getState().settings;
					const intervalMs = this.getIntervalMs(settings.scanFrequency);
					const sleepTime = intervalMs > 0 ? intervalMs : 60 * 60 * 1000;

					console.log(
						`[BackgroundScanner] Sleeping for ${sleepTime / 1000} seconds`,
					);

					// Sleep in chunks to check for stop signal
					const chunkTime = 60000; // 1 minute chunks
					const chunks = Math.ceil(sleepTime / chunkTime);

					for (let i = 0; i < chunks; i++) {
						if (!BackgroundService.isRunning() || this.shouldStop) {
							console.log("[BackgroundScanner] Service stopped, exiting task");
							return;
						}

						// Check if app state changed during sleep
						if (this.appState === "background" && Platform.OS === "android") {
							// Keep the service alive in background
							await BackgroundService.updateNotification({
								taskDesc: "Scanner running in background...",
							});
						}

						const sleepDuration = Math.min(
							chunkTime,
							sleepTime - i * chunkTime,
						);
						await this.sleep(sleepDuration);
					}
				} catch (error) {
					console.error("[BackgroundScanner] Error in task iteration:", error);
					await this.sleep(60000); // Wait 1 minute before retry
				}
			}

			console.log("[BackgroundScanner] Background task ended normally");
		} catch (error) {
			console.error("[BackgroundScanner] Fatal task error:", error);
		} finally {
			console.log("[BackgroundScanner] Background task cleanup");
			this.isRunning = false;
			this.isPaused = false;
			useScannerStore.getState().setBackgroundScanEnabled(false);
		}
	};

	private sleep = (time: number) =>
		new Promise<void>((resolve) => setTimeout(resolve, time));

	private async performBackgroundScan() {
		const settings = settingsStore.getState().settings;

		try {
			console.log("[BackgroundScanner] Starting background gallery scan");

			// For Android, ensure we're running with wake lock
			if (Platform.OS === "android") {
				// The BackgroundService handles wake lock automatically
				console.log("[BackgroundScanner] Running with wake lock");
			}

			// Run scan with background-optimized settings
			const scanOptions = {
				batchSize: Platform.OS === "android" ? 2 : 3, // Smaller batches on Android
				wifiOnly: settings.scanWifiOnly,
				smartFilterEnabled: settings.smartFilterEnabled,
				batterySaver: settings.batterySaver,
				isBackground: true,
				maxConcurrentProcessing: 1,
				// Add flag to keep scan alive in background
				keepAlive: true,
			};

			// Ensure scan continues in background
			await galleryScanner.startScan(scanOptions, async (progress) => {
				// Check if we should pause
				if (this.isPaused) {
					console.log("[BackgroundScanner] Scan paused by app state");
					return;
				}

				// Update progress less frequently in background
				if (progress.processedImages % 20 === 0) {
					const percentage =
						progress.totalImages > 0
							? Math.round(
									(progress.processedImages / progress.totalImages) * 100,
								)
							: 0;

					if (BackgroundService.isRunning()) {
						await BackgroundService.updateNotification({
							taskDesc: `Scanning: ${percentage}% complete`,
						});
					}
				}

				// Update store less frequently
				if (progress.processedImages % 10 === 0) {
					useScannerStore.getState().setScanProgress(progress);
				}
			});

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

		// Allow scanning in background if service is running
		if (this.appState !== "active" && BackgroundService.isRunning()) {
			console.log("[BackgroundScanner] Allowing background scan with service");
		}

		// Check device conditions
		const deviceCheck = await nativeDeviceInfo.canRunBackgroundTask({
			wifiOnly: settings.scanWifiOnly,
			batterySaver: settings.batterySaver || true,
			batteryThreshold: 0.2,
			memoryThreshold: 200 * 1024 * 1024, // 200MB threshold
			respectLowPowerMode: true,
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
				console.log("[BackgroundScanner] Too soon since last scan");
				return false;
			}
		}

		return true;
	}

	async stopPeriodicScan(): Promise<void> {
		console.log("[BackgroundScanner] stopPeriodicScan called");

		if (!this.isRunning && !BackgroundService.isRunning()) {
			console.log("[BackgroundScanner] Not running, nothing to stop");
			return;
		}

		try {
			console.log("[BackgroundScanner] Stopping background service");

			// Signal the background task to stop
			this.shouldStop = true;
			this.isPaused = false;

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
			console.log(
				`[BackgroundScanner] Permission check result: ${result.status}`,
			);
			return result.status === "granted";
		} catch (error) {
			console.error("[BackgroundScanner] Error checking permissions:", error);
			return false;
		}
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
			isPaused: this.isPaused,
			isServiceRunning: BackgroundService.isRunning(),
			lastScanTime: this.lastScanTime,
			currentProgress: galleryScanner.getProgress(),
			appState: this.appState,
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
