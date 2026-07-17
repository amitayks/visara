/**
 * IconButton primitive — a bare glyph button with a REQUIRED accessibility
 * label and a >=44pt touch target via hitSlop.
 */
import { spacing, type ThemeColors } from "@ui/theme";
import { Icon, iconSizes } from "./Icon";
import { PressableScale } from "./PressableScale";

export interface IconButtonProps {
	/** Material Design Icons glyph name. */
	icon: string;
	onPress: () => void;
	size?: number;
	color?: keyof ThemeColors | string;
	accessibilityLabel: string;
	disabled?: boolean;
	testID?: string;
}

export function IconButton({
	icon,
	onPress,
	size = iconSizes.md,
	color = "textPrimary",
	accessibilityLabel,
	disabled = false,
	testID,
}: IconButtonProps) {
	return (
		<PressableScale
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			hitSlop={spacing.sm}
			testID={testID}
		>
			<Icon name={icon} size={size} color={color} />
		</PressableScale>
	);
}
