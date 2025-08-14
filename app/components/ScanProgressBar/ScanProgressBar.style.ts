import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			backgroundColor: theme.background,
			paddingHorizontal: 16,
			paddingVertical: 12,
			borderBottomWidth: 1,
			// borderBottomColor: theme.border,
		},
		header: {
			flexDirection: "row",
			justifyContent: "space-between",
			marginBottom: 8,
		},
		title: {
			fontSize: 14,
			fontWeight: "500",
			color: theme.textSecondary,
		},
		count: {
			fontSize: 14,
			color: theme.textTertiary,
		},
		progressBar: {
			height: 4,
			backgroundColor: theme.border,
			borderRadius: 2,
			overflow: "hidden",
		},
		progressFill: {
			height: "100%",
			backgroundColor: theme.accent,
			borderRadius: 2,
		},
	});
