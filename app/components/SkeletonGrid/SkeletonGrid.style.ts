import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		cardContainer: {
			paddingVertical: 4, // Match DocumentGrid cardContainer
			flex: 1,
			alignItems: "center",
		},
		// Match DocumentCard container exactly
		skeletonCard: {
			backgroundColor: theme.surface,
			borderRadius: theme.borderRadius,
			overflow: "hidden",
			shadowColor: theme.shadow,
			shadowOffset: {
				width: 0,
				height: 2,
			},
			shadowOpacity: 0.1,
			shadowRadius: 3.84,
			elevation: 10,
		},
		// Match DocumentCard imageContainer
		imageContainer: {
			position: "relative",
			backgroundColor: theme.surfaceSecondary,
		},
		// Match DocumentCard image but use skeleton color
		image: {
			backgroundColor: theme.skeleton || theme.surfaceSecondary,
		},
	});
