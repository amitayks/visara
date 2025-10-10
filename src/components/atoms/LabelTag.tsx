import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

interface LabelTagProps {
	label: string;
	confidence?: number;
	onPress?: () => void;
	style?: ViewStyle;
	testID?: string;
}

export function LabelTag({
	label,
	confidence,
	onPress,
	style,
	testID,
}: LabelTagProps) {
	const { colors } = useTheme();

	const isInteractive = !!onPress;

	const containerStyle = [
		styles.container,
		{
			backgroundColor: colors.surfaceSecondary,
			borderColor: colors.border,
		},
		style,
	];

	const textStyle = {
		color: colors.text,
	};

	const confidenceText = confidence
		? ` ${Math.round(confidence * 100)}%`
		: "";

	const content = (
		<>
			<Text style={[styles.labelText, textStyle]} numberOfLines={1}>
				{label}
			</Text>
			{confidence !== undefined && (
				<Text style={[styles.confidenceText, { color: colors.textSecondary }]}>
					{confidenceText}
				</Text>
			)}
		</>
	);

	if (isInteractive) {
		return (
			<Pressable style={containerStyle} onPress={onPress} testID={testID}>
				{content}
			</Pressable>
		);
	}

	return (
		<Pressable style={containerStyle} testID={testID}>
			{content}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: Spacing.sm + Spacing.xs,
		paddingVertical: Spacing.xs,
		borderRadius: BorderRadius.full,
		borderWidth: 1,
		alignSelf: "flex-start",
	},
	labelText: {
		fontSize: Typography.fontSize.sm,
		fontWeight: Typography.fontWeight.medium,
	},
	confidenceText: {
		fontSize: Typography.fontSize.xs,
		marginLeft: Spacing.xs / 2,
	},
});
