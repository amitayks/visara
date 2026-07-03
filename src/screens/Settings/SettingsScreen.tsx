import { SettingsDrawer } from "@components/organisms/SettingsDrawer";
import { type Theme, useSettings } from "@contexts/SettingsContext";
import { LibraryReprocessingService } from "@services/orchestrator/LibraryReprocessingService";
import { useCallback } from "react";
import { StyleSheet } from "react-native";
import DeviceInfo from "react-native-device-info";

export function SettingsScreen() {
	const { state: settingsState, dispatch: settingsDispatch } = useSettings();

	// Get app version
	const appVersion = DeviceInfo.getVersion();

	// Handle Battery Saver toggle
	const handleBatterySaverToggle = useCallback(
		(_enabled: boolean) => {
			settingsDispatch({ type: "TOGGLE_BATTERY_SAVER" });
		},
		[settingsDispatch],
	);

	// Handle Night Processing toggle
	const handleNightProcessingToggle = useCallback(
		(_enabled: boolean) => {
			settingsDispatch({ type: "TOGGLE_NIGHT_PROCESSING" });
		},
		[settingsDispatch],
	);

	// Handle theme change - updates immediately (FR-062)
	const handleThemeChange = useCallback(
		(theme: Theme) => {
			settingsDispatch({ type: "SET_THEME", payload: theme });
		},
		[settingsDispatch],
	);

	// Handle Clear Cache
	const handleClearCache = useCallback(async () => {
		try {
			// TODO: Implement actual cache clearing logic
			// - Clear thumbnail cache
			// - Clear temporary files
			// - Clear any cached data
			console.log("Clearing cache...");

			// Simulate async operation
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log("Cache cleared successfully");
		} catch (error) {
			console.error("Failed to clear cache:", error);
		}
	}, []);

	// Handle Delete All Data
	const handleDeleteAllData = useCallback(async () => {
		try {
			// TODO: Implement complete data deletion
			// - Clear all WatermelonDB data
			// - Clear MMKV storage
			// - Clear search index
			// - Reset encryption keys
			// - Clear all preferences
			// - Reset app to initial state
			console.log("Deleting all data...");

			// Reset settings to initial state
			settingsDispatch({ type: "RESET_SETTINGS" });

			// Simulate async operation
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log("All data deleted successfully");
		} catch (error) {
			console.error("Failed to delete data:", error);
		}
	}, [settingsDispatch]);

	// Handle Re-run Analysis — fire-and-forget model-version-aware reprocess.
	// Idempotent inside the service: a no-op while a sweep or drain is active.
	const handleReRunAnalysis = useCallback(async () => {
		try {
			await LibraryReprocessingService.requestReprocess();
		} catch (error) {
			console.error("Failed to start re-analysis:", error);
		}
	}, []);

	// Handle drawer close
	const handleDrawerClose = useCallback(() => {
		// Navigate back to previous screen
		console.log("Settings drawer closed");
	}, []);

	// Legal section handlers (optional)
	const handlePrivacyPolicyPress = useCallback(() => {
		// TODO: Open privacy policy (webview or external browser)
		console.log("Privacy Policy pressed");
	}, []);

	const handleTermsOfServicePress = useCallback(() => {
		// TODO: Open terms of service (webview or external browser)
		console.log("Terms of Service pressed");
	}, []);

	const handleLicensesPress = useCallback(() => {
		// TODO: Open licenses screen showing all third-party licenses
		console.log("Licenses pressed");
	}, []);

	return (
		<SettingsDrawer
			visible={true}
			onClose={handleDrawerClose}
			batterySaverMode={settingsState.batterySaver}
			nightProcessingMode={settingsState.nightProcessing}
			onBatterySaverToggle={handleBatterySaverToggle}
			onNightProcessingToggle={handleNightProcessingToggle}
			onReRunAnalysis={handleReRunAnalysis}
			theme={settingsState.theme}
			onThemeChange={handleThemeChange}
			onClearCache={handleClearCache}
			onDeleteAllData={handleDeleteAllData}
			appVersion={appVersion}
			onPrivacyPolicyPress={handlePrivacyPolicyPress}
			onTermsOfServicePress={handleTermsOfServicePress}
			onLicensesPress={handleLicensesPress}
			style={styles.container}
		/>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});
