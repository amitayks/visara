import { AppState, AppStateStatus, Platform } from "react-native";
import { AppStorage } from "../storage/MMKVStorage";
import { galleryPermissions } from "../services/permissions/galleryPermissions";
import { useSettingsStore } from "../stores/settingsStore";

export class PermissionChangeHandler {
	private static instance: PermissionChangeHandler;
	private appStateSubscription: any;
	private lastPermissionStatus: string | null = null;

	static getInstance() {
		if (!PermissionChangeHandler.instance) {
			PermissionChangeHandler.instance = new PermissionChangeHandler();
		}
		return PermissionChangeHandler.instance;
	}

	async initialize() {
		console.log("[PermissionChangeHandler] Initializing");

		// Listen for app state changes
		this.appStateSubscription = AppState.addEventListener(
			"change",
			this.handleAppStateChange,
		);

		// On Android, permission changes can cause app restart
		if (Platform.OS === "android") {
			await this.checkForPermissionRestart();
		}

		// Load last permission status
		this.lastPermissionStatus = await AppStorage.getItem(
			"last_permission_status",
		);
	}

	private handleAppStateChange = async (nextAppState: AppStateStatus) => {
		if (nextAppState === "active") {
			console.log(
				"[PermissionChangeHandler] App became active, checking permissions",
			);

			try {
				// App came to foreground, check if permissions changed
				const currentPerms = await galleryPermissions.checkPermission();
				const storedPerms = await AppStorage.getItem("last_permission_status");

				if (storedPerms && storedPerms !== currentPerms.status) {
					console.log(
						`[PermissionChangeHandler] Permissions changed: ${storedPerms} -> ${currentPerms.status}`,
					);
					// Handle permission change
					await this.handlePermissionChange(currentPerms.status);
				}

				await AppStorage.setItem("last_permission_status", currentPerms.status);
				this.lastPermissionStatus = currentPerms.status;
			} catch (error) {
				console.error(
					"[PermissionChangeHandler] Error checking permissions:",
					error,
				);
			}
		}
	};

	private async checkForPermissionRestart() {
		try {
			// Check if app was restarted due to permission change
			const lastCrashReason = await AppStorage.getItem("last_crash_reason");
			if (lastCrashReason === "permission_change") {
				console.log(
					"[PermissionChangeHandler] App restarted due to permission change",
				);
				await AppStorage.removeItem("last_crash_reason");

				// Real-time system handles restart automatically
			}
		} catch (error) {
			console.error(
				"[PermissionChangeHandler] Error checking for restart:",
				error,
			);
		}
	}

	private async handlePermissionChange(newStatus: string) {
		console.log(
			`[PermissionChangeHandler] Handling permission change to: ${newStatus}`,
		);

		if (newStatus === "granted") {
			// Permission was granted - real-time monitoring will start automatically
			console.log(
				"[PermissionChangeHandler] Permission granted, real-time monitoring will start automatically",
			);
		} else {
			// Permission was revoked - real-time monitoring will stop automatically
			console.log(
				"[PermissionChangeHandler] Permission revoked, real-time monitoring will stop automatically",
			);
		}
	}


	async savePermissionCrash() {
		try {
			await AppStorage.setItem("last_crash_reason", "permission_change");
		} catch (error) {
			console.error(
				"[PermissionChangeHandler] Error saving crash reason:",
				error,
			);
		}
	}

	cleanup() {
		if (this.appStateSubscription) {
			this.appStateSubscription.remove();
		}
	}
}

export const permissionChangeHandler = PermissionChangeHandler.getInstance();
