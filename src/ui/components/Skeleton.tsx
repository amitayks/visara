/**
 * Skeleton primitive — pulsing placeholder block driven by motion tokens.
 */

import { motion, StyleSheet } from "@ui/theme";
import { useEffect } from "react";
import type { DimensionValue } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

export interface SkeletonProps {
	width?: DimensionValue;
	height?: DimensionValue;
	radius?: number;
}

export function Skeleton({ width, height, radius }: SkeletonProps) {
	const pulse = useSharedValue(0);

	useEffect(() => {
		pulse.value = withRepeat(
			withTiming(1, {
				duration: motion.duration.slow * 2,
				easing: Easing.inOut(Easing.quad),
			}),
			-1,
			true,
		);
		return () => {
			cancelAnimation(pulse);
		};
	}, [pulse]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(pulse.value, [0, 1], [0.45, 1]),
	}));

	return (
		<Animated.View
			style={[styles.block(width, height, radius), animatedStyle]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		/>
	);
}

const styles = StyleSheet.create((theme) => ({
	block: (
		width: DimensionValue | undefined,
		height: DimensionValue | undefined,
		radius: number | undefined,
	) => ({
		width: width ?? ("100%" as const),
		height: height ?? theme.spacing.lg,
		borderRadius: radius ?? theme.radii.sm,
		backgroundColor: theme.colors.thumbnailPlaceholder,
	}),
}));
