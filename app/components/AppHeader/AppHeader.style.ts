import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			height: 56,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 16,
		},
		iconButton: {
			width: 40,
			height: 40,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: 20,
		},
		logo: {
			flex: 1,
			alignItems: "center",
		},
		logoText: {
			fontSize: 24,
			fontWeight: "600",
			color: theme.primary,
			letterSpacing: -0.5,
		},
	});
