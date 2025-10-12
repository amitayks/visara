import { Platform } from "react-native";
import type { StackNavigationOptions } from "@react-navigation/stack";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

/**
 * Platform-specific navigation configurations
 * iOS: Tab bar navigation with swipe-to-go-back
 * Android: Bottom navigation with system back gesture
 */

export const stackNavigationOptions: StackNavigationOptions = {
	headerShown: false,
	gestureEnabled: true,
	...(Platform.OS === "ios" && {
		gestureDirection: "horizontal",
		// iOS-specific swipe-to-go-back
	}),
	...(Platform.OS === "android" && {
		// Android-specific system back gesture
		gestureDirection: "horizontal-inverted",
	}),
};

export const tabNavigationOptions: BottomTabNavigationOptions = {
	headerShown: false,
	...(Platform.OS === "ios" && {
		// iOS-specific tab bar styling
		tabBarStyle: {
			position: "absolute",
			bottom: 0,
			elevation: 0,
		},
	}),
	...(Platform.OS === "android" && {
		// Android-specific bottom navigation styling
		tabBarStyle: {
			position: "absolute",
			bottom: 10,
			left: 10,
			right: 10,
			borderRadius: 16,
			elevation: 8,
		},
	}),
};

/**
 * Modal presentation configurations
 */
export const modalNavigationOptions: StackNavigationOptions = {
	presentation: "modal",
	headerShown: false,
	gestureEnabled: true,
	cardOverlayEnabled: true,
	cardStyle: { backgroundColor: "transparent" },
	...(Platform.OS === "ios" && {
		// iOS modal presentation
		gestureDirection: "vertical",
	}),
	...(Platform.OS === "android" && {
		// Android modal presentation
		gestureDirection: "vertical",
	}),
};

/**
 * Get platform-appropriate navigation transition
 */
export function getPlatformTransition(): StackNavigationOptions {
	if (Platform.OS === "ios") {
		return {
			gestureDirection: "horizontal" as const,
			transitionSpec: {
				open: {
					animation: "spring" as const,
					config: {
						stiffness: 1000,
						damping: 500,
						mass: 3,
						overshootClamping: true,
						restDisplacementThreshold: 0.01,
						restSpeedThreshold: 0.01,
					},
				},
				close: {
					animation: "spring" as const,
					config: {
						stiffness: 1000,
						damping: 500,
						mass: 3,
						overshootClamping: true,
						restDisplacementThreshold: 0.01,
						restSpeedThreshold: 0.01,
					},
				},
			},
		};
	}

	return {
		gestureDirection: "horizontal" as const,
		transitionSpec: {
			open: {
				animation: "timing" as const,
				config: {
					duration: 300,
				},
			},
			close: {
				animation: "timing" as const,
				config: {
					duration: 300,
				},
			},
		},
	};
}
