import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
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
			elevation: 10,
		},
		imageContainer: {
			position: "relative",
			backgroundColor: theme.surfaceSecondary,
		},
		image: {
			backgroundColor: theme.surfaceSecondary,
		},
		loadingContainer: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: theme.surfaceSecondary,
			alignItems: "center",
			justifyContent: "center",
		},
		errorContainer: {
			height: 200,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: theme.surfaceSecondary,
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
		typeText: {
			color: "#FFF",
			fontSize: 11,
			fontWeight: "600",
			marginLeft: 4,
			textTransform: "capitalize",
		},
		info: {
			padding: 12,
		},
	});
