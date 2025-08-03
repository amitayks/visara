import {
	Alert,
	Linking,
	PermissionsAndroid,
	Platform,
} from "react-native";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";

export type PermissionStatus = "granted" | "denied" | "blocked" | "unavailable";

interface PermissionResult {
	status: PermissionStatus;
	canAskAgain: boolean;
}

class GalleryPermissions {
	async checkPermission(): Promise<PermissionResult> {
		if (Platform.OS === "android") {
			return this.checkAndroidPermission();
		} else {
			return this.checkIOSPermission();
		}
	}

	async requestPermission(): Promise<PermissionResult> {
		if (Platform.OS === "android") {
			return this.requestAndroidPermission();
		} else {
			return this.requestIOSPermission();
		}
	}

	private async checkAndroidPermission(): Promise<PermissionResult> {
		try {
			// Android 13+ uses READ_MEDIA_IMAGES
			if (Platform.Version >= 33) {
				const granted = await PermissionsAndroid.check(
					PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
				);
				
				return {
					status: granted ? "granted" : "denied",
					canAskAgain: !granted,
				};
			}
			
			// Older Android versions use READ_EXTERNAL_STORAGE
			const granted = await PermissionsAndroid.check(
				PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
			);
			
			return {
				status: granted ? "granted" : "denied",
				canAskAgain: !granted,
			};
		} catch (error) {
			console.error("Error checking Android gallery permission:", error);
			return {
				status: "unavailable",
				canAskAgain: false,
			};
		}
	}

	private async checkIOSPermission(): Promise<PermissionResult> {
		try {
			// On iOS, CameraRoll will handle permission checking internally
			// We can try to get photos to check if we have permission
			const photos = await CameraRoll.getPhotos({
				first: 1,
				assetType: "Photos",
			});
			
			return {
				status: "granted",
				canAskAgain: false,
			};
		} catch (error: any) {
			// If error contains permission-related message
			if (error.message?.includes("permission") || error.code === "E_PHOTO_LIBRARY_AUTH_DENIED") {
				return {
					status: "denied",
					canAskAgain: true,
				};
			}
			
			return {
				status: "unavailable",
				canAskAgain: false,
			};
		}
	}

	private async requestAndroidPermission(): Promise<PermissionResult> {
		try {
			let permission: string;
			let rationaleTitle: string;
			let rationaleMessage: string;

			// Android 13+ uses READ_MEDIA_IMAGES
			if (Platform.Version >= 33) {
				permission = PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES;
				rationaleTitle = "Photo Access Required";
				rationaleMessage = "Visara needs access to your photos to scan for documents. This allows the app to identify and organize your receipts, invoices, and other documents.";
			} else {
				permission = PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
				rationaleTitle = "Storage Access Required";
				rationaleMessage = "Visara needs access to your storage to scan photos for documents. This allows the app to identify and organize your receipts, invoices, and other documents.";
			}

			const granted = await PermissionsAndroid.request(permission, {
				title: rationaleTitle,
				message: rationaleMessage,
				buttonNeutral: "Ask Me Later",
				buttonNegative: "Cancel",
				buttonPositive: "OK",
			});

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
			console.error("Error requesting Android gallery permission:", error);
			return {
				status: "unavailable",
				canAskAgain: false,
			};
		}
	}

	private async requestIOSPermission(): Promise<PermissionResult> {
		try {
			// On iOS, CameraRoll will automatically prompt for permission
			const photos = await CameraRoll.getPhotos({
				first: 1,
				assetType: "Photos",
			});
			
			return {
				status: "granted",
				canAskAgain: false,
			};
		} catch (error: any) {
			if (error.message?.includes("permission") || error.code === "E_PHOTO_LIBRARY_AUTH_DENIED") {
				return {
					status: "denied",
					canAskAgain: false, // On iOS, can't ask again programmatically
				};
			}
			
			return {
				status: "unavailable",
				canAskAgain: false,
			};
		}
	}

	async handlePermissionDenied(result: PermissionResult): Promise<void> {
		if (result.status === "blocked" || (result.status === "denied" && !result.canAskAgain)) {
			// Permission is permanently denied, need to go to settings
			Alert.alert(
				"Permission Required",
				"Visara needs access to your photos to scan for documents. Please enable photo access in your device settings.",
				[
					{
						text: "Cancel",
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
				"Permission Required",
				"Visara needs access to your photos to identify and organize your documents. Without this permission, the app cannot scan your gallery for receipts, invoices, and other important documents.",
				[
					{
						text: "Not Now",
						style: "cancel",
					},
					{
						text: "Grant Access",
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
		return false;
	}

	// Additional helper for background tasks
	async checkBackgroundPermission(): Promise<boolean> {
		// On Android, we might need additional permissions for background work
		if (Platform.OS === "android") {
			// For now, gallery permission is sufficient
			// In the future, might need FOREGROUND_SERVICE permission
			const result = await this.checkPermission();
			return result.status === "granted";
		}
		
		// iOS handles background tasks differently
		const result = await this.checkPermission();
		return result.status === "granted";
	}
}

export const galleryPermissions = new GalleryPermissions();