import type React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface LoadingIndicatorProps {
	message?: string;
	size?: "small" | "large";
	color?: string;
	style?: any;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
	message,
	size = "large",
	color = "#0066FF",
	style,
}) => {
	return (
		<View style={[styles.container, style]}>
			<ActivityIndicator size={size} color={color} />
			{message && <Text style={styles.message}>{message}</Text>}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	message: {
		marginTop: 16,
		fontSize: 16,
		color: "#666666",
		textAlign: "center",
	},
});
