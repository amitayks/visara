import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./LegalButtons.style";

interface LegalButtonData {
	title: string;
	subtitle: string;
	icon: string;
	onPress: () => void;
}

interface LegalButtonsProps {
	buttons: LegalButtonData[];
}

export const LegalButtons: React.FC<LegalButtonsProps> = ({ buttons }) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);

	const renderButton = (button: LegalButtonData, index: number) => (
		<TouchableOpacity
			key={index}
			style={styles.legalButton}
			onPress={button.onPress}
			activeOpacity={0.7}
		>
			<View style={styles.iconContainer}>
				<Icon name={button.icon} size={20} color={theme.primary} />
			</View>
			<View style={styles.textContainer}>
				<Text style={styles.buttonTitle} numberOfLines={1}>
					{button.title}
				</Text>
				<Text style={styles.buttonSubtitle} numberOfLines={2}>
					{button.subtitle}
				</Text>
			</View>
		</TouchableOpacity>
	);

	return (
		<View style={styles.container}>
			{buttons.map((button, index) => renderButton(button, index))}
		</View>
	);
};

export type { LegalButtonData };
