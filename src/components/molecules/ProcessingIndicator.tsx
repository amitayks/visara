import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

interface ProcessingIndicatorProps {
	current?: number;
	total?: number;
	message?: string;
	size?: "small" | "large";
	style?: ViewStyle;
	testID?: string;
}

export function ProcessingIndicator({
	current,
	total,
	message,
	size = "large",
	style,
	testID,
}: ProcessingIndicatorProps) {
	const { colors } = useTheme();
	const rotation = useSharedValue(0);

	useEffect(() => {
		rotation.value = withRepeat(
			withTiming(360, {
				duration: 1000,
				easing: Easing.linear,
			}),
			-1,
		);
	}, [rotation]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value}deg` }],
	}));

	const showProgress = current !== undefined && total !== undefined;
	const percentage = showProgress ? Math.round((current / total) * 100) : 0;

	return (
		<View style={[styles.container, style]} testID={testID}>
			{/* Circular Progress */}
			<Animated.View style={animatedStyle}>
				<ActivityIndicator
					size={size}
					color={colors.processing}
				/>
			</Animated.View>

			{/* Progress Text */}
			{showProgress && (
				<Text
					style={[
						styles.progressText,
						{
							color: colors.text,
						},
					]}
				>
					{current} / {total} ({percentage}%)
				</Text>
			)}

			{/* Message */}
			{message && (
				<Text
					style={[
						styles.message,
						{
							color: colors.textSecondary,
						},
					]}
					numberOfLines={2}
				>
					{message}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		justifyContent: "center",
		gap: Spacing.sm,
	},
	progressText: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	message: {
		fontSize: Typography.fontSize.sm,
		textAlign: "center",
	},
});
