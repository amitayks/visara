/**
 * Themed Text primitive — resolves typography + color tokens via the
 * unistyles engine (no hooks), so theme flips restyle without re-rendering.
 */

import { type AppTheme, StyleSheet, type ThemeColors } from "@ui/theme";
import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextStyle } from "react-native";

export type TextVariant = keyof AppTheme["typography"];

export interface TextProps {
	variant?: TextVariant;
	color?: keyof ThemeColors;
	children?: ReactNode;
	style?: StyleProp<TextStyle>;
	numberOfLines?: number;
	/** Pass-through for selectable content blocks (e.g. OCR text). */
	selectable?: boolean;
	testID?: string;
}

export function Text({
	variant = "body",
	color = "textPrimary",
	children,
	style,
	numberOfLines,
	selectable,
	testID,
}: TextProps) {
	return (
		<RNText
			style={[styles.text(variant, color), style]}
			numberOfLines={numberOfLines}
			selectable={selectable}
			testID={testID}
		>
			{children}
		</RNText>
	);
}

const styles = StyleSheet.create((theme) => ({
	text: (variant: TextVariant, color: keyof ThemeColors) => ({
		...theme.typography[variant],
		color: theme.colors[color],
	}),
}));
