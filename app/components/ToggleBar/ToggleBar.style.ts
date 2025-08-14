import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
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
