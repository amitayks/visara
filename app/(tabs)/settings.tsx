import React, { useEffect, useState, useRef } from "react";
import {
	Alert,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
	AppState,
	AppStateStatus,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { backgroundScanner } from "../../services/gallery/backgroundScanner";
import { galleryScanner } from "../../services/gallery/GalleryScanner";
import { galleryPermissions } from "../../services/permissions/galleryPermissions";
import { useScannerStore, scannerStoreHelpers } from "../../stores/scannerStore";
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
	
	// State to track initialization
	const [isInitialized, setIsInitialized] = useState(false);
	const [hasPermissions, setHasPermissions] = useState(false);
	const [isStartingBackgroundScan, setIsStartingBackgroundScan] = useState(false);
	const appState = useRef(AppState.currentState);
	const backgroundStartTimeout = useRef<NodeJS.Timeout | null>(null);

	// Check permissions on mount without requesting
	useEffect(() => {
		console.log('[Settings] Component mounting');
		checkPermissionsOnly();
		
		// Listen to app state changes
		const subscription = AppState.addEventListener('change', handleAppStateChange);
		
		return () => {
			// Cleanup
			if (backgroundStartTimeout.current) {
				clearTimeout(backgroundStartTimeout.current);
			}
			subscription.remove();
		};
	}, []);

	// Handle background service initialization separately
	useEffect(() => {
		if (isInitialized && appState.current === 'active') {
			console.log('[Settings] Initialized, checking if should start background scan');
			
			// Clear any existing timeout
			if (backgroundStartTimeout.current) {
				clearTimeout(backgroundStartTimeout.current);
			}
			
			if (settings.autoScan && hasPermissions && !isStartingBackgroundScan) {
				// Delay starting background service to ensure UI is stable
				console.log('[Settings] Scheduling background scan start');
				backgroundStartTimeout.current = setTimeout(() => {
					startBackgroundScanning();
				}, 2000); // 2 second delay
			} else if (!settings.autoScan && isBackgroundScanEnabled) {
				// Stop background scanning if disabled
				stopBackgroundScanning();
			}
		}
	}, [isInitialized, hasPermissions, settings.autoScan, isBackgroundScanEnabled]);

	const handleAppStateChange = (nextAppState: AppStateStatus) => {
		appState.current = nextAppState;
	};

	const checkPermissionsOnly = async () => {
		try {
			console.log('[Settings] Checking permissions');
			const result = await galleryPermissions.checkPermission();
			setHasPermissions(result.status === 'granted');
			console.log('[Settings] Permissions check result:', result.status);
		} catch (error) {
			console.error('[Settings] Permission check error:', error);
			setHasPermissions(false);
		} finally {
			setIsInitialized(true);
		}
	};

	const startBackgroundScanning = async () => {
		if (isStartingBackgroundScan) {
			console.log('[Settings] Already starting background scan, skipping');
			return;
		}
		
		setIsStartingBackgroundScan(true);
		
		try {
			console.log('[Settings] Starting background scanning safely');
			
			// Check if app is in correct state
			if (AppState.currentState !== 'active') {
				console.log('[Settings] App not active, postponing background scan');
				return;
			}
			
			// Check permissions again before starting
			const permStatus = await galleryPermissions.checkPermission();
			if (permStatus.status !== 'granted') {
				console.log('[Settings] Permissions not granted');
				setHasPermissions(false);
				return;
			}
			
			// First stop any existing background service
			await backgroundScanner.stopPeriodicScan();
			
			// Wait a bit for cleanup
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Now start the service
			await backgroundScanner.startPeriodicScan();
			setBackgroundScanEnabled(true);
			
			console.log('[Settings] Background scanning started successfully');
		} catch (error) {
			console.error('[Settings] Failed to start background scanning:', error);
			// Don't crash the app, just log the error
			Alert.alert(
				'Background Scan Error',
				'Failed to start background scanning. Please try again.',
				[{ text: 'OK' }]
			);
		} finally {
			setIsStartingBackgroundScan(false);
		}
	};

	const stopBackgroundScanning = async () => {
		try {
			console.log('[Settings] Stopping background scanning');
			await backgroundScanner.stopPeriodicScan();
			setBackgroundScanEnabled(false);
		} catch (error) {
			console.error('[Settings] Failed to stop background scanning:', error);
		}
	};

	const handleManualScan = async () => {
		if (scanProgress.isScanning) {
			Alert.alert(
				"Scan in Progress",
				"A scan is already running. Please wait for it to complete.",
			);
			return;
		}
		
		try {
			// First check if we have permissions
			let hasPermission = await galleryScanner.hasPermissions();
			
			if (!hasPermission) {
				// Request permissions if we don't have them
				hasPermission = await galleryScanner.requestPermissions();
				if (!hasPermission) {
					Alert.alert(
						"Permission Required",
						"Please grant access to your photo library to scan for documents.",
					);
					return;
				}
				// Update local state
				setHasPermissions(true);
			}

			Alert.alert(
				"Start Manual Scan",
				"This will scan your entire photo library for documents. Continue?",
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Start Scan",
						onPress: async () => {
							try {
								// Start scan with error handling
								await galleryScanner.startScan(
									{
										batchSize: settings.maxScanBatchSize || 20,
										wifiOnly: settings.scanWifiOnly,
										smartFilterEnabled: settings.smartFilterEnabled,
										batterySaver: settings.batterySaver,
									},
									(progress) => {
										useScannerStore.getState().setScanProgress(progress);
									}
								);
								Alert.alert(
									"Scan Started",
									"The scan is running. You can check progress in the app.",
								);
							} catch (error) {
								console.error('[Settings] Manual scan error:', error);
								Alert.alert(
									"Scan Error",
									error instanceof Error ? error.message : "Failed to start scan.",
								);
							}
						},
					},
				],
			);
		} catch (error) {
			console.error('[Settings] Manual scan setup error:', error);
			Alert.alert("Error", "Failed to check permissions. Please try again.");
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

	const handleViewStatistics = () => {
		const stats = galleryScanner.getStatistics();
		const successRate = scannerStoreHelpers.getScanSuccessRate();
		
		Alert.alert(
			"Scan Statistics",
			`Total Scans: ${stats.totalScans}\n` +
			`Images Scanned: ${stats.totalImagesScanned}\n` +
			`Documents Found: ${stats.totalDocumentsFound}\n` +
			`Success Rate: ${successRate.toFixed(1)}%\n` +
			`Failed Images: ${stats.failedImages}\n` +
			`Average Scan Time: ${(stats.averageScanDuration / 1000).toFixed(1)}s`,
			[
				{
					text: "Retry Failed",
					onPress: async () => {
						if (stats.failedImages > 0) {
							Alert.alert(
								"Retry Failed Images",
								`Retry ${stats.failedImages} failed images?`,
								[
									{ text: "Cancel", style: "cancel" },
									{
										text: "Retry",
										onPress: () => galleryScanner.retryFailedImages(),
									},
								],
							);
						}
					},
				},
				{ text: "OK", style: "default" },
			],
		);
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

	const handleScanQualityPress = () => {
		const options = [
			{ label: "Low (Fast, saves battery)", value: "low" },
			{ label: "Medium (Balanced)", value: "medium" },
			{ label: "High (Best accuracy)", value: "high" },
		];

		Alert.alert(
			"Scan Quality",
			"Choose the scanning quality. Higher quality uses more battery.",
			[
				...options.map((option) => ({
					text: option.label,
					onPress: () =>
						updateSetting(
							"scanQuality",
							option.value as "low" | "medium" | "high",
						),
				})),
				{ text: "Cancel", style: "cancel" },
			],
		);
	};

	const handleBatchSizePress = () => {
		const options = [
			{ label: "10 images", value: 10 },
			{ label: "20 images (Default)", value: 20 },
			{ label: "50 images", value: 50 },
			{ label: "100 images", value: 100 },
		];

		Alert.alert(
			"Batch Size",
			"How many images to process at once? Larger batches are faster but use more memory.",
			[
				...options.map((option) => ({
					text: option.label,
					onPress: () => updateSetting("maxScanBatchSize", option.value),
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
					onValueChange: async (value: boolean) => {
						// If enabling auto-scan, check permissions first
						if (value && !hasPermissions) {
							const result = await galleryPermissions.requestPermission();
							if (result.status !== 'granted') {
								await galleryPermissions.handlePermissionDenied(result);
								return; // Don't enable if permissions denied
							}
							setHasPermissions(true);
						}
						updateSetting("autoScan", value);
					},
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
					id: "battery-saver",
					title: "Battery Saver",
					subtitle: "Pause scanning when battery is below 20%",
					icon: "battery-charging-outline",
					type: "toggle" as const,
					value: settings.batterySaver,
					onValueChange: (value: boolean) =>
						updateSetting("batterySaver", value),
				},
				{
					id: "scan-new-only",
					title: "Scan New Only",
					subtitle: "Only scan images added after last scan",
					icon: "add-circle-outline",
					type: "toggle" as const,
					value: settings.scanNewOnly,
					onValueChange: (value: boolean) =>
						updateSetting("scanNewOnly", value),
				},
				{
					id: "smart-filter",
					title: "Smart Filter",
					subtitle: "Use AI to prioritize document-like images",
					icon: "flash-outline",
					type: "toggle" as const,
					value: settings.smartFilterEnabled,
					onValueChange: (value: boolean) =>
						updateSetting("smartFilterEnabled", value),
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
					onPress: handleScanQualityPress,
				},
				{
					id: "batch-size",
					title: "Batch Size",
					subtitle: `Process ${settings.maxScanBatchSize} images at a time`,
					icon: "layers-outline",
					type: "link" as const,
					onPress: handleBatchSizePress,
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
					subtitle: (() => {
						try {
							if (scanProgress.lastScanDate) {
								const date = new Date(scanProgress.lastScanDate);
								return isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString();
							}
							return "Never scanned";
						} catch (error) {
							return "Never scanned";
						}
					})(),
					icon: "calendar-outline",
					type: "info" as const,
				},
				{
					id: "processed",
					title: "Images Processed",
					subtitle: `${scanProgress.processedImages || 0} of ${scanProgress.totalImages || 0}`,
					icon: "images-outline",
					type: "info" as const,
				},
				{
					id: "scan-stats",
					title: "Scan Statistics",
					subtitle: "View detailed scanning statistics",
					icon: "stats-chart-outline",
					type: "link" as const,
					onPress: handleViewStatistics,
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
