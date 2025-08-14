import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		emptyContainer: {
			flex: 1,
			alignItems: "center",
			justifyContent: "center",
			padding: 32,
		},
		emptyTitle: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			marginTop: 24,
		},
		emptyMessage: {
			fontSize: 14,
			color: theme.textSecondary,
			marginTop: 8,
			textAlign: "center",
			lineHeight: 20,
		},
		emptyAction: {
			marginTop: 24,
			paddingHorizontal: 24,
			paddingVertical: 12,
			backgroundColor: theme.accent,
			borderRadius: 24,
		},
		emptyActionText: {
			fontSize: 16,
			fontWeight: "600",
			color: "#FFFFFF",
		},
	});
