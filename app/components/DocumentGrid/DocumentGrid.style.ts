import { StyleSheet } from "react-native";
import { CONTAINER_PADDING, SPACING } from "./documentGridConst";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			paddingHorizontal: CONTAINER_PADDING,
			paddingTop: 16,
		},
		emptyListContainer: {
			flex: 1,
			justifyContent: "center",
		},
		masonryContainer: {
			flexDirection: "row",
			alignItems: "flex-start",
		},
		column: {
			flex: 1,
		},
		leftColumn: {
			marginRight: SPACING / 2,
		},
		rightColumn: {
			marginLeft: SPACING / 2,
		},
		cardContainer: {
			marginBottom: SPACING,
		},
		emptyContainer: {
			flex: 1,
			alignItems: "center",
			justifyContent: "center",
			paddingVertical: 60,
		},
		emptyTitle: {
			fontSize: 18,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 8,
		},
		emptySubtitle: {
			fontSize: 14,
			color: theme.textSecondary,
			textAlign: "center",
		},
	});
