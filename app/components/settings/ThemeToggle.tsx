import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme } from "../../../contexts/ThemeContext";
import { useSettingsStore } from "../../../stores/settingsStore";

export const ThemeToggle: React.FC = () => {
	const { theme, isDark, toggleTheme } = useTheme();
	const { settings } = useSettingsStore();

	return (
		<View style={[styles.container, { backgroundColor: theme.surface }]}>
			<TouchableOpacity
				style={styles.row}
				onPress={toggleTheme}
				activeOpacity={0.7}
			>
				<View style={styles.leftContent}>
					<View
						style={[
							styles.iconContainer,
							{ backgroundColor: theme.accent + "20" },
						]}
					>
						<Icon
							name={isDark ? "moon" : "sunny"}
							size={20}
							color={theme.accent}
						/>
					</View>
					<View style={styles.textContainer}>
						<Text style={[styles.title, { color: theme.text }]}>
							{isDark ? "Dark Mode" : "Light Mode"}
						</Text>
						<Text style={[styles.subtitle, { color: theme.textSecondary }]}>
							{isDark ? "Switch to light theme" : "Switch to dark theme"}
						</Text>
					</View>
				</View>

				<Switch
					value={isDark}
					onValueChange={toggleTheme}
					trackColor={{
						false: theme.borderLight,
						true: theme.accent + "40",
					}}
					thumbColor={isDark ? theme.accent : theme.surface}
					ios_backgroundColor={theme.borderLight}
				/>
			</TouchableOpacity>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		marginHorizontal: 16,
		marginTop: 20,
		borderRadius: 16,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 16,
	},
	leftContent: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	iconContainer: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	textContainer: {
		flex: 1,
	},
	title: {
		fontSize: 16,
		fontWeight: "600",
		marginBottom: 2,
	},
	subtitle: {
		fontSize: 14,
		lineHeight: 20,
	},
});
