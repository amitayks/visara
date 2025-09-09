// services/gallery/backgroundScanner.ts
import BackgroundService from "react-native-background-actions";
import { settingsStore } from "../../stores/settingsStore";
import { useScannerStore } from "../../stores/scannerStore";
import { galleryScanner } from "./GalleryScanner";
import { galleryPermissions } from "../permissions/galleryPermissions";
import { galleryMonitor } from "./galleryMonitor";
import { nativeDeviceInfo } from "../../utils/nativeDeviceInfo";
import {
	AppState,
	AppStateStatus,
	InteractionManager,
	Platform,
} from "react-native";
import { ScannerStorage } from "../../storage/MMKVStorage";
import { ProgressUpdateManager } from "./ProgressUpdateManager";

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
	parameters?: { [key: string]: any };
	ongoing?: boolean;

	progressBar?: {
		max: number;
		value: number;
		indeterminate?: boolean;
	};

	actions?: Array<{
		id: string;
		title: string;
		icon?: string;
	}>;
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
	private crashRecoveryAttempts = 0;
	private maxRecoveryAttempts = 3;
	private lastHeartbeat = Date.now();
	private heartbeatInterval: NodeJS.Timeout | null = null;
	private forceImmediateScan = false; // Flag to force immediate scan on first run
	private hasNewImagesQueue = false; // Flag to track if new images are waiting to be scanned

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

	// State persistence using MMKV - allows resuming interrupted scans
	private async saveScanState(): Promise<void> {
		try {
			const state = {
				lastScanTime: this.lastScanTime?.getTime(),
				scanProgress: useScannerStore.getState().scanProgress,
				timestamp: Date.now(),
			};

			// Save to MMKV for persistence across app restarts - await the async operation
			await ScannerStorage.setObject("background_scan_state", state);
			console.log("[BackgroundScanner] Scan state saved");
		} catch (error) {
			console.error("[BackgroundScanner] Error saving scan state:", error);
		}
	}

	private async loadScanState(): Promise<any> {
		try {
			// Load from MMKV - await the promise since getObject is async
			const state = (await ScannerStorage.getObject(
				"background_scan_state",
			)) as any;
			if (state && typeof state === "object") {
				// Now we can safely access the properties since state is resolved
				if (state.lastScanTime) {
					this.lastScanTime = new Date(state.lastScanTime);
				}
				console.log("[BackgroundScanner] Loaded previous scan state");
				return state;
			}
			console.log("[BackgroundScanner] No previous scan state found");
			return null;
		} catch (error) {
			console.error("[BackgroundScanner] Error loading scan state:", error);
			return null;
		}
	}

	private async clearScanState(): Promise<void> {
		try {
			// removeItem is also async in your MMKV interface
			await ScannerStorage.removeItem("background_scan_state");
			console.log("[BackgroundScanner] Scan state cleared");
		} catch (error) {
			console.error("[BackgroundScanner] Error clearing scan state:", error);
		}
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

			const options: BackgroundTaskOptions = {
				taskName: "DocumentScanner",
				taskTitle: "Scanning In Progress",
				taskDesc: "Preparing to scan gallery for documents...",
				taskIcon: {
					name: "ic_launcher",
					type: "mipmap",
				},
				color: "#0066FF",
				linkingURI: "visara://",
				parameters: {
					delay: 1000,
					// Add notification channel for Android 8+
					channelId: "document_scanner_channel",
					// Add action handler
					onAction: this.handleNotificationAction,
				},
				ongoing: true,
				progressBar: {
					max: 100,
					value: 0,
					indeterminate: false,
				},
				actions: [
					{
						id: "pause_scan",
						title: this.isPaused ? "Resume" : "Pause",
						icon: this.isPaused ? "play_arrow" : "pause",
					},
					{
						id: "stop_scan",
						title: "Stop",
						icon: "stop",
					},
				],
			};

			console.log("[BackgroundScanner] Starting background service");

			// Reset flags
			this.shouldStop = false;
			this.isPaused = false;
			this.forceImmediateScan = true; // Force first scan to run immediately

			// Start the background service
			await BackgroundService.start(this.backgroundTask, options);

			this.isRunning = true;
			this.currentTaskId = Date.now().toString();

			// Start service monitoring watchdog
			this.startServiceWatchdog();

			// Start gallery monitoring for ALL frequency modes (not just on_new_image)
			// This ensures we always detect new images regardless of frequency setting
			const currentSettings = settingsStore.getState().settings;
			console.log(
				"[BackgroundScanner] Starting gallery monitoring for new image detection",
			);
			await galleryMonitor.startMonitoring();

			// Subscribe to gallery changes
			galleryMonitor.subscribe((event) => {
				console.log(`[BackgroundScanner] Gallery event received:`, event);
				if (event.hasNewImages && !this.isPaused) {
					console.log(
						`[BackgroundScanner] ⚡ New images detected (${event.newImagesCount}), queueing scan`,
					);
					this.hasNewImagesQueue = true;
					this.forceImmediateScan = true;

					// If scanning is not currently running, we should trigger an immediate check
					if (!galleryScanner.getProgress().isScanning) {
						console.log(
							`[BackgroundScanner] No scan running, will trigger immediate scan on next cycle`,
						);
					} else {
						console.log(
							`[BackgroundScanner] Scan already running, queued for next cycle`,
						);
					}
				} else if (event.hasNewImages && this.isPaused) {
					console.log(
						`[BackgroundScanner] New images detected but scanner is paused`,
					);
				}
			});

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

	// Handle notification actions (pause/resume/stop)
	private handleNotificationAction = async (actionId: string) => {
		console.log(
			`[BackgroundScanner] Notification action received: ${actionId}`,
		);

		switch (actionId) {
			case "pause_scan":
				if (this.isPaused) {
					await this.resumeScanFromNotification();
				} else {
					await this.pauseScanFromNotification();
				}
				break;
			case "stop_scan":
				await this.stopPeriodicScan();
				break;
			default:
				console.log(`[BackgroundScanner] Unknown action: ${actionId}`);
		}
	};

	private async pauseScanFromNotification() {
		console.log("[BackgroundScanner] Pausing scan from notification");
		this.isPaused = true;

		// Update notification to show paused state
		if (BackgroundService.isRunning()) {
			await BackgroundService.updateNotification({
				taskDesc: "Scanner paused. Tap Resume to continue.",
				// @ts-ignore - actions not in type definitions but supported by library
				actions: [
					{
						id: "pause_scan",
						title: "Resume",
						icon: "play_arrow",
					},
					{
						id: "stop_scan",
						title: "Stop",
						icon: "stop",
					},
				],
			});
		}

		// Save pause state
		await this.saveScanState();
	}

	private async resumeScanFromNotification() {
		console.log("[BackgroundScanner] Resuming scan from notification");
		this.isPaused = false;

		// Update notification to show resumed state
		if (BackgroundService.isRunning()) {
			await BackgroundService.updateNotification({
				taskDesc: "Scanner resumed. Scanning in progress...",
				// @ts-ignore - actions not in type definitions but supported by library
				actions: [
					{
						id: "pause_scan",
						title: "Pause",
						icon: "pause",
					},
					{
						id: "stop_scan",
						title: "Stop",
						icon: "stop",
					},
				],
			});
		}

		// Save resume state
		await this.saveScanState();
	}

	// Service crash recovery and health monitoring
	private startServiceWatchdog() {
		console.log("[BackgroundScanner] Starting service watchdog");

		// Clear any existing watchdog
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}

		// Check service health every 30 seconds
		this.heartbeatInterval = setInterval(async () => {
			await this.checkServiceHealth();
		}, 30000);

		this.lastHeartbeat = Date.now();
	}

	private stopServiceWatchdog() {
		console.log("[BackgroundScanner] Stopping service watchdog");
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	private async checkServiceHealth() {
		const now = Date.now();
		const timeSinceLastHeartbeat = now - this.lastHeartbeat;

		// If more than 2 minutes without heartbeat, consider service dead
		if (timeSinceLastHeartbeat > 120000) {
			console.warn(
				"[BackgroundScanner] Service appears to be dead - attempting recovery",
			);
			await this.attemptServiceRecovery();
		}

		// Check if background service is still running when it should be
		if (this.isRunning && !BackgroundService.isRunning()) {
			console.warn(
				"[BackgroundScanner] Background service stopped unexpectedly",
			);
			await this.attemptServiceRecovery();
		}

		// Update heartbeat
		this.lastHeartbeat = now;
	}

	private async attemptServiceRecovery() {
		if (this.crashRecoveryAttempts >= this.maxRecoveryAttempts) {
			console.error(
				"[BackgroundScanner] Max recovery attempts reached - giving up",
			);
			this.handleRecoveryFailure();
			return;
		}

		this.crashRecoveryAttempts++;
		console.log(
			`[BackgroundScanner] Recovery attempt ${this.crashRecoveryAttempts}/${this.maxRecoveryAttempts}`,
		);

		try {
			// Clean up current state
			this.isRunning = false;
			this.currentTaskId = null;

			// Wait a moment before restart
			await this.sleep(5000);

			// Attempt to restart the service
			console.log(
				"[BackgroundScanner] Restarting background service after crash",
			);
			await this.startPeriodicScan();

			// If we get here, recovery was successful
			console.log("[BackgroundScanner] Service recovery successful");
			this.crashRecoveryAttempts = 0; // Reset counter on success
		} catch (error) {
			console.error("[BackgroundScanner] Recovery attempt failed:", error);

			// Wait longer before next attempt
			await this.sleep(10000 * this.crashRecoveryAttempts);
		}
	}

	private handleRecoveryFailure() {
		console.error("[BackgroundScanner] Service recovery failed permanently");

		// Reset all state
		this.isRunning = false;
		this.isPaused = false;
		this.currentTaskId = null;
		this.crashRecoveryAttempts = 0;

		// Stop watchdog
		this.stopServiceWatchdog();

		// Update store to reflect failure
		useScannerStore.getState().setBackgroundScanEnabled(false);

		// Clear any saved state that might be causing issues
		this.clearScanState();

		// TODO: Could add user notification about service failure here
		console.log(
			"[BackgroundScanner] Background scanning disabled due to repeated failures",
		);
	}

	// Enhanced background task that runs in foreground service with better survival
	private backgroundTask = async (taskData: any) => {
		console.log("[BackgroundScanner] Enhanced background task started");
		console.log("[BackgroundScanner] Task data:", taskData);

		// Handle action if any
		if (taskData?.action) {
			console.log(
				"[BackgroundScanner] Handling action from notification:",
				taskData.action,
			);
			await this.handleNotificationAction(taskData.action);
		}

		// Create our smart progress manager
		const progressManager = new ProgressUpdateManager();
		progressManager.setPaused(this.isPaused);

		try {
			// Load any saved state from previous interrupted scans
			const savedState = await this.loadScanState();
			if (savedState) {
				console.log("[BackgroundScanner] Resuming from saved state");
			}

			// Important: This runs in a foreground service context
			// It will continue even when app is in background
			while (!this.shouldStop && BackgroundService.isRunning()) {
				try {
					// Update heartbeat to show we're alive
					this.lastHeartbeat = Date.now();
					// Check if we should run scan based on device conditions
					const shouldRun = await this.shouldRunScan();

					if (shouldRun && !this.isPaused) {
						console.log("[BackgroundScanner] Running background scan");

						// Mark scanning as started in the store
						const currentProgress = useScannerStore.getState().scanProgress;
						useScannerStore.getState().setScanProgress({
							...currentProgress,
							isScanning: true,
						});

						// Show that we're starting with an informative message
						await progressManager.forceUpdate(
							{ processedImages: 0, totalImages: 0, isScanning: true },
							"Checking gallery for new documents...",
						);

						// Perform the scan with enhanced progress tracking
						await this.performEnhancedBackgroundScan(progressManager);

						// Update last scan time and save our progress
						this.lastScanTime = new Date();
						await this.saveScanState();

						// Show completion with a satisfying message and mark as not scanning
						const finalProgress = useScannerStore.getState().scanProgress;
						const completedProgress = {
							...finalProgress,
							isScanning: false,
						};
						useScannerStore.getState().setScanProgress(completedProgress);
						await progressManager.forceUpdate(
							completedProgress,
							`Scan complete! Found ${finalProgress.processedImages || 0} documents.`,
						);
					} else if (this.isPaused) {
						console.log("[BackgroundScanner] Scan paused, waiting...");
						await progressManager.forceUpdate(
							{ processedImages: 0, totalImages: 0 },
							"Scanner paused. Will resume when conditions improve.",
						);
					} else {
						console.log(
							"[BackgroundScanner] Skipping scan - conditions not met",
						);
						await progressManager.forceUpdate(
							{ processedImages: 0, totalImages: 0 },
							"Waiting for optimal conditions to scan...",
						);
					}

					// Intelligent sleep with background keepalive
					await this.intelligentSleep(progressManager);
				} catch (error) {
					console.error("[BackgroundScanner] Error in task iteration:", error);

					// Show error state but keep service alive - resilience is key
					await progressManager.forceUpdate(
						{ processedImages: 0, totalImages: 0 },
						"Temporary error. Retrying soon...",
					);

					await this.sleep(60000); // Wait 1 minute before retry
				}
			}

			console.log("[BackgroundScanner] Background task ended normally");
		} catch (error) {
			console.error("[BackgroundScanner] Fatal task error:", error);
		} finally {
			console.log("[BackgroundScanner] Background task cleanup");
			this.cleanupBackgroundTask();
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
				// IMPORTANT: Only scan new images, not all gallery images
				scanNewOnly: true,
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

	// Enhanced version of performBackgroundScan with better progress tracking
	private async performEnhancedBackgroundScan(
		progressManager: ProgressUpdateManager,
	): Promise<void> {
		const settings = settingsStore.getState().settings;

		try {
			console.log(
				"[BackgroundScanner] Starting enhanced background gallery scan",
			);

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
				// IMPORTANT: Only scan new images, not all gallery images
				scanNewOnly: true,
			};

			// Track when scanning actually begins with real work
			let scanStarted = false;
			let lastProgressUpdate = Date.now();

			// Ensure scan continues in background with enhanced progress tracking
			await galleryScanner.startScan(scanOptions, async (progress) => {
				// Check if we should pause
				if (this.isPaused) {
					console.log("[BackgroundScanner] Scan paused by app state");
					return;
				}

				// Detect if scan is actually processing new images
				if (!scanStarted && progress.processedImages > 0) {
					scanStarted = true;
					console.log("[BackgroundScanner] Scan started processing images");
					await progressManager.forceUpdate(
						progress,
						`Found ${progress.totalImages} images to check, processing...`,
					);
				}

				// Check for no-work scenario (same totalImages as processedImages immediately)
				const timeSinceStart = Date.now() - lastProgressUpdate;
				if (!scanStarted && timeSinceStart > 3000) {
					// If no progress after 3 seconds, likely no new images
					console.log(
						"[BackgroundScanner] No new images detected after 3 seconds",
					);
					await progressManager.forceUpdate(
						{ processedImages: 0, totalImages: 0, isScanning: false },
						"No new documents found. Gallery is up to date.",
					);
				}

				// Use our smart progress manager for real updates
				await progressManager.updateProgress(progress);
			});

			console.log(
				"[BackgroundScanner] Enhanced background gallery scan completed",
			);

			// Get the final scan results and update progress
			const finalProgress = galleryScanner.getProgress();
			console.log("[BackgroundScanner] Final scan progress:", finalProgress);

			// Ensure the final progress is updated with completion state
			const completedProgress = {
				...finalProgress,
				isScanning: false,
			};

			// Update both the store and the progress manager with final state
			useScannerStore.getState().setScanProgress(completedProgress);

			// Provide meaningful completion message based on results
			let completionMessage = "Scan complete.";
			if (finalProgress.totalImages === 0) {
				completionMessage = "No new documents found. Gallery is up to date.";
			} else if (finalProgress.processedImages > 0) {
				completionMessage = `Scan complete! Processed ${finalProgress.processedImages} images.`;
			} else {
				completionMessage = "Scan complete. No new documents found.";
			}

			// Check if there are new images queued while we were scanning
			if (this.hasNewImagesQueue) {
				console.log(
					"[BackgroundScanner] New images were detected during scan, scheduling immediate rescan",
				);
				this.hasNewImagesQueue = false;
				this.forceImmediateScan = true;
				completionMessage += " New images detected, rescanning...";
			}

			await progressManager.forceUpdate(completedProgress, completionMessage);
		} catch (error) {
			console.error(
				"[BackgroundScanner] Enhanced background scan failed:",
				error,
			);

			// Use progress manager for error notification
			await progressManager.forceUpdate(
				{ processedImages: 0, totalImages: 0 },
				"Scan failed. Will retry later...",
			);
		}
	}

	// Intelligent sleep method that keeps service alive and provides updates
	private async intelligentSleep(
		progressManager: ProgressUpdateManager,
	): Promise<void> {
		const settings = settingsStore.getState().settings;
		const intervalMs = this.getIntervalMs(settings.scanFrequency);
		const sleepTime = intervalMs > 0 ? intervalMs : 60 * 60 * 1000; // Default 1 hour

		console.log(
			`[BackgroundScanner] Intelligent sleep for ${sleepTime / 1000} seconds`,
		);

		// Break sleep into 30-second chunks for better background survival
		const chunkTime = 30000; // 30 second chunks
		const chunks = Math.ceil(sleepTime / chunkTime);

		for (let i = 0; i < chunks; i++) {
			if (!BackgroundService.isRunning() || this.shouldStop) {
				console.log("[BackgroundScanner] Service stopped during sleep");
				return;
			}

			// Update heartbeat regularly during sleep
			this.lastHeartbeat = Date.now();

			// Every few chunks, update notification to show we're still alive
			if (i % 4 === 0) {
				// Every 2 minutes
				const remainingMinutes = Math.round(
					(sleepTime - i * chunkTime) / 60000,
				);
				await progressManager.forceUpdate(
					{ processedImages: 0, totalImages: 0 },
					`Scanner active. Next scan in ${remainingMinutes} minutes.`,
				);
			}

			// Sleep for one chunk
			const sleepDuration = Math.min(chunkTime, sleepTime - i * chunkTime);
			await this.sleep(sleepDuration);
		}
	}

	// Cleanup method for background task
	private cleanupBackgroundTask(): void {
		console.log("[BackgroundScanner] Background task cleanup started");

		try {
			// Reset running state
			this.isRunning = false;
			this.isPaused = false;
			this.currentTaskId = null;

			// Mark scanning as finished in the store
			const currentProgress = useScannerStore.getState().scanProgress;
			useScannerStore.getState().setScanProgress({
				...currentProgress,
				isScanning: false,
			});

			// Clear scan state
			this.clearScanState();

			// Update store
			useScannerStore.getState().setBackgroundScanEnabled(false);

			console.log("[BackgroundScanner] Background task cleanup completed");
		} catch (error) {
			console.error("[BackgroundScanner] Error during cleanup:", error);
		}
	}

	private getIntervalMs(frequency: string): number {
		switch (frequency) {
			case "on_new_image":
				return 30000; // Check every 30 seconds for new images
			case "hourly":
				return 60 * 60 * 1000; // 1 hour
			case "daily":
				return 24 * 60 * 60 * 1000; // 24 hours
			case "weekly":
				return 7 * 24 * 60 * 60 * 1000; // 7 days
			default:
				return 60 * 60 * 1000; // Default 1 hour
		}
	}

	async shouldRunScan(): Promise<boolean> {
		// If this is a forced immediate scan (manual trigger or new images), run it
		if (this.forceImmediateScan) {
			const reason = this.hasNewImagesQueue
				? "new images detected"
				: "manual trigger";
			console.log(
				`[BackgroundScanner] Forcing immediate scan due to: ${reason}`,
			);
			this.forceImmediateScan = false; // Reset flag
			return true;
		}

		const settings = settingsStore.getState().settings;

		// Check if auto-scan is enabled
		if (!settings.autoScan) {
			console.log("[BackgroundScanner] Auto-scan disabled");
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

		// Handle different scan frequency modes
		if (settings.scanFrequency === "on_new_image") {
			// For new image detection mode, we rely on the gallery monitor to trigger scans
			// Don't run periodic scans, only when new images are detected
			return false;
		}

		// Check if enough time has passed since last scan for time-based frequencies
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

			// Stop watchdog
			this.stopServiceWatchdog();

			// Stop gallery monitoring
			galleryMonitor.stopMonitoring();

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
		const settings = settingsStore.getState().settings;
		const galleryMonitorStatus = galleryMonitor.getStatus();

		return {
			isRunning: this.isRunning,
			isPaused: this.isPaused,
			isServiceRunning: BackgroundService.isRunning(),
			lastScanTime: this.lastScanTime,
			currentProgress: galleryScanner.getProgress(),
			appState: this.appState,
			scanFrequency: settings.scanFrequency,
			autoScanEnabled: settings.autoScan,
			galleryMonitoring: {
				isActive: galleryMonitorStatus.isMonitoring,
				lastImageCount: galleryMonitorStatus.lastImageCount,
				lastCheckTime: galleryMonitorStatus.lastCheckTime,
			},
		};
	}

	cleanup() {
		console.log("[BackgroundScanner] Cleaning up");

		// Stop watchdog
		this.stopServiceWatchdog();

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
