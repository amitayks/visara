/**
 * Animated progress dots for the onboarding pager: the active dot stretches
 * into an accent pill (spring-driven, color cross-fades), inactive dots rest
 * as small border-colored circles.
 */

import { motion, StyleSheet, useAppTheme } from "@ui/theme";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

function Dot({ active }: { active: boolean }) {
	const { theme } = useAppTheme();
	const progress = useSharedValue(active ? 1 : 0);

	useEffect(() => {
		progress.value = withSpring(active ? 1 : 0, motion.spring.snappy);
	}, [active, progress]);

	const inactiveColor = theme.colors.border;
	const activeColor = theme.colors.accent;
	const animatedStyle = useAnimatedStyle(() => ({
		width: 8 + 20 * progress.value,
		backgroundColor: interpolateColor(
			progress.value,
			[0, 1],
			[inactiveColor, activeColor],
		),
	}));

	return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export interface ProgressDotsProps {
	/** Stable step ids, one dot per step. */
	steps: readonly string[];
	index: number;
}

export function ProgressDots({ steps, index }: ProgressDotsProps) {
	return (
		<View
			style={styles.row}
			accessibilityRole="progressbar"
			accessibilityLabel={`Step ${index + 1} of ${steps.length}`}
		>
			{steps.map((id, dotIndex) => (
				<Dot key={id} active={dotIndex === index} />
			))}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: theme.spacing.xs,
	},
	dot: {
		height: 8,
		borderRadius: theme.radii.full,
	},
}));
