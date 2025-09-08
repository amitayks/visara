import React from "react";
import { Text, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./FloatingActionButton.style";

interface FloatingActionButtonProps {
	onPress: () => void;
	icon: string;
	title: string;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
	onPress,
	icon,
	title,
}) => {
	const { theme, isDark } = useTheme();

	const styles = useThemedStyles(createStyles);

	return (
		<TouchableOpacity
			style={styles.container}
			onPress={onPress}
			activeOpacity={0.8}
		>
			<Icon name={icon} size={24} color={styles.text.color} />
			<Text style={styles.text}>{title}</Text>
		</TouchableOpacity>
	);
};
