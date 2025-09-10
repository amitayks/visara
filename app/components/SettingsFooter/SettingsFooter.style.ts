import { StyleSheet } from "react-native";

export const createStyles = (theme: any) => {
	return StyleSheet.create({
		footer: {
			borderTopWidth: 1,
		},
		versionSection: {
			alignItems: "center",
			paddingHorizontal: 20,
			paddingVertical: 24,
		},
		appName: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 4,
		},
		version: {
			fontSize: 16,
			color: theme.textSecondary,
			marginBottom: 2,
		},
		buildInfo: {
			fontSize: 14,
			color: theme.textTertiary,
			marginBottom: 16,
		},
		infoRow: {
			flexDirection: "row",
			gap: 24,
			marginBottom: 16,
		},
		infoItem: {
			flexDirection: "row",
			alignItems: "center",
			gap: 6,
		},
		infoText: {
			fontSize: 13,
			color: theme.textSecondary,
			fontWeight: "500",
		},
		copyright: {
			fontSize: 12,
			color: theme.textTertiary,
			textAlign: "center",
		},
	});
};
