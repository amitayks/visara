import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useThemedStyles } from "../../../contexts/ThemeContext";
import type { RootStackParamList } from "../../../types/navigation";
import { useIconColors } from "../../../utils/iconColors";
import { createStyles } from "./AppHeader.style";

type NavigationProp = StackNavigationProp<RootStackParamList>;

interface AppHeaderProps {
	setShowUploadModal: (show: boolean) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ setShowUploadModal }) => {
	const navigation = useNavigation<NavigationProp>();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	const handleManualUpload = useCallback(() => {
		setShowUploadModal(true);
	}, []);

	const handleSettingsPress = useCallback(() => {
		navigation.navigate("Settings");
	}, [navigation]);

	return (
		<View style={styles.container}>
			<TouchableOpacity
				style={styles.iconButton}
				onPress={handleManualUpload}
				activeOpacity={0.7}
			>
				<Icon name="add-outline" size={24} color={iconColors.primary} />
			</TouchableOpacity>

			<View style={styles.logo}>
				<Text style={styles.logoText}>Visara</Text>
			</View>

			<TouchableOpacity
				style={styles.iconButton}
				onPress={handleSettingsPress}
				activeOpacity={0.7}
			>
				<Icon name="settings-outline" size={24} color={iconColors.primary} />
			</TouchableOpacity>
		</View>
	);
};
