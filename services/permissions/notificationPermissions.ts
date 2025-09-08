import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";

export type PermissionStatus = "granted" | "denied" | "blocked" | "unavailable";

interface PermissionResult {
	status: PermissionStatus;
	canAskAgain: boolean;
}

class NotificationPermissions {
	async checkPermission(): Promise<PermissionResult> {
		if (Platform.OS === "android") {
			return this.checkAndroidPermission();
		} else {
			// iOS doesn't require explicit notification permissions for local notifications
			return {
				status: "granted",
				canAskAgain: false,
			};
		}
	}

	async requestPermission(): Promise<PermissionResult> {
		if (Platform.OS === "android") {
			return this.requestAndroidPermission();
		} else {
			// iOS handles notifications automatically
			return {
				status: "granted",
				canAskAgain: false,
			};
		}
	}

	private async checkAndroidPermission(): Promise<PermissionResult> {
		try {
			// Android 13+ (API 33+) requires explicit POST_NOTIFICATIONS permission
			const androidVersion = 
				typeof Platform.Version === "string"
					? parseInt(Platform.Version, 10)
					: Platform.Version;
			
			if (androidVersion >= 33) {
				const granted = await PermissionsAndroid.check(
					PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS as any,
				);

				return {
					status: granted ? "granted" : "denied",
					canAskAgain: !granted,
				};
			}

			// Older Android versions don't require explicit notification permission
			return {
				status: "granted",
				canAskAgain: false,
			};
		} catch (error) {
			console.error("Error checking Android notification permission:", error);
			return {
				status: "unavailable",
				canAskAgain: false,
			};
		}
	}

	private async requestAndroidPermission(): Promise<PermissionResult> {
		try {
			// Only request on Android 13+
			const androidVersion =
				typeof Platform.Version === "string"
					? parseInt(Platform.Version, 10)
					: Platform.Version;
			
			if (androidVersion < 33) {
				return {
					status: "granted",
					canAskAgain: false,
				};
			}

			const granted = await PermissionsAndroid.request(
				PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS as any,
				{
					title: "Notification Permission Required",
					message:
						"Visara needs notification access to show you scanning progress when the app runs in the background. This helps you track document processing even when using other apps.",
					buttonNeutral: "Ask Me Later",
					buttonNegative: "Cancel",
					buttonPositive: "Allow",
				},
			);

			if (granted === PermissionsAndroid.RESULTS.GRANTED) {
				return {
					status: "granted",
					canAskAgain: false,
				};
			} else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
				return {
					status: "blocked",
					canAskAgain: false,
				};
			} else {
				return {
					status: "denied",
					canAskAgain: true,
				};
			}
		} catch (error) {
			console.error("Error requesting Android notification permission:", error);
			return {
				status: "unavailable",
				canAskAgain: false,
			};
		}
	}

	async handlePermissionDenied(result: PermissionResult): Promise<void> {
		if (
			result.status === "blocked" ||
			(result.status === "denied" && !result.canAskAgain)
		) {
			// Permission is permanently denied, need to go to settings
			Alert.alert(
				"Notification Permission Required",
				"Visara needs notification access to show scanning progress in the background. Please enable notifications in your device settings to see scan progress updates.",
				[
					{
						text: "Continue Without Notifications",
						style: "cancel",
					},
					{
						text: "Open Settings",
						onPress: () => this.openAppSettings(),
					},
				],
			);
		} else if (result.status === "denied" && result.canAskAgain) {
			// Can try requesting again
			Alert.alert(
				"Notification Permission Needed",
				"Background scanning works better with notifications enabled. You'll be able to see scan progress and control scanning even when using other apps.",
				[
					{
						text: "Skip",
						style: "cancel",
					},
					{
						text: "Enable Notifications",
						onPress: async () => {
							await this.requestPermission();
						},
					},
				],
			);
		}
	}

	private openAppSettings() {
		if (Platform.OS === "ios") {
			Linking.openURL("app-settings:");
		} else {
			Linking.openSettings();
		}
	}

	async ensurePermission(): Promise<boolean> {
		const checkResult = await this.checkPermission();

		if (checkResult.status === "granted") {
			return true;
		}

		const requestResult = await this.requestPermission();

		if (requestResult.status === "granted") {
			return true;
		}

		// Handle denial
		await this.handlePermissionDenied(requestResult);
		
		// Return true even if denied, as background scanning can work without notifications
		// (just won't show progress updates)
		return requestResult.status !== "unavailable";
	}

	// Check if we can show notifications (for background service)
	async canShowNotifications(): Promise<boolean> {
		const result = await this.checkPermission();
		return result.status === "granted";
	}
}

export const notificationPermissions = new NotificationPermissions();