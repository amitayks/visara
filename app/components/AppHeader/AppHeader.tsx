import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { createStyles } from "./AppHeader.style";

interface AppHeaderProps {
	onScanPress: () => void;
	onSettingsPress: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
	onScanPress,
	onSettingsPress,
}) => {
	const { theme } = useTheme();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	return (
		<View style={styles.container}>
			<TouchableOpacity
				style={styles.iconButton}
				onPress={onScanPress}
				activeOpacity={0.7}
			>
				<Icon name="scan-outline" size={24} color={iconColors.primary} />
			</TouchableOpacity>

			<View style={styles.logo}>
				<Text style={styles.logoText}>Visara</Text>
			</View>

			<TouchableOpacity
				style={styles.iconButton}
				onPress={onSettingsPress}
				activeOpacity={0.7}
			>
				<Icon name="settings-outline" size={24} color={iconColors.primary} />
			</TouchableOpacity>
		</View>
	);
};
