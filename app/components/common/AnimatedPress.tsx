import React, { ReactNode } from "react";
import { Pressable, PressableProps, ViewStyle } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

interface AnimatedPressProps extends PressableProps {
	children: ReactNode;
	style?: ViewStyle | ViewStyle[];
	scaleValue?: number;
	opacityValue?: number;
	duration?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// not used at the app //
export const AnimatedPress: React.FC<AnimatedPressProps> = ({
	children,
	style,
	scaleValue = 0.95,
	opacityValue = 0.8,
	duration = 100,
	onPressIn,
	onPressOut,
	...props
}) => {
	const scale = useSharedValue(1);
	const opacity = useSharedValue(1);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}));

	const handlePressIn = (e: any) => {
		scale.value = withTiming(scaleValue, { duration });
		opacity.value = withTiming(opacityValue, { duration: duration / 2 });
		onPressIn?.(e);
	};

	const handlePressOut = (e: any) => {
		scale.value = withSpring(1, {
			damping: 15,
			stiffness: 400,
		});
		opacity.value = withTiming(1, { duration: duration / 2 });
		onPressOut?.(e);
	};

	return (
		<AnimatedPressable
			style={[style, animatedStyle]}
			onPressIn={handlePressIn}
			onPressOut={handlePressOut}
			{...props}
		>
			{children}
		</AnimatedPressable>
	);
};

interface BounceButtonProps extends PressableProps {
	children: ReactNode;
	style?: ViewStyle | ViewStyle[];
	bounceValue?: number;
}

export const BounceButton: React.FC<BounceButtonProps> = ({
	children,
	style,
	bounceValue = 1.1,
	onPress,
	...props
}) => {
	const scale = useSharedValue(1);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const handlePress = (e: any) => {
		scale.value = withSpring(bounceValue, {
			damping: 8,
			stiffness: 300,
		});

		setTimeout(() => {
			scale.value = withSpring(1, {
				damping: 8,
				stiffness: 300,
			});
		}, 150);

		onPress?.(e);
	};

	return (
		<AnimatedPressable
			style={[style, animatedStyle]}
			onPress={handlePress}
			{...props}
		>
			{children}
		</AnimatedPressable>
	);
};

interface RippleButtonProps extends PressableProps {
	children: ReactNode;
	style?: ViewStyle | ViewStyle[];
	rippleColor?: string;
}

export const RippleButton: React.FC<RippleButtonProps> = ({
	children,
	style,
	rippleColor = "rgba(99, 102, 241, 0.2)",
	onPressIn,
	...props
}) => {
	const rippleScale = useSharedValue(0);
	const rippleOpacity = useSharedValue(0);

	const rippleStyle = useAnimatedStyle(() => ({
		position: "absolute" as const,
		top: "50%",
		left: "50%",
		width: 100,
		height: 100,
		borderRadius: 50,
		backgroundColor: rippleColor,
		transform: [
			{ translateX: -50 },
			{ translateY: -50 },
			{ scale: rippleScale.value },
		],
		opacity: rippleOpacity.value,
	}));

	const handlePressIn = (e: any) => {
		rippleScale.value = 0;
		rippleOpacity.value = 1;
		rippleScale.value = withTiming(3, { duration: 400 });
		rippleOpacity.value = withTiming(0, { duration: 400 });
		onPressIn?.(e);
	};

	return (
		<Pressable style={style} onPressIn={handlePressIn} {...props}>
			<Animated.View style={rippleStyle} pointerEvents="none" />
			{children}
		</Pressable>
	);
};
