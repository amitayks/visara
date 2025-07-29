import React, { useEffect } from "react";
import {
	Alert,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { backgroundScanner } from "../../services/gallery/backgroundScanner";
import { galleryScanner } from "../../services/gallery/GalleryScanner";
import { useScannerStore } from "../../stores/scannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { checkDocumentStorage } from "../../utils/documentMigration";

interface SettingItem {
	id: string;
	title: string;
	subtitle?: string;
	icon: string;
	type: "toggle" | "link" | "info" | "select";
	value?: boolean | string | number;
	onValueChange?: (value: any) => void;
	onPress?: () => void;
}

export default function SettingsScreen() {
	const settings = useSettingsStore((state) => state.settings);
	const updateSetting = useSettingsStore((state) => state.updateSetting);
	const { scanProgress, setBackgroundScanEnabled, isBackgroundScanEnabled } =
		useScannerStore();

	useEffect(() => {
		// Start or stop periodic scanning when auto-scan is toggled
		if (settings.autoScan) {
			backgroundScanner.startPeriodicScan();
			setBackgroundScanEnabled(true);
		} else {
			backgroundScanner.stopPeriodicScan();
			setBackgroundScanEnabled(false);
		}
	}, [settings.autoScan, settings.scanFrequency, setBackgroundScanEnabled]);

	const handleManualScan = async () => {
		try {
			const hasPermission = await galleryScanner.requestPermissions();
			if (!hasPermission) {
				Alert.alert(
					"Permission Required",
					"Please grant access to your photo library to scan for documents.",
				);
				return;
			}

			Alert.alert(
				"Start Manual Scan",
				"This will scan your entire photo library for documents. Continue?",
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Start Scan",
						onPress: () => {
							galleryScanner.startScan({}, (progress) => {
								useScannerStore.getState().setScanProgress(progress);
							});
							Alert.alert(
								"Scan Started",
								"The scan is running in the background. You can check progress in the app.",
							);
						},
					},
				],
			);
		} catch (error) {
			Alert.alert("Error", "Failed to start scan. Please try again.");
		}
	};

	const handleClearScanProgress = () => {
		Alert.alert(
			"Clear Scan Progress",
			"This will reset the scan progress and start fresh next time. Continue?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clear",
					style: "destructive",
					onPress: async () => {
						await galleryScanner.clearProgress();
						useScannerStore.getState().reset();
						Alert.alert("Success", "Scan progress has been cleared.");
					},
				},
			],
		);
	};

	const handleCheckStorage = async () => {
		try {
			await checkDocumentStorage();
			Alert.alert(
				"Storage Check",
				"Check complete. See console logs for details.",
			);
		} catch (error) {
			Alert.alert("Error", "Failed to check storage");
		}
	};

	const getScanFrequencySubtitle = () => {
		const frequencies = {
			hourly: "Scan every hour",
			daily: "Scan once per day",
			weekly: "Scan once per week",
			manual: "Manual scan only",
		};
		return frequencies[settings.scanFrequency];
	};

	const handleScanFrequencyPress = () => {
		const options = [
			{ label: "Every Hour", value: "hourly" },
			{ label: "Daily", value: "daily" },
			{ label: "Weekly", value: "weekly" },
			{ label: "Manual Only", value: "manual" },
		];

		Alert.alert(
			"Scan Frequency",
			"How often should the app scan for new documents?",
			[
				...options.map((option) => ({
					text: option.label,
					onPress: () =>
						updateSetting(
							"scanFrequency",
							option.value as "hourly" | "daily" | "weekly" | "manual",
						),
				})),
				{ text: "Cancel", style: "cancel" },
			],
		);
	};

	const settingSections = [
		{
			title: "Document Processing",
			items: [
				{
					id: "auto-scan",
					title: "Auto-scan Gallery",
					subtitle: "Automatically scan new photos for documents",
					icon: "scan-outline",
					type: "toggle" as const,
					value: settings.autoScan,
					onValueChange: (value: boolean) => updateSetting("autoScan", value),
				},
				{
					id: "scan-frequency",
					title: "Scan Frequency",
					subtitle: getScanFrequencySubtitle(),
					icon: "time-outline",
					type: "select" as const,
					onPress: handleScanFrequencyPress,
				},
				{
					id: "scan-wifi-only",
					title: "WiFi Only",
					subtitle: "Only scan when connected to WiFi",
					icon: "wifi-outline",
					type: "toggle" as const,
					value: settings.scanWifiOnly,
					onValueChange: (value: boolean) =>
						updateSetting("scanWifiOnly", value),
				},
				{
					id: "scan-quality",
					title: "Scan Quality",
					subtitle:
						settings.scanQuality === "high"
							? "High quality (uses more battery)"
							: settings.scanQuality === "medium"
								? "Balanced quality and performance"
								: "Low quality (saves battery)",
					icon: "options-outline",
					type: "link" as const,
				},
				{
					id: "manual-scan",
					title: "Manual Scan",
					subtitle: scanProgress.isScanning
						? `Scanning... ${scanProgress.processedImages}/${scanProgress.totalImages}`
						: "Start a manual scan now",
					icon: "play-circle-outline",
					type: "link" as const,
					onPress: handleManualScan,
				},
				{
					id: "clear-progress",
					title: "Clear Scan Progress",
					subtitle: "Reset and start fresh",
					icon: "refresh-outline",
					type: "link" as const,
					onPress: handleClearScanProgress,
				},
			],
		},
		{
			title: "Privacy & Security",
			items: [
				{
					id: "biometric",
					title: "Biometric Lock",
					subtitle: "Require Face ID or Touch ID to open app",
					icon: "finger-print-outline",
					type: "toggle" as const,
					value: settings.biometricLock,
					onValueChange: (value: boolean) =>
						updateSetting("biometricLock", value),
				},
				{
					id: "encryption",
					title: "Encrypt Sensitive Documents",
					subtitle: "Add extra security for sensitive files",
					icon: "lock-closed-outline",
					type: "toggle" as const,
					value: settings.encryptSensitiveDocuments,
					onValueChange: (value: boolean) =>
						updateSetting("encryptSensitiveDocuments", value),
				},
			],
		},
		{
			title: "Notifications",
			items: [
				{
					id: "notifications",
					title: "Push Notifications",
					subtitle: "Get notified about new documents",
					icon: "notifications-outline",
					type: "toggle" as const,
					value: settings.notifications,
					onValueChange: (value: boolean) =>
						updateSetting("notifications", value),
				},
			],
		},
		{
			title: "Storage",
			items: [
				{
					id: "storage",
					title: "Storage Limit",
					subtitle: `${settings.storageLimit} GB maximum`,
					icon: "server-outline",
					type: "info" as const,
				},
				{
					id: "clear-cache",
					title: "Clear Cache",
					subtitle: "Free up space by clearing temporary files",
					icon: "trash-outline",
					type: "link" as const,
				},
				{
					id: "check-storage",
					title: "Check Document Storage",
					subtitle: "Diagnose image storage issues",
					icon: "medical-outline",
					type: "link" as const,
					onPress: handleCheckStorage,
				},
			],
		},
		{
			title: "Scan Progress",
			items: [
				{
					id: "last-scan",
					title: "Last Scan",
					subtitle: scanProgress.lastScanDate
						? new Date(scanProgress.lastScanDate).toLocaleString()
						: "Never scanned",
					icon: "calendar-outline",
					type: "info" as const,
				},
				{
					id: "processed",
					title: "Images Processed",
					subtitle: `${scanProgress.processedImages} of ${scanProgress.totalImages}`,
					icon: "images-outline",
					type: "info" as const,
				},
			],
		},
		{
			title: "About",
			items: [
				{
					id: "version",
					title: "Version",
					subtitle: "1.0.0",
					icon: "information-circle-outline",
					type: "info" as const,
				},
				{
					id: "privacy",
					title: "Privacy Policy",
					icon: "shield-checkmark-outline",
					type: "link" as const,
				},
				{
					id: "terms",
					title: "Terms of Service",
					icon: "document-text-outline",
					type: "link" as const,
				},
			],
		},
	];

	const renderSettingItem = (item: SettingItem) => {
		if (item.type === "toggle") {
			return (
				<View style={styles.settingItem}>
					<View style={styles.settingItemLeft}>
						<Icon name={item.icon as any} size={24} color="#666666" />
						<View style={styles.settingTextContainer}>
							<Text style={styles.settingTitle}>{item.title}</Text>
							{item.subtitle && (
								<Text style={styles.settingSubtitle}>{item.subtitle}</Text>
							)}
						</View>
					</View>
					<Switch
						value={item.value as boolean}
						onValueChange={item.onValueChange}
						trackColor={{ false: "#E5E5E7", true: "#0066FF" }}
						thumbColor="#FFFFFF"
					/>
				</View>
			);
		}

		return (
			<TouchableOpacity
				style={styles.settingItem}
				onPress={item.onPress}
				disabled={item.type === "info"}
			>
				<View style={styles.settingItemLeft}>
					<Icon name={item.icon as any} size={24} color="#666666" />
					<View style={styles.settingTextContainer}>
						<Text style={styles.settingTitle}>{item.title}</Text>
						{item.subtitle && (
							<Text style={styles.settingSubtitle}>{item.subtitle}</Text>
						)}
					</View>
				</View>
				{(item.type === "link" || item.type === "select") && (
					<Icon name="chevron-forward" size={20} color="#CCCCCC" />
				)}
			</TouchableOpacity>
		);
	};

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				{settingSections.map((section, sectionIndex) => (
					<View
						key={section.title}
						style={[styles.section, sectionIndex === 0 && styles.firstSection]}
					>
						<Text style={styles.sectionTitle}>{section.title}</Text>
						<View style={styles.sectionContent}>
							{section.items.map((item, index) => (
								<View key={item.id}>
									{renderSettingItem(item)}
									{index < section.items.length - 1 && (
										<View style={styles.separator} />
									)}
								</View>
							))}
						</View>
					</View>
				))}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#FAFAFA",
	},
	scrollView: {
		flex: 1,
	},
	section: {
		marginTop: 32,
	},
	firstSection: {
		marginTop: 16,
	},
	sectionTitle: {
		fontSize: 13,
		fontWeight: "600",
		color: "#999999",
		textTransform: "uppercase",
		marginHorizontal: 16,
		marginBottom: 8,
	},
	sectionContent: {
		backgroundColor: "#FFFFFF",
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: "#E5E5E7",
	},
	settingItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 56,
	},
	settingItemLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	settingTextContainer: {
		marginLeft: 12,
		flex: 1,
	},
	settingTitle: {
		fontSize: 16,
		color: "#000000",
	},
	settingSubtitle: {
		fontSize: 13,
		color: "#999999",
		marginTop: 2,
	},
	separator: {
		height: 1,
		backgroundColor: "#E5E5E7",
		marginLeft: 52,
	},
});
