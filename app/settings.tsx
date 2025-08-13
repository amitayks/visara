import { useNavigation } from "@react-navigation/native";
import React from "react";
import {
	Dimensions,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { ThemeToggle } from "./components/settings/ThemeToggle";
import { SettingsSectionHeader } from "./components/settings/SettingsSectionHeader";
import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import { useSettingsStore } from "../stores/settingsStore";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function SettingsScreen() {
	const navigation = useNavigation();
	const { theme, isDark } = useTheme();
	const { isLoading } = useSettingsStore();
	const styles = useThemedStyles(createStyles);

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
				<SettingsSectionHeader
					title="Appearance"
					// subtitle="Customize how Visara looks and feels"
				/>
				<ThemeToggle />

				{/* Main content area - will be implemented later */}
				{/* <View style={styles.comingSoon}>
					<Icon name="construct-outline" size={64} color={theme.textTertiary} />
					<Text style={styles.comingSoonTitle}>More Settings Coming Soon</Text>
					<Text style={styles.comingSoonText}>
						Additional settings like auto-scan, notifications, and privacy
						options will be available in the next update.
					</Text>
				</View> */}
			</ScrollView>

			{/* Version Info Section at Bottom */}
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
		</SafeAreaView>
	);
}

const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: theme.background,
		},
		header: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: 16,
			paddingVertical: 12,
			// borderBottomWidth: 1,
			// borderBottomColor: theme.borderLight,
		},
		backButton: {
			padding: 8,
			marginLeft: -8,
		},
		headerTitle: {
			flex: 1,
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			textAlign: "center",
			marginRight: 40, // Compensate for back button width
		},
		headerSpacer: {
			width: 40, // Same as back button width for centering
		},
		content: {
			flex: 1,
		},
		comingSoon: {
			flex: 1,
			alignItems: "center",
			justifyContent: "center",
			paddingHorizontal: 40,
			minHeight: SCREEN_HEIGHT * 0.3,
			marginTop: 60,
		},
		comingSoonTitle: {
			fontSize: 24,
			fontWeight: "600",
			color: theme.text,
			marginTop: 20,
			marginBottom: 12,
		},
		comingSoonText: {
			fontSize: 16,
			color: theme.textSecondary,
			textAlign: "center",
			lineHeight: 24,
		},
		footer: {
			borderTopWidth: 1,
			// borderTopColor: theme.borderLight,
			// backgroundColor: theme.surfaceSecondary,
		},
		versionSection: {
			alignItems: "center",
			paddingHorizontal: 20,
			paddingVertical: 24,
		},
		appName: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 4,
		},
		version: {
			fontSize: 16,
			color: theme.textSecondary,
			marginBottom: 2,
		},
		buildInfo: {
			fontSize: 14,
			color: theme.textTertiary,
			marginBottom: 16,
		},
		infoRow: {
			flexDirection: "row",
			gap: 24,
			marginBottom: 16,
		},
		infoItem: {
			flexDirection: "row",
			alignItems: "center",
			gap: 6,
		},
		infoText: {
			fontSize: 13,
			color: theme.textSecondary,
			fontWeight: "500",
		},
		copyright: {
			fontSize: 12,
			color: theme.textTertiary,
			textAlign: "center",
		},
	});
