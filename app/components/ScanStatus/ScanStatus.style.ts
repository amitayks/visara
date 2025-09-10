import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		statusContainer: {
			backgroundColor: theme.surface,
			marginHorizontal: 20,
			marginBottom: 8,
			borderRadius: 12,
			padding: 16,
		},
		statusHeader: {
			flexDirection: "row",
			alignItems: "center",
			marginBottom: 8,
		},
		statusTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginLeft: 8,
		},
		statusDescription: {
			fontSize: 14,
			color: theme.textSecondary,
			lineHeight: 20,
			marginBottom: 4,
		},
		statusDetail: {
			fontSize: 12,
			color: theme.textSecondary,
			fontStyle: "italic",
		},
	});
