import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		emptyListContainer: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			paddingHorizontal: 20,
			minHeight: 700,
		},
		cardContainer: {
			paddingVertical: 4,
			flex: 1,
			alignItems: "center",
		},
		loadingFooter: {
			paddingVertical: 20,
			alignItems: "center",
			justifyContent: "center",
		},
	});
