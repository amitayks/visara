import { Icon } from "@components/atoms/Icon";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { StyleSheet, Text, View } from "react-native";

export function OnboardingScreen3() {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			{/* Privacy Icon */}
			<View style={[styles.iconContainer, { backgroundColor: colors.buttonPrimary }]}>
				<Icon name="shield-lock" size={64} color={colors.buttonPrimaryText} />
			</View>

			{/* Title */}
			<Text style={[styles.title, { color: colors.text }]}>
				Your Privacy Matters
			</Text>

			{/* Description */}
			<Text style={[styles.description, { color: colors.textSecondary }]}>
				All processing happens on your device. Your photos never leave your phone.
			</Text>

			{/* Privacy Guarantees */}
			<View style={styles.guaranteesList}>
				<View style={styles.guaranteeItem}>
					<View style={[styles.checkCircle, { backgroundColor: colors.surface }]}>
						<Icon name="check" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							100% On-Device Processing
						</Text>
						<Text style={[styles.guaranteeDescription, { color: colors.textSecondary }]}>
							All AI analysis runs locally on your device without internet
						</Text>
					</View>
				</View>

				<View style={styles.guaranteeItem}>
					<View style={[styles.checkCircle, { backgroundColor: colors.surface }]}>
						<Icon name="check" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							No Cloud Uploads
						</Text>
						<Text style={[styles.guaranteeDescription, { color: colors.textSecondary }]}>
							Your photos and data stay on your device, always
						</Text>
					</View>
				</View>

				<View style={styles.guaranteeItem}>
					<View style={[styles.checkCircle, { backgroundColor: colors.surface }]}>
						<Icon name="check" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							Encrypted Storage
						</Text>
						<Text style={[styles.guaranteeDescription, { color: colors.textSecondary }]}>
							All processed data is encrypted with device-level security
						</Text>
					</View>
				</View>

				<View style={styles.guaranteeItem}>
					<View style={[styles.checkCircle, { backgroundColor: colors.surface }]}>
						<Icon name="check" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							No Analytics or Tracking
						</Text>
						<Text style={[styles.guaranteeDescription, { color: colors.textSecondary }]}>
							We don't collect, track, or share any of your information
						</Text>
					</View>
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
	guaranteesList: {
		width: "100%",
		gap: Spacing.md,
	},
	guaranteeItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: Spacing.md,
	},
	checkCircle: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	guaranteeContent: {
		flex: 1,
		gap: Spacing.xs / 2,
	},
	guaranteeTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	guaranteeDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
});
