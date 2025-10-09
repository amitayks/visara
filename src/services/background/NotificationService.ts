import notifee, {
	AndroidColor,
	AndroidImportance,
	type Event,
	EventType,
	type Notification,
} from "@notifee/react-native";
import { Platform } from "react-native";

export interface NotificationProgress {
	current: number;
	total: number;
	indeterminate?: boolean;
}

export interface NotificationAction {
	id: string;
	title: string;
	pressAction?: {
		id: string;
	};
}

export type NotificationEventHandler = (
	actionId: string,
	notification?: Notification,
) => void | Promise<void>;

/**
 * NotificationService manages foreground service notifications
 * with progress tracking and action buttons for pause/resume/stop controls
 */
export class NotificationService {
	private static channelId = "processing-channel";
	private static notificationId = "processing-notification";
	private static categoryId = "processing-category";
	private static isInitialized = false;

	// Event handlers
	private static foregroundEventHandlers: Map<
		string,
		NotificationEventHandler
	> = new Map();
	private static backgroundEventHandlers: Map<
		string,
		NotificationEventHandler
	> = new Map();

	/**
	 * Initialize the notification service
	 */
	static async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			if (Platform.OS === "android") {
				await this.createAndroidChannel();
			} else if (Platform.OS === "ios") {
				await this.createIOSCategory();
			}

			// Set up event listeners
			this.setupEventListeners();

			this.isInitialized = true;
		} catch (error) {
			console.error("NotificationService.initialize error:", error);
			throw error;
		}
	}

	/**
	 * Create Android notification channel
	 */
	private static async createAndroidChannel(): Promise<void> {
		await notifee.createChannel({
			id: this.channelId,
			name: "Processing",
			description: "Shows progress of background media processing",
			importance: AndroidImportance.HIGH,
			sound: "default",
			vibration: false,
			lights: false,
		});
	}

	/**
	 * Create iOS notification category with actions
	 */
	private static async createIOSCategory(): Promise<void> {
		await notifee.setNotificationCategories([
			{
				id: this.categoryId,
				actions: [
					{
						id: "pause",
						title: "Pause",
					},
					{
						id: "resume",
						title: "Resume",
					},
					{
						id: "stop",
						title: "Stop",
						destructive: true,
					},
				],
			},
		]);
	}

	/**
	 * Set up foreground and background event listeners
	 */
	private static setupEventListeners(): void {
		// Foreground event listener
		notifee.onForegroundEvent(async (event: Event) => {
			await this.handleEvent(event, this.foregroundEventHandlers);
		});

		// Background event listener
		notifee.onBackgroundEvent(async (event: Event) => {
			await this.handleEvent(event, this.backgroundEventHandlers);
		});
	}

	/**
	 * Handle notification events
	 */
	private static async handleEvent(
		event: Event,
		handlers: Map<string, NotificationEventHandler>,
	): Promise<void> {
		const { type, detail } = event;

		if (type === EventType.ACTION_PRESS && detail.pressAction?.id) {
			const actionId = detail.pressAction.id;
			const handler = handlers.get(actionId);

			if (handler) {
				try {
					await handler(actionId, detail.notification);
				} catch (error) {
					console.error(`Error handling action ${actionId}:`, error);
				}
			}
		}
	}

	/**
	 * Register a foreground event handler
	 */
	static onForegroundAction(
		actionId: string,
		handler: NotificationEventHandler,
	): void {
		this.foregroundEventHandlers.set(actionId, handler);
	}

	/**
	 * Register a background event handler
	 */
	static onBackgroundAction(
		actionId: string,
		handler: NotificationEventHandler,
	): void {
		this.backgroundEventHandlers.set(actionId, handler);
	}

	/**
	 * Display a foreground service notification (Android)
	 * or regular notification (iOS)
	 */
	static async displayNotification(
		title: string,
		body: string,
		progress?: NotificationProgress,
		isPaused = false,
	): Promise<void> {
		await this.ensureInitialized();

		try {
			const notification: Notification = {
				id: this.notificationId,
				title,
				body,
			};

			if (Platform.OS === "android") {
				notification.android = {
					channelId: this.channelId,
					asForegroundService: true,
					color: AndroidColor.BLUE,
					colorized: true,
					ongoing: true, // Cannot be dismissed by user
					pressAction: {
						id: "default",
					},
					actions: [
						{
							title: isPaused ? "▶ Resume" : "⏸ Pause",
							pressAction: {
								id: isPaused ? "resume" : "pause",
							},
						},
						{
							title: "⏹ Stop",
							pressAction: {
								id: "stop",
							},
						},
					],
					progress: progress
						? {
								max: progress.total,
								current: progress.current,
								indeterminate: progress.indeterminate ?? false,
							}
						: undefined,
				};
			} else if (Platform.OS === "ios") {
				notification.ios = {
					categoryId: this.categoryId,
					sound: "default",
				};
			}

			await notifee.displayNotification(notification);
		} catch (error) {
			console.error("NotificationService.displayNotification error:", error);
			throw error;
		}
	}

	/**
	 * Update notification progress
	 */
	static async updateProgress(
		current: number,
		total: number,
		isPaused = false,
	): Promise<void> {
		const percentage = Math.round((current / total) * 100);
		const status = isPaused ? "Paused" : "Processing";

		await this.displayNotification(
			`${status} Files`,
			`${current} of ${total} (${percentage}%)`,
			{
				current,
				total,
				indeterminate: false,
			},
			isPaused,
		);
	}

	/**
	 * Show paused state notification
	 */
	static async showPausedState(current: number, total: number): Promise<void> {
		await this.displayNotification(
			"Processing Paused",
			`${current} of ${total} files processed`,
			{
				current,
				total,
				indeterminate: false,
			},
			true,
		);
	}

	/**
	 * Show processing state notification
	 */
	static async showProcessingState(
		current: number,
		total: number,
	): Promise<void> {
		await this.displayNotification(
			"Processing Files",
			`${current} of ${total} files processed`,
			{
				current,
				total,
				indeterminate: false,
			},
			false,
		);
	}

	/**
	 * Show indeterminate progress
	 */
	static async showIndeterminateProgress(message: string): Promise<void> {
		await this.displayNotification("Processing Files", message, {
			current: 0,
			total: 100,
			indeterminate: true,
		});
	}

	/**
	 * Show completion notification
	 */
	static async showCompletionNotification(
		totalProcessed: number,
		totalFailed: number,
	): Promise<void> {
		try {
			const successMessage =
				totalFailed > 0
					? `${totalProcessed} processed, ${totalFailed} failed`
					: `${totalProcessed} files processed successfully`;

			await notifee.displayNotification({
				id: `completion-${Date.now()}`,
				title: "Processing Complete",
				body: successMessage,
				android: {
					channelId: this.channelId,
					color: totalFailed > 0 ? AndroidColor.YELLOW : AndroidColor.GREEN,
					smallIcon: "visara_launcher_monochrome",
					pressAction: {
						id: "default",
					},
				},
				ios: {
					sound: "default",
				},
			});
		} catch (error) {
			console.error(
				"NotificationService.showCompletionNotification error:",
				error,
			);
		}
	}

	/**
	 * Cancel the foreground service notification
	 */
	static async cancelNotification(): Promise<void> {
		try {
			await notifee.cancelNotification(this.notificationId);

			// Stop foreground service on Android
			if (Platform.OS === "android") {
				await notifee.stopForegroundService();
			}
		} catch (error) {
			console.error("NotificationService.cancelNotification error:", error);
		}
	}

	/**
	 * Cancel all notifications
	 */
	static async cancelAllNotifications(): Promise<void> {
		try {
			await notifee.cancelAllNotifications();

			// Stop foreground service on Android
			if (Platform.OS === "android") {
				await notifee.stopForegroundService();
			}
		} catch (error) {
			console.error("NotificationService.cancelAllNotifications error:", error);
		}
	}

	/**
	 * Check if notification permission is granted
	 */
	static async checkPermission(): Promise<boolean> {
		try {
			const settings = await notifee.getNotificationSettings();
			return settings.authorizationStatus >= 1; // 1 = Authorized
		} catch (error) {
			console.error("NotificationService.checkPermission error:", error);
			return false;
		}
	}

	/**
	 * Request notification permission
	 */
	static async requestPermission(): Promise<boolean> {
		try {
			const settings = await notifee.requestPermission();
			return settings.authorizationStatus >= 1; // 1 = Authorized
		} catch (error) {
			console.error("NotificationService.requestPermission error:", error);
			return false;
		}
	}

	/**
	 * Ensure service is initialized
	 */
	private static async ensureInitialized(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize();
		}
	}

	/**
	 * Clear all event handlers
	 */
	static clearEventHandlers(): void {
		this.foregroundEventHandlers.clear();
		this.backgroundEventHandlers.clear();
	}
}
