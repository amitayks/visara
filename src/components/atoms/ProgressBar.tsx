import { BorderRadius, SpringConfigs } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

interface ProgressBarProps {
	progress: number; // 0 to 1
	height?: number;
	showBackground?: boolean;
	style?: ViewStyle;
	testID?: string;
}

export function ProgressBar({
	progress,
	height = 4,
	showBackground = true,
	style,
	testID,
}: ProgressBarProps) {
	const { colors } = useTheme();
	const animatedProgress = useSharedValue(0);

	useEffect(() => {
		// Clamp progress between 0 and 1
		const clampedProgress = Math.max(0, Math.min(1, progress));
		animatedProgress.value = withSpring(clampedProgress, SpringConfigs.gentle);
	}, [progress, animatedProgress]);

	const progressBarStyle = useAnimatedStyle(() => ({
		width: `${animatedProgress.value * 100}%`,
	}));

	const containerStyle = [
		styles.container,
		{
			height,
			backgroundColor: showBackground
				? colors.progressBarBackground
				: "transparent",
		},
		style,
	];

	return (
		<View style={containerStyle} testID={testID}>
			<Animated.View
				style={[
					styles.progressFill,
					{
						height,
						backgroundColor: colors.progressBar,
					},
					progressBarStyle,
				]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		borderRadius: BorderRadius.full,
		overflow: "hidden",
	},
	progressFill: {
		borderRadius: BorderRadius.full,
	},
});
