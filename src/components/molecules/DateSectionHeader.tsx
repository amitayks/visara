import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { memo } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

interface DateSectionHeaderProps {
	label: string;
	itemCount?: number;
	sticky?: boolean;
	style?: ViewStyle;
	testID?: string;
}

/**
 * DateSectionHeader - Rendered for each date section (~100-200 instances)
 * Optimized with React.memo - static content doesn't need re-renders
 */
export const DateSectionHeader = memo(function DateSectionHeader({
	label,
	itemCount,
	style,
	testID,
}: DateSectionHeaderProps) {
	const { colors } = useTheme();

	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: colors.background,
				},
				style,
			]}
			testID={testID}
		>
			<Text
				style={[
					styles.label,
					{
						color: colors.text,
					},
				]}
			>
				{label}
			</Text>
			{itemCount !== undefined && (
				<Text
					style={[
						styles.count,
						{
							color: colors.textSecondary,
						},
					]}
				>
					{itemCount}
				</Text>
			)}
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm,
	},
	label: {
		fontSize: Typography.fontSize.lg,
		fontWeight: Typography.fontWeight.bold,
	},
	count: {
		fontSize: Typography.fontSize.sm,
		fontWeight: Typography.fontWeight.medium,
	},
});
