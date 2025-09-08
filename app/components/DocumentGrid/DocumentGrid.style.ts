import { StyleSheet } from "react-native";
import { CONTAINER_PADDING, SPACING } from "./documentGridConst";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			padding: CONTAINER_PADDING,
		},
		emptyListContainer: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			paddingHorizontal: 20,
			minHeight: 400,
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
			marginHorizontal: SPACING / 4, // Small horizontal spacing for masonry
		},
		loadingFooter: {
			paddingVertical: 20,
			alignItems: 'center',
			justifyContent: 'center',
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
