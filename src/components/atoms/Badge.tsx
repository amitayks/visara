import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

export type BadgeStatus = "pending" | "processing" | "completed" | "failed";
export type BadgeSize = "small" | "medium";

interface BadgeProps {
	status: BadgeStatus;
	label?: string;
	size?: BadgeSize;
	style?: ViewStyle;
	testID?: string;
}

export function Badge({
	status,
	label,
	size = "medium",
	style,
	testID,
}: BadgeProps) {
	const { colors } = useTheme();

	const getStatusConfig = () => {
		switch (status) {
			case "pending":
				return {
					backgroundColor: colors.badgePending,
					text: label || "Pending",
				};
			case "processing":
				return {
					backgroundColor: colors.badgeProcessing,
					text: label || "Processing",
				};
			case "completed":
				return {
					backgroundColor: colors.badgeCompleted,
					text: label || "Completed",
				};
			case "failed":
				return {
					backgroundColor: colors.badgeFailed,
					text: label || "Failed",
				};
			default:
				return {
					backgroundColor: colors.badgePending,
					text: label || status,
				};
		}
	};

	const config = getStatusConfig();

	const badgeStyle = [
		styles.container,
		styles[size],
		{ backgroundColor: config.backgroundColor },
		style,
	];

	const textStyle = [
		styles.text,
		styles[`${size}Text` as keyof typeof styles],
		{ color: colors.textOnAccent },
	];

	return (
		<View style={badgeStyle} testID={testID}>
			<Text style={textStyle} numberOfLines={1}>
				{config.text}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: BorderRadius.full,
		paddingHorizontal: Spacing.sm + Spacing.xs,
		paddingVertical: Spacing.xs,
		alignSelf: "flex-start",
	},
	small: {
		paddingHorizontal: Spacing.sm,
		paddingVertical: Spacing.xs / 2,
	},
	medium: {
		paddingHorizontal: Spacing.sm + Spacing.xs,
		paddingVertical: Spacing.xs,
	},
	text: {
		fontWeight: Typography.fontWeight.semibold,
		textAlign: "center",
	},
	smallText: {
		fontSize: Typography.fontSize.xs,
	},
	mediumText: {
		fontSize: Typography.fontSize.sm,
	},
});
