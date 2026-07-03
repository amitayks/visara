import { useTheme } from "@theme/useTheme";
import { Icon as PaperIcon } from "react-native-paper";

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
		<PaperIcon
			source={name}
			size={iconSize}
			color={iconColor}
			testID={testID}
		/>
	);
}
