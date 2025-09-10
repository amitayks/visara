import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import {
	Platform,
	ScrollView,
	StatusBar,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import { useSettingsStore } from "../stores/settingsStore";
import { ScanFrequencyPicker } from "./components/ScanFrequencyPicker";
import { ScanStatus } from "./components/ScanStatus";
import { SettingsSectionHeader } from "./components/SettingsSectionHeader";
import { ToggleBar } from "./components/ToggleBar";
import { createStyles } from "./settings.style";
import { backgroundScanner } from "../services/gallery/backgroundScanner";

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

				{/* Scanning Status Section */}
				{settings.autoScan && scanStatus && (
					<>
						<SettingsSectionHeader title="Scanning Status" />
						<ScanStatus scanStatus={scanStatus} />
					</>
				)}
				<View style={styles.footer}>
					<View style={styles.versionSection}>
						{/* <Text style={styles.appName}>Visara</Text> */}
						<Text style={styles.version}>Version 1.0.0</Text>
						<Text style={styles.buildInfo}>
							Build {Platform.OS === "ios" ? "iOS" : "Android"} •{" "}
							{new Date().getFullYear()}
						</Text>

						<View style={styles.infoRow}>
							<View style={styles.infoItem}>
								<Icon
									name="shield-checkmark-outline"
									size={16}
									color={theme.textSecondary}
								/>
								<Text style={styles.infoText}>Privacy First</Text>
							</View>
							<View style={styles.infoItem}>
								<Icon
									name="phone-portrait-outline"
									size={16}
									color={theme.textSecondary}
								/>
								<Text style={styles.infoText}>On-Device AI</Text>
							</View>
						</View>

						<Text style={styles.copyright}>
							© {new Date().getFullYear()} Visara. All rights reserved.
						</Text>
					</View>
				</View>
			</ScrollView>

			{/* Version Info Section at Bottom */}
		</SafeAreaView>
	);
}
