import BackgroundService from "react-native-background-actions";
import { useScannerStore } from "../../stores/scannerStore";

export class ProgressUpdateManager {
	private lastNotificationUpdate = 0;
	private lastStoreUpdate = 0;
	private readonly notificationUpdateInterval = 3000; // 3 seconds
	private readonly storeUpdateInterval = 1000; // 1 second
	private isPaused = false;

	constructor() {
		// Initialize with current time to prevent immediate updates
		const now = Date.now();
		this.lastNotificationUpdate = now;
		this.lastStoreUpdate = now;
	}

	setPaused(paused: boolean) {
		this.isPaused = paused;
	}

	async updateProgress(progress: any, force = false): Promise<void> {
		const now = Date.now();

		// Always update store more frequently for UI responsiveness
		// This keeps the app UI smooth when user is actively watching
		if (now - this.lastStoreUpdate > this.storeUpdateInterval || force) {
			useScannerStore.getState().setScanProgress(progress);
			this.lastStoreUpdate = now;
		}

		// Update notification less frequently to preserve background performance
		// This reduces the overhead while keeping users informed
		if (
			now - this.lastNotificationUpdate > this.notificationUpdateInterval ||
			force
		) {
			if (BackgroundService.isRunning()) {
				const percentage =
					progress.totalImages > 0
						? Math.round(
								(progress.processedImages / progress.totalImages) * 100,
							)
						: 0;

				await BackgroundService.updateNotification({
					taskDesc: `Scanned ${progress.processedImages} of ${progress.totalImages} images (${percentage}%)`,
					progressBar: {
						max: progress.totalImages || 100,
						value: progress.processedImages || 0,
						indeterminate: progress.totalImages === 0,
					},
					// @ts-ignore - actions not in type definitions but supported by library
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
				});
			}
			this.lastNotificationUpdate = now;
		}
	}

	// Force an immediate update regardless of timing
	async forceUpdate(progress: any, message?: string): Promise<void> {
		if (BackgroundService.isRunning()) {
			await BackgroundService.updateNotification({
				taskDesc:
					message ||
					`Processing: ${progress.processedImages}/${progress.totalImages}`,
				progressBar: {
					max: progress.totalImages || 100,
					value: progress.processedImages || 0,
					indeterminate: progress.totalImages === 0,
				},
				// @ts-ignore - actions not in type definitions but supported by library
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
			});
		}
		useScannerStore.getState().setScanProgress(progress);
	}
}
