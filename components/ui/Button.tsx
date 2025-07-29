import type React from "react";
import {
	ActivityIndicator,
	StyleSheet,
	Text,
	TouchableOpacity,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

interface ButtonProps {
	title: string;
	onPress: () => void;
	variant?: "primary" | "secondary" | "outline";
	size?: "small" | "medium" | "large";
	disabled?: boolean;
	loading?: boolean;
	icon?: string;
	iconPosition?: "left" | "right";
	fullWidth?: boolean;
	style?: any;
}

export const Button: React.FC<ButtonProps> = ({
	title,
	onPress,
	variant = "primary",
	size = "medium",
	disabled = false,
	loading = false,
	icon,
	iconPosition = "left",
	fullWidth = false,
	style,
}) => {
	const buttonStyle = [
		styles.button,
		styles[variant],
		styles[size],
		fullWidth && styles.fullWidth,
		disabled && styles.disabled,
		style,
	];

	const textStyle = [
		styles.text,
		styles[`${variant}Text`],
		styles[`${size}Text`],
		disabled && styles.disabledText,
	];

	const iconSize = size === "small" ? 16 : size === "large" ? 24 : 20;
	const iconColor = variant === "primary" ? "#FFFFFF" : "#0066FF";

	return (
		<TouchableOpacity
			style={buttonStyle}
			onPress={onPress}
			disabled={disabled || loading}
			activeOpacity={0.8}
		>
			{loading ? (
				<ActivityIndicator color={iconColor} size="small" />
			) : (
				<>
					{icon && iconPosition === "left" && (
						<Icon
							name={icon as any}
							size={iconSize}
							color={iconColor}
							style={styles.iconLeft}
						/>
					)}
					<Text style={textStyle}>{title}</Text>
					{icon && iconPosition === "right" && (
						<Icon
							name={icon as any}
							size={iconSize}
							color={iconColor}
							style={styles.iconRight}
						/>
					)}
				</>
			)}
		</TouchableOpacity>
	);
};

const styles = StyleSheet.create({
	button: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 8,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},

	// Variants
	primary: {
		backgroundColor: "#0066FF",
	},
	secondary: {
		backgroundColor: "#F2F2F7",
	},
	outline: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#0066FF",
	},

	// Sizes
	small: {
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	medium: {
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	large: {
		paddingHorizontal: 20,
		paddingVertical: 16,
	},

	// States
	disabled: {
		opacity: 0.5,
	},

	// Layout
	fullWidth: {
		width: "100%",
	},

	// Text styles
	text: {
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
	},
	primaryText: {
		color: "#FFFFFF",
	},
	secondaryText: {
		color: "#0066FF",
	},
	outlineText: {
		color: "#0066FF",
	},

	// Text sizes
	smallText: {
		fontSize: 14,
	},
	mediumText: {
		fontSize: 16,
	},
	largeText: {
		fontSize: 18,
	},

	disabledText: {
		color: "#999999",
	},

	// Icon styles
	iconLeft: {
		marginRight: 8,
	},
	iconRight: {
		marginLeft: 8,
	},
});
