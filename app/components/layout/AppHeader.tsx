import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";

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

const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			height: 56,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 16,
			// backgroundColor: theme.surface,
			// borderBottomWidth: 1,
			// borderBottomColor: theme.border,
		},
		iconButton: {
			width: 40,
			height: 40,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: 20,
		},
		logo: {
			flex: 1,
			alignItems: "center",
		},
		logoText: {
			fontSize: 24,
			fontWeight: "600",
			color: theme.primary,
			letterSpacing: -0.5,
		},
	});
