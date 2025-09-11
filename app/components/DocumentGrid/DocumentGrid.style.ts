import { StyleSheet } from "react-native";
import { SPACING } from "./documentGridConst";

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
			padding: 8,
			alignItems: "center",

			justifyContent: "center",
		},
		loadingFooter: {
			paddingVertical: 20,
			alignItems: "center",
			justifyContent: "center",
		},
	});
