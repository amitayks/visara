import React, { useState } from "react";
import {
	View,
	Text,
	ScrollView,
	StyleSheet,
	Switch,
	TouchableOpacity,
	Alert,
	StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { MMKV } from "react-native-mmkv";
import { useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";

import { useSettingsStore } from "../stores/settingsStore";
import { useDocumentStore } from "../stores/documentStore";
import { simpleImageTracker } from "../services/tracker/SimpleImageTracker";
import { useTheme } from "../contexts/ThemeContext";
import { createStyles } from "./settings.style";

const storage = new MMKV();

export default function SettingsScreen() {
	const navigation = useNavigation();
	const { theme, isDark, toggleTheme } = useTheme();
	const { settings, updateSetting } = useSettingsStore();
	const { clearDocuments, totalDocuments } = useDocumentStore();
	const [isClearing, setIsClearing] = useState(false);

	const styles = createStyles(theme);

	const handleBack = () => {
		navigation.goBack();
	};

	const handleClearData = () => {
		Alert.alert(
			"Clear All Data",
			`This will delete all ${totalDocuments} documents and reset the app. This action cannot be undone.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clear",
					style: "destructive",
					onPress: async () => {
						setIsClearing(true);
						try {
							// Clear documents
							await clearDocuments();

							// Clear tracker
							await simpleImageTracker.clearAll();

							// Clear MMKV storage
							storage.delete("initial_scan_completed");
							storage.delete("welcome_completed");

							Alert.alert(
								"Success",
								"All data cleared. The app will restart.",
								[
									{
										text: "OK",
										onPress: () => {
											// Navigate to welcome screen
											navigation.reset({
												index: 0,
												routes: [{ name: "Welcome" } as never],
											});
										},
									},
								],
							);
						} catch (error) {
							Alert.alert("Error", "Failed to clear data");
						} finally {
							setIsClearing(false);
						}
					},
				},
			],
		);
	};

	const renderSettingRow = (
		title: string,
		subtitle?: string,
		value?: boolean,
		onToggle?: (value: boolean) => void,
	) => (
		<View style={styles.settingRow}>
			<View style={styles.settingInfo}>
				<Text style={[styles.settingTitle, { color: theme.text }]}>
					{title}
				</Text>
				{subtitle && (
					<Text
						style={[styles.settingSubtitle, { color: theme.textSecondary }]}
					>
						{subtitle}
					</Text>
				)}
			</View>
			{onToggle && (
				<Switch
					value={value}
					onValueChange={onToggle}
					trackColor={{ false: theme.border, true: theme.accent }}
					thumbColor={theme.text}
				/>
			)}
		</View>
	);

	const renderSensitivityPicker = () => (
		<View style={styles.settingRow}>
			<View style={styles.settingInfo}>
				<Text style={[styles.settingTitle, { color: theme.text }]}>
					Detection Sensitivity
				</Text>
				<Text style={[styles.settingSubtitle, { color: theme.textSecondary }]}>
					How strict document detection should be
				</Text>
			</View>
			<View
				style={[styles.segmentedControl, { backgroundColor: theme.surface }]}
			>
				{(["low", "medium", "high"] as const).map((level) => (
					<TouchableOpacity
						key={level}
						style={[
							styles.segmentButton,
							settings.documentDetectionSensitivity === level && {
								backgroundColor: theme.background,
							},
						]}
						onPress={() => updateSetting("documentDetectionSensitivity", level)}
					>
						<Text
							style={[
								styles.segmentText,
								{ color: theme.textSecondary },
								settings.documentDetectionSensitivity === level && {
									color: theme.accent,
									fontWeight: "600",
								},
							]}
						>
							{level.charAt(0).toUpperCase() + level.slice(1)}
						</Text>
					</TouchableOpacity>
				))}
			</View>
		</View>
	);

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: theme.background }]}
			edges={["top"]}
		>
			<StatusBar
				barStyle={isDark ? "light-content" : "dark-content"}
				backgroundColor={theme.background}
			/>

			{/* Header */}
			<View style={styles.header}>
				<TouchableOpacity onPress={handleBack} style={styles.backButton}>
					<Icon name="arrow-back" size={24} color={theme.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, { color: theme.text }]}>
					Settings
				</Text>
				<View style={styles.backButton} />
			</View>

			<ScrollView showsVerticalScrollIndicator={false}>
				<View style={[styles.section, { borderBottomColor: theme.border }]}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						Appearance
					</Text>
					{renderSettingRow(
						"Dark Mode",
						"Switch between light and dark themes",
						isDark,
						toggleTheme,
					)}
				</View>

				{/* Document Detection */}
				<View style={[styles.section, { borderBottomColor: theme.border }]}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						Document Detection
					</Text>
					{renderSensitivityPicker()}
				</View>

				{/* Storage */}
				<View style={[styles.section, { borderBottomColor: theme.border }]}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						Storage
					</Text>
					{renderSettingRow(
						"Save Processed Images",
						"Keep a copy of processed documents",
						settings.saveProcessedImages,
						(value) => updateSetting("saveProcessedImages", value),
					)}
				</View>

				{/* Notifications */}
				<View style={[styles.section, { borderBottomColor: theme.border }]}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						Notifications
					</Text>
					{renderSettingRow(
						"Enable Notifications",
						"Get notified when new documents are found",
						settings.notificationEnabled,
						(value) => updateSetting("notificationEnabled", value),
					)}
				</View>

				{/* Privacy */}
				<View style={[styles.section, { borderBottomColor: theme.border }]}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						Privacy
					</Text>
					{renderSettingRow(
						"Analytics",
						"Help improve the app by sharing usage data",
						settings.analyticsEnabled,
						(value) => updateSetting("analyticsEnabled", value),
					)}
					{renderSettingRow(
						"Crash Reports",
						"Automatically send crash reports",
						settings.crashReportingEnabled,
						(value) => updateSetting("crashReportingEnabled", value),
					)}
				</View>

				{/* Data Management */}
				<View style={[styles.section, { borderBottomColor: theme.border }]}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						Data Management
					</Text>
					<TouchableOpacity
						style={styles.dangerButton}
						onPress={handleClearData}
						disabled={isClearing}
					>
						<Icon name="trash-outline" size={20} color="#FF3B30" />
						<Text style={styles.dangerButtonText}>
							{isClearing
								? "Clearing..."
								: `Clear All Data (${totalDocuments} documents)`}
						</Text>
					</TouchableOpacity>
				</View>

				{/* About */}
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
						About
					</Text>
					<View style={styles.aboutRow}>
						<Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>
							Version
						</Text>
						<Text style={[styles.aboutValue, { color: theme.text }]}>
							1.0.0
						</Text>
					</View>
					<View style={styles.aboutRow}>
						<Text style={[styles.aboutLabel, { color: theme.textSecondary }]}>
							Documents Processed
						</Text>
						<Text style={[styles.aboutValue, { color: theme.text }]}>
							{totalDocuments}
						</Text>
					</View>
				</View>

				{/* Footer */}
				<View style={styles.footer}>
					<Text style={[styles.footerText, { color: theme.textSecondary }]}>
						Visara uses advanced AI to automatically detect and process
						documents in your gallery.
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

// const styles = StyleSheet.create({});
