import React, { useCallback, useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScanProgressBarProps {
	isVisible: boolean;
	currentCount: number;
	totalCount: number;
	onCancel?: () => void;
	scanningText?: string;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const PROGRESS_BAR_HEIGHT = 80;

// not used in the app //
export function ScanProgressBar({
	isVisible,
	currentCount,
	totalCount,
	onCancel,
	scanningText = "Scanning documents...",
}: ScanProgressBarProps) {
	// Animation values
	const translateY = useSharedValue(-PROGRESS_BAR_HEIGHT);
	const opacity = useSharedValue(0);
	const progressWidth = useSharedValue(0);
	const countOpacity = useSharedValue(0);
	const pulseScale = useSharedValue(1);

	// Calculate progress percentage
	const progressPercentage =
		totalCount > 0 ? (currentCount / totalCount) * 100 : 0;

	// Animate visibility
	useEffect(() => {
		if (isVisible) {
			// Slide in from top
			translateY.value = withSpring(0, {
				damping: 20,
				stiffness: 300,
			});
			opacity.value = withTiming(1, { duration: 300 });
			countOpacity.value = withDelay(200, withTiming(1, { duration: 300 }));
		} else {
			// Slide out to top
			translateY.value = withTiming(-PROGRESS_BAR_HEIGHT, { duration: 300 });
			opacity.value = withTiming(0, { duration: 300 });
			countOpacity.value = withTiming(0, { duration: 200 });
		}
	}, [isVisible, translateY, opacity, countOpacity]);

	// Animate progress bar
	useEffect(() => {
		progressWidth.value = withSpring(progressPercentage, {
			damping: 15,
			stiffness: 100,
		});
	}, [progressPercentage, progressWidth]);

	// Pulse animation for scanning indicator
	useEffect(() => {
		if (isVisible) {
			const pulse = () => {
				pulseScale.value = withSequence(
					withTiming(1.1, { duration: 800 }),
					withTiming(1, { duration: 800 }),
				);
			};

			pulse();
			const interval = setInterval(pulse, 1600);

			return () => clearInterval(interval);
		}
	}, [isVisible, pulseScale]);

	// Handle cancel
	const handleCancel = useCallback(() => {
		onCancel?.();
	}, [onCancel]);

	// Animated styles
	const containerStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
		opacity: opacity.value,
	}));

	const progressBarStyle = useAnimatedStyle(() => ({
		width: `${progressWidth.value}%`,
	}));

	const countStyle = useAnimatedStyle(() => ({
		opacity: countOpacity.value,
	}));

	const pulseStyle = useAnimatedStyle(() => ({
		transform: [{ scale: pulseScale.value }],
	}));

	if (!isVisible && translateY.value === -PROGRESS_BAR_HEIGHT) {
		return null;
	}

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<SafeAreaView edges={["top"]} style={styles.safeArea}>
				<View style={styles.content}>
					<Text style={styles.title}>{scanningText}</Text>
					<Animated.View style={[styles.countContainer, countStyle]}>
						<Text style={styles.countText}>
							{currentCount}/{totalCount}
						</Text>
					</Animated.View>
				</View>
			</SafeAreaView>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: 60,
		left: 16,
		right: 16,
		zIndex: 1000,
		backgroundColor: "#007AFF",
		borderRadius: 8,
		shadowColor: "#000000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	safeArea: {
		backgroundColor: "transparent",
	},
	content: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	title: {
		fontSize: 14,
		fontWeight: "500",
		color: "#FFFFFF",
	},
	cancelButton: {
		padding: 4,
		borderRadius: 12,
		backgroundColor: "rgba(0, 0, 0, 0.05)",
	},
	progressContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	progressTrack: {
		flex: 1,
		height: 6,
		backgroundColor: "#E5E5E5",
		borderRadius: 3,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		backgroundColor: "#0066FF",
		borderRadius: 3,
	},
	countContainer: {
		alignItems: "flex-end",
	},
	countText: {
		fontSize: 14,
		fontWeight: "500",
		color: "#FFFFFF",
	},
});

// Helper function to add delay
function withDelay(delay: number, animation: any) {
	"worklet";
	return withTiming(0, { duration: delay }, () => {
		"worklet";
		return animation;
	});
}
