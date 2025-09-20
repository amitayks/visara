import { StyleSheet } from "react-native";

export const createStyles = (theme: any) => {
	return StyleSheet.create({
		versionSection: {
			alignItems: "center",
			paddingHorizontal: 20,
		},
		buildInfo: {
			fontSize: 14,
			color: theme.text,
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
			color: theme.text,
			fontWeight: "500",
		},
		copyright: {
			fontSize: 12,
			color: theme.textTertiary,
			textAlign: "center",
		},
	});
};
