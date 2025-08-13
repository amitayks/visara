import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

interface ToastProps {
	visible: boolean;
	message: string;
	duration?: number;
	onHide?: () => void;
}

export function Toast({
	visible,
	message,
	duration = 2000,
	onHide,
}: ToastProps) {
	const opacity = useSharedValue(0);
	const translateY = useSharedValue(50);

	useEffect(() => {
		if (visible) {
			// Show animation
			opacity.value = withTiming(1, { duration: 300 });
			translateY.value = withSpring(0, { damping: 15, stiffness: 300 });

			// Auto hide after duration
			const timer = setTimeout(() => {
				// Hide animation
				opacity.value = withTiming(0, { duration: 300 });
				translateY.value = withTiming(50, { duration: 300 }, () => {
					if (onHide) {
						runOnJS(onHide)();
					}
				});
			}, duration);

			return () => clearTimeout(timer);
		} else {
			// Hide immediately
			opacity.value = withTiming(0, { duration: 300 });
			translateY.value = withTiming(50, { duration: 300 });
		}
	}, [visible, duration, onHide, opacity, translateY]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateY: translateY.value }],
	}));

	if (!visible && opacity.value === 0) {
		return null;
	}

	return (
		<Animated.View style={[styles.container, animatedStyle]}>
			<View style={styles.toast}>
				<Text style={styles.message}>{message}</Text>
			</View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: "50%",
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 9999,
	},
	toast: {
		backgroundColor: "#FFFFFF",
		paddingHorizontal: 24,
		paddingVertical: 16,
		borderRadius: 8,
		shadowColor: "#000000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		maxWidth: "80%",
	},
	message: {
		fontSize: 16,
		color: "#333333",
		textAlign: "center",
	},
});
