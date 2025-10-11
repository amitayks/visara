import { Icon } from "@components/atoms/Icon";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { StyleSheet, Text, View } from "react-native";

export function OnboardingScreen2() {
	const { colors } = useTheme();

	return (
		<View style={styles.container}>
			{/* AI Icon */}
			<View style={[styles.iconContainer, { backgroundColor: colors.buttonPrimary }]}>
				<Icon name="brain" size={64} color={colors.buttonPrimaryText} />
			</View>

			{/* Title */}
			<Text style={[styles.title, { color: colors.text }]}>
				Intelligent AI Features
			</Text>

			{/* Description */}
			<Text style={[styles.description, { color: colors.textSecondary }]}>
				Powerful on-device AI analyzes your photos to make them easily searchable and organized.
			</Text>

			{/* AI Capabilities */}
			<View style={styles.capabilitiesList}>
				<View style={styles.capabilityItem}>
					<View style={[styles.capabilityIcon, { backgroundColor: colors.surface }]}>
						<Icon name="image-search" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.capabilityContent}>
						<Text style={[styles.capabilityTitle, { color: colors.text }]}>
							Object Detection
						</Text>
						<Text style={[styles.capabilityDescription, { color: colors.textSecondary }]}>
							Automatically identifies objects, scenes, and concepts in your photos
						</Text>
					</View>
				</View>

				<View style={styles.capabilityItem}>
					<View style={[styles.capabilityIcon, { backgroundColor: colors.surface }]}>
						<Icon name="text-recognition" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.capabilityContent}>
						<Text style={[styles.capabilityTitle, { color: colors.text }]}>
							Text Recognition
						</Text>
						<Text style={[styles.capabilityDescription, { color: colors.textSecondary }]}>
							Extracts text from documents, receipts, and screenshots
						</Text>
					</View>
				</View>

				<View style={styles.capabilityItem}>
					<View style={[styles.capabilityIcon, { backgroundColor: colors.surface }]}>
						<Icon name="folder-star" size="small" color={colors.buttonPrimary} />
					</View>
					<View style={styles.capabilityContent}>
						<Text style={[styles.capabilityTitle, { color: colors.text }]}>
							Smart Albums
						</Text>
						<Text style={[styles.capabilityDescription, { color: colors.textSecondary }]}>
							Creates albums for receipts, documents, ID cards, and more
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
	capabilitiesList: {
		width: "100%",
		gap: Spacing.lg,
	},
	capabilityItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: Spacing.md,
	},
	capabilityIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	capabilityContent: {
		flex: 1,
		gap: Spacing.xs / 2,
	},
	capabilityTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	capabilityDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
});
