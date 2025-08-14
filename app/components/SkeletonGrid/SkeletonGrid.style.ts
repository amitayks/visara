import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			paddingHorizontal: 16,
			paddingTop: 16,
		},
		masonryContainer: {
			flexDirection: "row",
			alignItems: "flex-start",
		},
		column: {
			flex: 1,
		},
		leftColumn: {
			marginRight: 7.5, // Half of spacing (15/2)
		},
		rightColumn: {
			marginLeft: 7.5, // Half of spacing (15/2)
		},
		cardContainer: {
			marginBottom: 15, // Match DocumentGrid spacing
		},
		card: {
			backgroundColor: theme.surface,
			borderRadius: 12,
			overflow: "hidden",
			shadowColor: theme.shadow,
			shadowOffset: {
				width: 0,
				height: 2,
			},
			shadowOpacity: 0.1,
			shadowRadius: 3.84,
			elevation: 10, // Match DocumentCard elevation
			position: "relative",
		},
		image: {
			backgroundColor: theme.skeleton,
		},
		typeBadge: {
			position: "absolute",
			top: 8,
			left: 8,
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: "rgba(0, 0, 0, 0.7)",
			paddingHorizontal: 8,
			paddingVertical: 4,
			borderRadius: 6,
		},
		badgeIcon: {
			width: 12,
			height: 12,
			backgroundColor: theme.skeleton,
			borderRadius: 2,
			marginRight: 4,
		},
		badgeText: {
			width: 40,
			height: 11,
			backgroundColor: theme.skeleton,
			borderRadius: 2,
		},
	});
