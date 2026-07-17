/**
 * Chip primitive — pill-shaped tag (label chips, filters, result counts).
 * Announces its selected state to assistive technology.
 */

import { StyleSheet } from "@ui/theme";
import { View } from "react-native";
import { Icon, iconSizes } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface ChipProps {
	label: string;
	selected?: boolean;
	onPress?: () => void;
	/** Material Design Icons glyph name. */
	icon?: string;
	testID?: string;
}

export function Chip({
	label,
	selected = false,
	onPress,
	icon,
	testID,
}: ChipProps) {
	const content = (
		<>
			{icon ? (
				<Icon
					name={icon}
					size={iconSizes.sm}
					color={selected ? "accent" : "textSecondary"}
				/>
			) : null}
			<Text
				variant="footnote"
				color={selected ? "accent" : "textPrimary"}
				numberOfLines={1}
			>
				{label}
			</Text>
		</>
	);

	if (!onPress) {
		return (
			<View
				style={styles.chip(selected)}
				accessible
				accessibilityLabel={label}
				testID={testID}
			>
				{content}
			</View>
		);
	}

	return (
		<PressableScale
			onPress={onPress}
			style={styles.chip(selected)}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ selected }}
			testID={testID}
		>
			{content}
		</PressableScale>
	);
}

const styles = StyleSheet.create((theme) => ({
	chip: (selected: boolean) => ({
		flexDirection: "row" as const,
		alignItems: "center" as const,
		alignSelf: "flex-start" as const,
		gap: theme.spacing.xs,
		paddingHorizontal: theme.spacing.md,
		paddingVertical: theme.spacing.xs,
		borderRadius: theme.radii.full,
		backgroundColor: selected
			? theme.colors.accentMuted
			: theme.colors.surfaceElevated,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: selected ? theme.colors.accent : theme.colors.border,
	}),
}));
