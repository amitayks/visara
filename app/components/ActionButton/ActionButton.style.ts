import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		actionButton: {
			flex: 1,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			paddingVertical: 14,
			borderRadius: 12,
			gap: 8,
		},
		actionLabel: {
			fontSize: 16,
			fontWeight: "600",
		},
	});
