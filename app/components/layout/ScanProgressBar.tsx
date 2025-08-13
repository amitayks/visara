import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";

interface ScanProgressBarProps {
	current: number;
	total: number;
	animated?: boolean;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({
	current,
	total,
	animated = true,
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	const progress = current / total;
	const animatedProgress = useSharedValue(0);
	const pulseAnimation = useSharedValue(0);

	useEffect(() => {
		animatedProgress.value = withSpring(progress, {
			damping: 20,
			stiffness: 90,
		});
	}, [progress]);

	useEffect(() => {
		if (animated) {
			pulseAnimation.value = withRepeat(
				withTiming(1, { duration: 1500 }),
				-1,
				true,
			);
		}
	}, [animated]);

	const progressStyle = useAnimatedStyle(() => ({
		width: `${animatedProgress.value * 100}%`,
	}));

	const pulseStyle = useAnimatedStyle(() => ({
		opacity: interpolate(pulseAnimation.value, [0, 1], [0.6, 1]),
	}));

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Scanning Gallery</Text>
				<Text style={styles.count}>
					{current} / {total}
				</Text>
			</View>
			<View style={styles.progressBar}>
				<Animated.View
					style={[styles.progressFill, progressStyle, animated && pulseStyle]}
				/>
			</View>
		</View>
	);
};

const createStyles = (theme: any) => StyleSheet.create({
	container: {
		backgroundColor: theme.surfaceSecondary,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: theme.border,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	title: {
		fontSize: 14,
		fontWeight: "500",
		color: theme.textSecondary,
	},
	count: {
		fontSize: 14,
		color: theme.textTertiary,
	},
	progressBar: {
		height: 4,
		backgroundColor: theme.border,
		borderRadius: 2,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		backgroundColor: theme.accent,
		borderRadius: 2,
	},
});
