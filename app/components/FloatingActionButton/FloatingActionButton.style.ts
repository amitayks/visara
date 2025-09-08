import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			// position: "absolute",
			bottom: "20%",
			alignSelf: "center",
			backgroundColor: theme.background,
			paddingHorizontal: 20,
			height: 50,
			borderRadius: 20, // Squircle shape
			flexDirection: "row",
			justifyContent: "center",
			alignItems: "center",
			elevation: 8, // for Android shadow
			shadowColor: theme.shadowColor,
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: 0.3,
			shadowRadius: 4,
		},
		text: {
			color: theme.text,
			fontSize: 16,
			fontWeight: "bold",
			marginLeft: 10,
		},
	});
