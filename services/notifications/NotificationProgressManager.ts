// services/notifications/NotificationProgressManager.ts
import { Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import { progressTracker } from "../progress/ProductionProgressTracker";

/**
 * Unified notification manager that mirrors the progress bar
 * Only shows during actual processing, not during monitoring
 */
export class NotificationProgressManager {
	private static instance: NotificationProgressManager;

	// State
	private isShowingNotification = false;
	private currentTaskId: string | null = null;
	private lastUpdateTime = 0;
	private updateThrottle = 500; // Update every 500ms max

	// Configuration
	private readonly options = {
		taskName: "Document Scanner",
		taskTitle: "Processing Documents",
		taskDesc: "Preparing...",
		taskIcon: {
			name: "ic_launcher",
			type: "mipmap",
		},
		color: "#007AFF",
		linkingURI: "visara://",
		parameters: {
			delay: 100,
		},
		// Critical for background processing
		importance: 3, // IMPORTANCE_DEFAULT
		notificationImportance: 3, // IMPORTANCE_DEFAULT
	};

	private constructor() {
		this.subscribeToProgress();
	}

	static getInstance(): NotificationProgressManager {
		if (!NotificationProgressManager.instance) {
			NotificationProgressManager.instance = new NotificationProgressManager();
		}
		return NotificationProgressManager.instance;
	}

	/**
	 * Subscribe to progress tracker updates
	 */
	private subscribeToProgress(): void {
		progressTracker.getProgress$().subscribe((progress) => {
			// Only show notification when actually processing
			if (progress.isActive && progress.total > 0 && progress.processed > 0) {
				this.updateNotification(progress);
			} else if (!progress.isActive && this.isShowingNotification) {
				// Hide when complete
				this.hideNotification();
			}
		});
	}

	/**
	 * Start showing notification for processing
	 * Called when actual image processing begins
	 */
	async startProcessingNotification(totalImages: number): Promise<void> {
		// Don't show for small batches (monitoring)
		if (totalImages <= 3) {
			console.log(
				"[NotificationProgress] Skipping notification for small batch",
			);
			return;
		}

		// Don't show if already showing
		if (this.isShowingNotification) {
			return;
		}

		console.log(
			"[NotificationProgress] Starting notification for",
			totalImages,
			"images",
		);

		try {
			// Start background service with notification
			await BackgroundService.start(
				this.backgroundTask.bind(this),
				this.options,
			);
			this.isShowingNotification = true;
			this.currentTaskId = Date.now().toString();

			// Initial notification
			await this.updateNotificationText({
				title: "Scanning Documents",
				desc: `Processing ${totalImages} images...`,
				percentage: 0,
			});
		} catch (error) {
			console.error("[NotificationProgress] Failed to start:", error);
		}
	}

	/**
	 * Update notification with current progress
	 * Throttled to prevent excessive updates
	 */
	private async updateNotification(progress: any): Promise<void> {
		if (!this.isShowingNotification) return;

		// Throttle updates
		const now = Date.now();
		if (now - this.lastUpdateTime < this.updateThrottle) {
			return;
		}
		this.lastUpdateTime = now;

		const percentage = progress.percentage || 0;
		const fileName = this.extractFileName(progress.currentFile);

		await this.updateNotificationText({
			title: `Processing: ${percentage}%`,
			desc: fileName || "Scanning documents...",
			percentage,
		});
	}

	/**
	 * Update notification text and progress bar
	 */
	private async updateNotificationText(params: {
		title: string;
		desc: string;
		percentage: number;
	}): Promise<void> {
		if (!BackgroundService.isRunning()) return;

		try {
			await BackgroundService.updateNotification({
				taskTitle: params.title,
				taskDesc: params.desc,
				progressBar: {
					max: 100,
					value: params.percentage,
					indeterminate: params.percentage === 0,
				},
				// Ensure text is visible on all Android versions
				...(Platform.OS === "android" && {
					ongoing: true,
					importance: 3, // IMPORTANCE_DEFAULT
					priority: 1, // PRIORITY_DEFAULT
					visibility: 1, // VISIBILITY_PUBLIC
				}),
			});
		} catch (error) {
			console.error("[NotificationProgress] Update failed:", error);
		}
	}

	/**
	 * Hide notification and stop background service
	 */
	async hideNotification(): Promise<void> {
		if (!this.isShowingNotification) return;

		console.log("[NotificationProgress] Hiding notification");

		try {
			// Show completion briefly
			if (BackgroundService.isRunning()) {
				await this.updateNotificationText({
					title: "Scan Complete",
					desc: "All documents processed",
					percentage: 100,
				});

				// Wait 2 seconds then hide
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Stop background service
			await BackgroundService.stop();
		} catch (error) {
			console.error("[NotificationProgress] Failed to hide:", error);
		} finally {
			this.isShowingNotification = false;
			this.currentTaskId = null;
			this.lastUpdateTime = 0;
		}
	}

	/**
	 * Force hide without delay
	 */
	async forceHide(): Promise<void> {
		if (BackgroundService.isRunning()) {
			await BackgroundService.stop();
		}
		this.isShowingNotification = false;
		this.currentTaskId = null;
	}

	/**
	 * Background task that keeps the app alive
	 */
	private async backgroundTask(): Promise<void> {
		// This task just keeps the service alive
		// Actual processing happens in GalleryScanner

		console.log("[NotificationProgress] Background task started");

		// Keep alive loop
		while (BackgroundService.isRunning()) {
			// Check every 5 seconds
			await new Promise((resolve) => setTimeout(resolve, 5000));

			// If no progress for 30 seconds, something is wrong
			if (this.lastUpdateTime > 0 && Date.now() - this.lastUpdateTime > 30000) {
				console.warn("[NotificationProgress] No updates for 30s, stopping");
				break;
			}
		}

		console.log("[NotificationProgress] Background task ended");
	}

	/**
	 * Check if notification is currently showing
	 */
	isShowing(): boolean {
		return this.isShowingNotification;
	}

	/**
	 * Extract filename from URI
	 */
	private extractFileName(uri: string | null): string {
		if (!uri) return "Processing...";
		const parts = uri.split("/");
		return parts[parts.length - 1] || "Processing...";
	}

	/**
	 * Clean up
	 */
	async cleanup(): Promise<void> {
		await this.forceHide();
	}
}

// Export singleton
export const notificationProgress = NotificationProgressManager.getInstance();
