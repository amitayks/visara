/**
 * ProgressBar primitive — driven ENTIRELY by a Reanimated SharedValue:
 * high-frequency pipeline progress animates via a GPU scaleX transform with
 * zero React re-renders of the bar or its parents (ui-design-system spec).
 */

import { StyleSheet } from "@ui/theme";
import { View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";

export interface ProgressBarProps {
	/** Progress 0..1 (values outside the range are clamped on the UI thread). */
	progress: SharedValue<number>;
	height?: number;
	testID?: string;
}

export function ProgressBar({ progress, height, testID }: ProgressBarProps) {
	const fillStyle = useAnimatedStyle(() => ({
		transform: [{ scaleX: Math.min(1, Math.max(0, progress.value)) }],
	}));

	return (
		<View
			style={styles.track(height)}
			accessibilityRole="progressbar"
			testID={testID}
		>
			<Animated.View
				style={[styles.fill, fillStyle]}
				testID={testID ? `${testID}-fill` : undefined}
			/>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	track: (height: number | undefined) => ({
		height: height ?? theme.spacing.xxs,
		width: "100%" as const,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.accentMuted,
		overflow: "hidden" as const,
	}),
	fill: {
		width: "100%",
		height: "100%",
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.accent,
		transformOrigin: "left",
	},
}));
