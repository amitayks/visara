/**
 * Button primitive — token-themed variants, optional leading icon, loading
 * spinner. Variant colors resolve inside the unistyles engine; the spinner
 * needs a concrete color value, hence the owned useAppTheme() wrapper.
 */

import { StyleSheet, type ThemeColors, useAppTheme } from "@ui/theme";
import { ActivityIndicator } from "react-native";
import { Icon, iconSizes } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps {
	title: string;
	onPress: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	loading?: boolean;
	/** Material Design Icons glyph name. */
	icon?: string;
	testID?: string;
}

const CONTENT_COLOR: Record<ButtonVariant, keyof ThemeColors> = {
	primary: "textOnAccent",
	secondary: "textPrimary",
	ghost: "accent",
	destructive: "textOnAccent",
};

export function Button({
	title,
	onPress,
	variant = "primary",
	disabled = false,
	loading = false,
	icon,
	testID,
}: ButtonProps) {
	const { theme } = useAppTheme();
	const contentColor = CONTENT_COLOR[variant];
	const isDisabled = disabled || loading;

	return (
		<PressableScale
			onPress={onPress}
			disabled={isDisabled}
			accessibilityRole="button"
			accessibilityLabel={title}
			accessibilityState={{ busy: loading }}
			style={[styles.base(variant), isDisabled && styles.disabled]}
			testID={testID}
		>
			{loading ? (
				<ActivityIndicator size="small" color={theme.colors[contentColor]} />
			) : icon ? (
				<Icon name={icon} size={iconSizes.sm} color={contentColor} />
			) : null}
			<Text variant="headline" color={contentColor} numberOfLines={1}>
				{title}
			</Text>
		</PressableScale>
	);
}

const styles = StyleSheet.create((theme) => ({
	base: (variant: ButtonVariant) => ({
		flexDirection: "row" as const,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		gap: theme.spacing.sm,
		paddingHorizontal: theme.spacing.xl,
		paddingVertical: theme.spacing.md,
		borderRadius: theme.radii.md,
		backgroundColor:
			variant === "primary"
				? theme.colors.accent
				: variant === "destructive"
					? theme.colors.danger
					: variant === "secondary"
						? theme.colors.surfaceElevated
						: "transparent",
		borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
		borderColor: theme.colors.border,
	}),
	disabled: {
		opacity: 0.4,
	},
}));
