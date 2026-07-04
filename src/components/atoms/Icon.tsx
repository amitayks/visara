import MDIcon from "@react-native-vector-icons/material-design-icons";
import { useTheme } from "@theme/useTheme";

export type IconSize = "small" | "medium" | "large";

interface IconProps {
	name: string;
	size?: IconSize | number;
	color?: string;
	testID?: string;
}

const sizeMap: Record<IconSize, number> = {
	small: 16,
	medium: 24,
	large: 32,
};

export function Icon({ name, size = "medium", color, testID }: IconProps) {
	const { colors } = useTheme();

	const iconSize = typeof size === "number" ? size : sizeMap[size];
	const iconColor = color || colors.text;

	return (
		// biome-ignore lint/suspicious/noExplicitAny: legacy shim until cutover; glyph names are validated MDI names
		<MDIcon
			name={name as any}
			size={iconSize}
			color={iconColor}
			testID={testID}
		/>
	);
}
