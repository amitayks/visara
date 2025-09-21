// services/notifications/NotificationManager.ts
// Simple notification manager for background processing

import BackgroundService from "react-native-background-actions";

interface NotificationOptions {
	taskName: string;
	taskTitle: string;
	taskDesc: string;
	taskIcon: {
		name: string;
		type: string;
	};
	color: string;
	ongoing: boolean;
	linkingURI: string;
}

class NotificationManager {
	private static instance: NotificationManager;
	private isNotificationActive = false;

	static getInstance(): NotificationManager {
		if (!NotificationManager.instance) {
			NotificationManager.instance = new NotificationManager();
		}
		return NotificationManager.instance;
	}

	private constructor() {}

	/**
	 * Show persistent notification for background processing
	 */
	async showProcessingNotification(): Promise<void> {
		if (this.isNotificationActive) {
			console.log("[NotificationManager] Notification already active");
			return;
		}

		try {
			const options: NotificationOptions = {
				taskName: "DocumentProcessing",
				taskTitle: "Visara",
				taskDesc: "Processing images",
				taskIcon: {
					name: "ic_launcher",
					type: "mipmap",
				},
				color: "#0066FF",
				ongoing: true,
				linkingURI: "visara://home",
			};

			// Start the background service with a simple task
			await BackgroundService.start(this.backgroundTask, options);
			
			this.isNotificationActive = true;
			console.log("[NotificationManager] Processing notification started");
		} catch (error) {
			console.error("[NotificationManager] Failed to start notification:", error);
			throw error;
		}
	}

	/**
	 * Hide persistent notification
	 */
	async hideProcessingNotification(): Promise<void> {
		if (!this.isNotificationActive) {
			console.log("[NotificationManager] No active notification to hide");
			return;
		}

		try {
			await BackgroundService.stop();
			this.isNotificationActive = false;
			console.log("[NotificationManager] Processing notification stopped");
		} catch (error) {
			console.error("[NotificationManager] Failed to stop notification:", error);
		}
	}

	/**
	 * Check if notification is currently active
	 */
	isActive(): boolean {
		return this.isNotificationActive && BackgroundService.isRunning();
	}

	/**
	 * Simple background task that keeps the notification alive
	 */
	private backgroundTask = async () => {
		console.log("[NotificationManager] Background task started");
		
		// Keep the task running while notification should be active
		while (this.isNotificationActive && BackgroundService.isRunning()) {
			// Just sleep - no actual work needed, just keeping the notification alive
			await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second intervals
		}
		
		console.log("[NotificationManager] Background task ended");
	};
}

// Export singleton instance
export const notificationManager = NotificationManager.getInstance();