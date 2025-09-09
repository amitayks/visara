import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		infoRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingVertical: 12,
		},
		infoIcon: {
			marginRight: 16,
		},
		infoContent: {
			flex: 1,
		},
		infoLabel: {
			fontSize: 12,
			color: theme.textTertiary,
			marginBottom: 2,
		},
		infoValue: {
			fontSize: 16,
			color: theme.text,
			fontWeight: "500",
		},
		copyIcon: {
			marginLeft: 8,
		},
	});
