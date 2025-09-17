import React from "react";
import { Text, TouchableOpacity, ViewStyle } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./ActionButton.style";

interface ActionButtonProps {
	icon: string;
	onPress: () => void;
	color?: string;
	style?: ViewStyle;
	disabled?: boolean;
	variant?: "default" | "destructive";
	children?: React.ReactNode;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
	icon,
	onPress,
	color,
	style,
	disabled = false,
	variant = "default",
	children,
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);

	// Determine colors based on variant and theme
	const getButtonColor = () => {
		if (color) return color;
		if (variant === "destructive") return theme.error;
		return theme.primary;
	};

	const buttonColor = getButtonColor();
	const backgroundColor = disabled ? `${buttonColor}30` : `${buttonColor}15`;
	const iconColor = disabled ? `${buttonColor}60` : buttonColor;

	return (
		<TouchableOpacity
			style={[
				styles.actionButton,
				{ backgroundColor },
				style,
				disabled && styles.disabled,
			]}
			onPress={onPress}
			activeOpacity={disabled ? 1 : 0.7}
			disabled={disabled}
		>
			<Icon name={icon} size={24} color={iconColor} />
			{children}
		</TouchableOpacity>
	);
};
