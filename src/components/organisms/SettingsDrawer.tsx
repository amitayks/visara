import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useEffect } from "react";
import {
	Alert,
	Dimensions,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
	type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

type Theme = "light" | "dark" | "system";

interface SettingsDrawerProps {
	visible: boolean;
	onClose: () => void;
	// Processing settings
	batterySaverMode: boolean;
	nightProcessingMode: boolean;
	onBatterySaverToggle: (enabled: boolean) => void;
	onNightProcessingToggle: (enabled: boolean) => void;
	// Appearance
	theme: Theme;
	onThemeChange: (theme: Theme) => void;
	// Data management
	onClearCache: () => void;
	onDeleteAllData: () => void;
	// Legal
	appVersion: string;
	onPrivacyPolicyPress?: () => void;
	onTermsOfServicePress?: () => void;
	onLicensesPress?: () => void;
	style?: ViewStyle;
	testID?: string;
}

export function SettingsDrawer({
	visible,
	onClose,
	batterySaverMode,
	nightProcessingMode,
	onBatterySaverToggle,
	onNightProcessingToggle,
	theme,
	onThemeChange,
	onClearCache,
	onDeleteAllData,
	appVersion,
	onPrivacyPolicyPress,
	onTermsOfServicePress,
	onLicensesPress,
	testID,
}: SettingsDrawerProps) {
	const { colors, shadows } = useTheme();
	const screenHeight = Dimensions.get("window").height;

	const snapPoints = {
		closed: screenHeight,
		full: screenHeight * 0.1, // 90% visible
	};

	const translateY = useSharedValue(snapPoints.closed);

	useEffect(() => {
		if (visible) {
			translateY.value = withSpring(snapPoints.full, { damping: 20, stiffness: 300 });
		} else {
			translateY.value = withSpring(snapPoints.closed, { damping: 20, stiffness: 300 });
		}
	}, [visible, translateY, snapPoints.full, snapPoints.closed]);

	const handleClose = useCallback(() => {
		translateY.value = withSpring(snapPoints.closed, { damping: 20, stiffness: 300 });
		setTimeout(() => {
			onClose();
		}, 300);
	}, [onClose, translateY, snapPoints.closed]);

	const handleClearCache = useCallback(() => {
		Alert.alert(
			"Clear Cache",
			"This will remove temporary files and cached data. Your photos and processed metadata will not be affected.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clear",
					style: "destructive",
					onPress: () => {
						onClearCache();
					},
				},
			]
		);
	}, [onClearCache]);

	const handleDeleteAllData = useCallback(() => {
		Alert.alert(
			"Delete All Data",
			"This will permanently delete all processed metadata, app data, and reset permissions. Your original photos will not be affected. This action cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						onDeleteAllData();
					},
				},
			]
		);
	}, [onDeleteAllData]);

	// Pan gesture for dragging down to close
	const pan = Gesture.Pan()
		.onUpdate((event) => {
			const newY = snapPoints.full + event.translationY;
			if (newY >= snapPoints.full && newY <= snapPoints.closed) {
				translateY.value = newY;
			}
		})
		.onEnd((event) => {
			if (event.translationY > 100 || event.velocityY > 500) {
				runOnJS(handleClose)();
			} else {
				translateY.value = withSpring(snapPoints.full, { damping: 20, stiffness: 300 });
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
	}));

	if (!visible) {
		return null;
	}

	return (
		<GestureDetector gesture={pan}>
			<Animated.View
				style={[
					styles.container,
					{
						backgroundColor: colors.surface,
						borderTopColor: colors.border,
					},
					shadows.lg,
					animatedStyle,
				]}
				testID={testID}
			>
				{/* Drag Handle */}
				<View style={styles.handleContainer}>
					<View style={[styles.handle, { backgroundColor: colors.border }]} />
				</View>

				{/* Header */}
				<View style={styles.header}>
					<Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
					<TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
						<Icon name="close" size="medium" color={colors.text} />
					</TouchableOpacity>
				</View>

				{/* Content */}
				<ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
					{/* Processing Settings Section */}
					<View style={styles.section}>
						<Text style={[styles.sectionTitle, { color: colors.text }]}>Processing</Text>

						<View style={styles.settingRow}>
							<View style={styles.settingInfo}>
								<Text style={[styles.settingLabel, { color: colors.text }]}>Battery Saver Mode</Text>
								<Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
									Pause processing when device is not charging
								</Text>
							</View>
							<Switch
								value={batterySaverMode}
								onValueChange={onBatterySaverToggle}
								trackColor={{ false: colors.border, true: colors.buttonPrimary }}
								thumbColor={colors.surface}
							/>
						</View>

						<View style={styles.settingRow}>
							<View style={styles.settingInfo}>
								<Text style={[styles.settingLabel, { color: colors.text }]}>Night Processing</Text>
								<Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
									Only process during 00:00-06:00 time window
								</Text>
							</View>
							<Switch
								value={nightProcessingMode}
								onValueChange={onNightProcessingToggle}
								trackColor={{ false: colors.border, true: colors.buttonPrimary }}
								thumbColor={colors.surface}
							/>
						</View>
					</View>

					{/* Appearance Section */}
					<View style={styles.section}>
						<Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>

						<View style={styles.themeButtons}>
							<Button
								variant={theme === "light" ? "primary" : "secondary"}
								size="small"
								onPress={() => onThemeChange("light")}
								icon={<Icon name="white-balance-sunny" size="small" />}
								style={styles.themeButton}
							>
								Light
							</Button>
							<Button
								variant={theme === "dark" ? "primary" : "secondary"}
								size="small"
								onPress={() => onThemeChange("dark")}
								icon={<Icon name="weather-night" size="small" />}
								style={styles.themeButton}
							>
								Dark
							</Button>
							<Button
								variant={theme === "system" ? "primary" : "secondary"}
								size="small"
								onPress={() => onThemeChange("system")}
								icon={<Icon name="cellphone" size="small" />}
								style={styles.themeButton}
							>
								System
							</Button>
						</View>
					</View>

					{/* Data Management Section */}
					<View style={styles.section}>
						<Text style={[styles.sectionTitle, { color: colors.text }]}>Data Management</Text>

						<Button
							variant="secondary"
							size="medium"
							onPress={handleClearCache}
							icon={<Icon name="broom" size="small" />}
							style={styles.actionButton}
						>
							Clear Cache
						</Button>

						<View style={{ marginTop: Spacing.sm }}>
							<Button
								variant="secondary"
								size="medium"
								onPress={handleDeleteAllData}
								icon={<Icon name="delete-forever" size="small" />}
								style={styles.actionButton}
							>
								Delete All Data
							</Button>
						</View>
					</View>

					{/* Legal Section */}
					<View style={[styles.section, styles.lastSection]}>
						<Text style={[styles.sectionTitle, { color: colors.text }]}>Legal</Text>

						{onPrivacyPolicyPress && (
							<TouchableOpacity style={styles.legalRow} onPress={onPrivacyPolicyPress}>
								<Text style={[styles.legalLabel, { color: colors.text }]}>Privacy Policy</Text>
								<Icon name="chevron-right" size="small" color={colors.textSecondary} />
							</TouchableOpacity>
						)}

						{onTermsOfServicePress && (
							<TouchableOpacity style={styles.legalRow} onPress={onTermsOfServicePress}>
								<Text style={[styles.legalLabel, { color: colors.text }]}>Terms of Service</Text>
								<Icon name="chevron-right" size="small" color={colors.textSecondary} />
							</TouchableOpacity>
						)}

						{onLicensesPress && (
							<TouchableOpacity style={styles.legalRow} onPress={onLicensesPress}>
								<Text style={[styles.legalLabel, { color: colors.text }]}>Open Source Licenses</Text>
								<Icon name="chevron-right" size="small" color={colors.textSecondary} />
							</TouchableOpacity>
						)}

						<View style={styles.versionRow}>
							<Text style={[styles.versionLabel, { color: colors.textSecondary }]}>
								Version {appVersion}
							</Text>
						</View>
					</View>
				</ScrollView>
			</Animated.View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: BorderRadius.xl,
		borderTopRightRadius: BorderRadius.xl,
		borderTopWidth: 1,
	},
	handleContainer: {
		alignItems: "center",
		paddingVertical: Spacing.sm,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: BorderRadius.full,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.md,
		paddingBottom: Spacing.md,
	},
	headerTitle: {
		fontSize: Typography.fontSize.xxl,
		fontWeight: Typography.fontWeight.bold,
	},
	content: {
		flex: 1,
		paddingHorizontal: Spacing.md,
	},
	section: {
		marginBottom: Spacing.xl,
	},
	lastSection: {
		marginBottom: Spacing.xxl,
	},
	sectionTitle: {
		fontSize: Typography.fontSize.lg,
		fontWeight: Typography.fontWeight.bold,
		marginBottom: Spacing.md,
	},
	settingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: Spacing.sm,
	},
	settingInfo: {
		flex: 1,
		marginRight: Spacing.md,
	},
	settingLabel: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.medium,
		marginBottom: Spacing.xs / 2,
	},
	settingDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
	themeButtons: {
		flexDirection: "row",
		gap: Spacing.sm,
	},
	themeButton: {
		flex: 1,
	},
	actionButton: {
		width: "100%",
	},
	legalRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: Spacing.sm,
	},
	legalLabel: {
		fontSize: Typography.fontSize.md,
	},
	versionRow: {
		alignItems: "center",
		paddingVertical: Spacing.md,
		marginTop: Spacing.sm,
	},
	versionLabel: {
		fontSize: Typography.fontSize.sm,
	},
});
