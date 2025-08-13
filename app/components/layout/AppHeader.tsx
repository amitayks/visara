import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

interface AppHeaderProps {
	onScanPress: () => void;
	onSettingsPress: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
	onScanPress,
	onSettingsPress,
}) => {
	return (
		<View style={styles.container}>
			<TouchableOpacity
				style={styles.iconButton}
				onPress={onScanPress}
				activeOpacity={0.7}
			>
				<Icon name="scan-outline" size={24} color="#333" />
			</TouchableOpacity>

			<View style={styles.logo}>
				<Text style={styles.logoText}>Visara</Text>
			</View>

			<TouchableOpacity
				style={styles.iconButton}
				onPress={onSettingsPress}
				activeOpacity={0.7}
			>
				<Icon name="settings-outline" size={24} color="#333" />
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		backgroundColor: "#FFFFFF",
		borderBottomWidth: 1,
		borderBottomColor: "#E0E0E0",
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
		color: "#333",
		letterSpacing: -0.5,
	},
});
