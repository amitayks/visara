import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import {
	ScrollView,
	StatusBar,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import { backgroundScanner } from "../services/gallery/backgroundScanner";
import { useSettingsStore } from "../stores/settingsStore";
import { ScanFrequencyPicker } from "./components/ScanFrequencyPicker";
import { ScanStatus } from "./components/ScanStatus";
import { SettingsFooter } from "./components/SettingsFooter";
import { SettingsSectionHeader } from "./components/SettingsSectionHeader";
import { ToggleBar } from "./components/ToggleBar";
import { createStyles } from "./settings.style";

export default function SettingsScreen() {
	const navigation = useNavigation();
	const { theme, isDark, toggleTheme } = useTheme();
	const { settings, updateSetting } = useSettingsStore();
	const styles = useThemedStyles(createStyles);
	const [scanStatus, setScanStatus] = useState<any>(null);

	// Monitor scan status
	useEffect(() => {
		const updateStatus = async () => {
			try {
				const status = await backgroundScanner.getBackgroundServiceStatus();
				setScanStatus(status);
			} catch (error) {
				console.error("Error getting scan status:", error);
			}
		};

		// Initial status check
		updateStatus();

		// Update status every 3 seconds while on settings page
		const interval = setInterval(updateStatus, 3000);

		return () => clearInterval(interval);
	}, []);

	const handleGoBack = () => {
		navigation.goBack();
	};

	return (
		<SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
			<StatusBar
				barStyle={isDark ? "light-content" : "dark-content"}
				backgroundColor={theme.background}
			/>

			{/* Header */}
			<View style={styles.header}>
				<TouchableOpacity
					style={styles.backButton}
					onPress={handleGoBack}
					activeOpacity={0.7}
				>
					<Icon name="chevron-back" size={24} color={theme.text} />
				</TouchableOpacity>
				{/* <View style={styles.headerSpacer} /> */}
				<Text style={styles.headerTitle}>Settings</Text>
			</View>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				{/* Appearance Section */}
				<SettingsSectionHeader title="Appearance" />
				<ToggleBar
					onPress={toggleTheme}
					isChange={isDark}
					title={["Dark Mode", "Light Mode"]}
					subtitle={["Switch to light theme", "Switch to dark theme"]}
					iconsName={["moon", "sunny"]}
				/>

				{/* Scanning Section */}
				<SettingsSectionHeader title="Document Scanning" />

				<ToggleBar
					onPress={() =>
						updateSetting("smartFilterEnabled", !settings.smartFilterEnabled)
					}
					isChange={settings.smartFilterEnabled}
					title={["Smart Filter On", "Smart Filter Off"]}
					subtitle={["Filter out non-documents", "Scan all images"]}
					iconsName={["funnel", "funnel-outline"]}
				/>

				<ToggleBar
					onPress={() => updateSetting("batterySaver", !settings.batterySaver)}
					isChange={settings.batterySaver}
					title={["Battery Saver On", "Battery Saver Off"]}
					subtitle={[
						"Reduce scanning in low battery",
						"Normal scanning frequency",
					]}
					iconsName={["battery-half", "battery-full"]}
				/>

				<ToggleBar
					onPress={() => updateSetting("autoScan", !settings.autoScan)}
					isChange={settings.autoScan}
					title={["Auto-Scan Enabled", "Auto-Scan Disabled"]}
					subtitle={[
						"Automatically scan new images",
						"Only scan when manually triggered",
					]}
					iconsName={["scan", "scan"]}
				/>

				<ScanFrequencyPicker
					value={settings.scanFrequency}
					onValueChange={(frequency) =>
						updateSetting("scanFrequency", frequency)
					}
					disabled={!settings.autoScan}
				/>

				{settings.autoScan && scanStatus && (
					<>
						<SettingsSectionHeader title="Scanning Status" />
						<ScanStatus scanStatus={scanStatus} />
					</>
				)}
				<SettingsFooter />
			</ScrollView>
		</SafeAreaView>
	);
}
