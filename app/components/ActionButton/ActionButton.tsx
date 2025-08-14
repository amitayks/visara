import { Text, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./ActionButton.style";

interface ActionButtonProps {
	icon: string;
	label: string;
	onPress: () => void;
	color: string;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
	icon,
	label,
	onPress,
	color,
}) => {
	const styles = useThemedStyles(createStyles);

	return (
		<TouchableOpacity
			style={[styles.actionButton, { backgroundColor: `${color}15` }]}
			onPress={onPress}
			activeOpacity={0.7}
		>
			<Icon name={icon} size={24} color={color} />
			<Text style={[styles.actionLabel, { color }]}>{label}</Text>
		</TouchableOpacity>
	);
};
