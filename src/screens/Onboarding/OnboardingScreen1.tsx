import { Icon } from "@components/atoms/Icon";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { StyleSheet, Text, View } from "react-native";

export function OnboardingScreen1() {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			{/* App Icon/Logo */}
			<View style={[styles.iconContainer, { backgroundColor: colors.buttonPrimary }]}>
				<Icon name="folder-multiple-image" size={64} color={colors.buttonPrimaryText} />
			</View>

			{/* Welcome Title */}
			<Text style={[styles.title, { color: colors.text }]}>
				Welcome to Visara
			</Text>

			{/* Description */}
			<Text style={[styles.description, { color: colors.textSecondary }]}>
				Your intelligent photo gallery that helps you organize and find your photos effortlessly.
			</Text>

			{/* Features List */}
			<View style={styles.featuresList}>
				<View style={styles.featureItem}>
					<Icon name="magnify" size="small" color={colors.buttonPrimary} />
					<Text style={[styles.featureText, { color: colors.text }]}>
						Search photos with natural language
					</Text>
				</View>

				<View style={styles.featureItem}>
					<Icon name="auto-fix" size="small" color={colors.buttonPrimary} />
					<Text style={[styles.featureText, { color: colors.text }]}>
						Automatic smart organization
					</Text>
				</View>

				<View style={styles.featureItem}>
					<Icon name="shield-check" size="small" color={colors.buttonPrimary} />
					<Text style={[styles.featureText, { color: colors.text }]}>
						100% private and secure
					</Text>
				</View>
			</View>
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
	featuresList: {
		width: "100%",
		gap: Spacing.lg,
	},
	featureItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: Spacing.md,
	},
	featureText: {
		fontSize: Typography.fontSize.md,
		flex: 1,
	},
});
