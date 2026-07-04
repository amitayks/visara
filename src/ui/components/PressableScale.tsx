/**
 * Pressable with scale/opacity press feedback (motion tokens, GPU props only).
 * The unistyles style prop and the reanimated animated style stay SEPARATE
 * entries in the style array (documented interop constraint).
 */

import { motion } from "@ui/theme";
import type { ReactNode } from "react";
import {
	type AccessibilityRole,
	type AccessibilityState,
	Pressable,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps {
	onPress?: () => void;
	onLongPress?: () => void;
	children?: ReactNode;
	style?: StyleProp<ViewStyle>;
	disabled?: boolean;
	accessibilityRole?: AccessibilityRole;
	accessibilityLabel?: string;
	/** Extra a11y state (e.g. {selected}) merged with the disabled flag. */
	accessibilityState?: AccessibilityState;
	hitSlop?: number;
	testID?: string;
}

export function PressableScale({
	onPress,
	onLongPress,
	children,
	style,
	disabled = false,
	accessibilityRole = "button",
	accessibilityLabel,
	accessibilityState,
	hitSlop,
	testID,
}: PressableScaleProps) {
	const pressed = useSharedValue(0);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
		opacity: interpolate(pressed.value, [0, 1], [1, 0.88]),
	}));

	return (
		<AnimatedPressable
			onPress={onPress}
			onLongPress={onLongPress}
			disabled={disabled}
			onPressIn={() => {
				pressed.value = withSpring(1, motion.spring.snappy);
			}}
			onPressOut={() => {
				pressed.value = withSpring(0, motion.spring.snappy);
			}}
			style={[style, animatedStyle]}
			accessibilityRole={accessibilityRole}
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled, ...accessibilityState }}
			hitSlop={hitSlop}
			testID={testID}
		>
			{children}
		</AnimatedPressable>
	);
}
