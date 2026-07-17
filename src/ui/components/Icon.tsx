/**
 * Icon primitive — renders directly from
 * @react-native-vector-icons/material-design-icons (ui-design-system spec).
 * Color/size are driven through a unistyles style entry (the icon package
 * applies the user style AFTER its own {fontSize, color} defaults), so token
 * colors restyle on theme flips without re-rendering.
 */
import MDIcon from "@react-native-vector-icons/material-design-icons";
import { StyleSheet, type ThemeColors } from "@ui/theme";
import type { ComponentProps } from "react";

type MDIconName = ComponentProps<typeof MDIcon>["name"];

/** Named token sizes for icons (ui-design-system spec). */
export const iconSizes = {
	sm: 16,
	md: 24,
	lg: 32,
	xl: 48,
} as const;

export interface IconProps {
	name: string;
	size?: number;
	/** Semantic color token (preferred) or a concrete color string. */
	color?: keyof ThemeColors | string;
	testID?: string;
}

export function Icon({
	name,
	size = iconSizes.md,
	color = "textPrimary",
	testID,
}: IconProps) {
	return (
		<MDIcon
			name={name as MDIconName}
			style={styles.glyph(color, size)}
			accessible={false}
			importantForAccessibility="no"
			testID={testID}
		/>
	);
}

function resolveColor(
	colors: ThemeColors,
	color: keyof ThemeColors | string,
): string {
	return color in colors ? colors[color as keyof ThemeColors] : color;
}

const styles = StyleSheet.create((theme) => ({
	glyph: (color: keyof ThemeColors | string, size: number) => ({
		color: resolveColor(theme.colors, color),
		fontSize: size,
	}),
}));
