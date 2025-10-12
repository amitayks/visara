import {
	BorderRadius,
	Spacing,
	SpringConfigs,
	Typography,
} from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import React from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

export type ButtonVariant = "primary" | "secondary" | "text" | "icon" | "ghost";
export type ButtonSize = "small" | "medium" | "large";

interface ButtonProps {
	onPress: () => void;
	children?: React.ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
	disabled?: boolean;
	icon?: React.ReactNode;
	style?: ViewStyle;
	fullWidth?: boolean;
	testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
	onPress,
	children,
	variant = "primary",
	size = "medium",
	disabled = false,
	icon,
	style,
	fullWidth = false,
	testID,
}: ButtonProps) {
	const { colors } = useTheme();
	const scale = useSharedValue(1);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const handlePressIn = () => {
		scale.value = withSpring(0.95, SpringConfigs.snappy);
	};

	const handlePressOut = () => {
		scale.value = withSpring(1, SpringConfigs.snappy);
	};

	// Dynamic styles based on theme
	const getBackgroundColor = () => {
		if (disabled) return colors.buttonDisabled;
		switch (variant) {
			case "primary":
				return colors.buttonPrimary;
			case "secondary":
				return colors.buttonSecondary;
			case "text":
			case "icon":
			case "ghost":
				return "transparent";
			default:
				return colors.buttonPrimary;
		}
	};

	const getTextColor = () => {
		if (disabled) return colors.buttonDisabledText;
		switch (variant) {
			case "primary":
				return colors.buttonPrimaryText;
			case "secondary":
				return colors.buttonSecondaryText;
			case "text":
				return colors.accent;
			case "icon":
				return colors.text;
			case "ghost":
				return colors.textSecondary;
			default:
				return colors.buttonPrimaryText;
		}
	};

	const getBorderStyle = () => {
		if (variant === "secondary" && !disabled) {
			return {
				borderWidth: 1,
				borderColor: colors.border,
			};
		}
		return {};
	};

	const buttonStyle = [
		styles.base,
		styles[size],
		{
			backgroundColor: getBackgroundColor(),
			...getBorderStyle(),
		},
		fullWidth && styles.fullWidth,
		variant === "icon" && styles.iconButton,
		style,
	];

	const textStyle = [
		styles.text,
		styles[`${size}Text` as keyof typeof styles],
		{ color: getTextColor() },
	];

	return (
		<AnimatedPressable
			onPress={disabled ? undefined : onPress}
			onPressIn={handlePressIn}
			onPressOut={handlePressOut}
			style={[animatedStyle, buttonStyle]}
			disabled={disabled}
			testID={testID}
		>
			{icon && (
				<Animated.View style={styles.iconContainer}>{icon}</Animated.View>
			)}
			{children && (
				<Text style={textStyle} numberOfLines={1}>
					{children}
				</Text>
			)}
		</AnimatedPressable>
	);
}

const styles = StyleSheet.create({
	base: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: BorderRadius.md,
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm + Spacing.xs,
	},
	small: {
		paddingHorizontal: Spacing.sm + Spacing.xs,
		paddingVertical: Spacing.sm,
	},
	medium: {
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm + Spacing.xs,
	},
	large: {
		paddingHorizontal: Spacing.lg - Spacing.xs,
		paddingVertical: Spacing.md,
	},
	iconButton: {
		paddingHorizontal: Spacing.sm,
		paddingVertical: Spacing.sm,
		borderRadius: BorderRadius.full,
	},
	fullWidth: {
		width: "100%",
	},
	iconContainer: {
		marginRight: Spacing.sm,
	},
	text: {
		fontWeight: Typography.fontWeight.semibold,
	},
	smallText: {
		fontSize: Typography.fontSize.sm,
	},
	mediumText: {
		fontSize: Typography.fontSize.md,
	},
	largeText: {
		fontSize: Typography.fontSize.lg,
	},
});
