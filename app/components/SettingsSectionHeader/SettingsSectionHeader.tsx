import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../contexts/ThemeContext";

interface SettingsSectionHeaderProps {
	title: string;
	subtitle?: string;
}

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
	title,
	subtitle,
}) => {
	const { theme } = useTheme();

	return (
		<View style={styles.container}>
			<Text style={[styles.title, { color: theme.text }]}>{title}</Text>
			{subtitle && (
				<Text style={[styles.subtitle, { color: theme.textSecondary }]}>
					{subtitle}
				</Text>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 20,
		paddingTop: 32,
		paddingBottom: 8,
	},
	title: {
		fontSize: 22,
		fontWeight: "600",
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
		lineHeight: 22,
	},
});
