import { Icon } from "@components/atoms/Icon";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { StyleSheet, Text, View } from "react-native";

export function OnboardingScreen4() {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			{/* Permissions Icon */}
			<View style={[styles.iconContainer, { backgroundColor: colors.buttonPrimary }]}>
				<Icon name="key" size={64} color={colors.buttonPrimaryText} />
			</View>

			{/* Title */}
			<Text style={[styles.title, { color: colors.text }]}>
				Permissions Needed
			</Text>

			{/* Description */}
			<Text style={[styles.description, { color: colors.textSecondary }]}>
				To organize your photos, we need a few permissions. Here's why each one is needed:
			</Text>

			{/* Permissions List */}
			<View style={styles.permissionsList}>
				<View style={styles.permissionItem}>
					<View style={[styles.permissionIcon, { backgroundColor: colors.surface }]}>
						<Icon name="folder-image" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Photo Library Access
						</Text>
						<Text style={[styles.permissionDescription, { color: colors.textSecondary }]}>
							Required to discover and organize all your photos
						</Text>
					</View>
				</View>

				<View style={styles.permissionItem}>
					<View style={[styles.permissionIcon, { backgroundColor: colors.surface }]}>
						<Icon name="camera" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Camera Access
						</Text>
						<Text style={[styles.permissionDescription, { color: colors.textSecondary }]}>
							Optional - allows you to capture new photos directly in the app
						</Text>
					</View>
				</View>

				<View style={styles.permissionItem}>
					<View style={[styles.permissionIcon, { backgroundColor: colors.surface }]}>
						<Icon name="bell-outline" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Notifications
						</Text>
						<Text style={[styles.permissionDescription, { color: colors.textSecondary }]}>
							Optional - shows progress updates for background processing
						</Text>
					</View>
				</View>
			</View>

			{/* Footer Note */}
			<Text style={[styles.footerNote, { color: colors.textSecondary }]}>
				You can change these permissions anytime in your device settings
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: Spacing.xl,
	},
	iconContainer: {
		width: 120,
		height: 120,
		borderRadius: 60,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: Spacing.xl,
	},
	title: {
		fontSize: Typography.fontSize.xxxl,
		fontWeight: Typography.fontWeight.bold,
		textAlign: "center",
		marginBottom: Spacing.md,
	},
	description: {
		fontSize: Typography.fontSize.lg,
		textAlign: "center",
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.lg,
		marginBottom: Spacing.xxl,
	},
	permissionsList: {
		width: "100%",
		gap: Spacing.lg,
		marginBottom: Spacing.xl,
	},
	permissionItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: Spacing.md,
	},
	permissionIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	permissionContent: {
		flex: 1,
		gap: Spacing.xs / 2,
	},
	permissionTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	permissionDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
	footerNote: {
		fontSize: Typography.fontSize.sm,
		textAlign: "center",
		fontStyle: "italic",
	},
});
