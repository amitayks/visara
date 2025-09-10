import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: theme.background,
		},
		header: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: 16,
			paddingVertical: 12,
			// borderBottomWidth: 1,
			// borderBottomColor: theme.borderLight,
		},
		backButton: {
			padding: 8,
			marginLeft: -8,
		},
		headerTitle: {
			flex: 1,
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			textAlign: "center",
			marginRight: 40, // Compensate for back button width
		},
		headerSpacer: {
			width: 40, // Same as back button width for centering
		},
		content: {
			flex: 1,
		},
	});
