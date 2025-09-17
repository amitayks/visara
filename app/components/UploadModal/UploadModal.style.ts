import { Dimensions, Platform, StyleSheet } from "react-native";
import { SCREEN_HEIGHT } from "../../../constants/dimensions";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: "transparent",
		},
		backdrop: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: "rgba(0, 0, 0, 0.9)",
		},
		bottomSheetBackground: {
			borderTopLeftRadius: 20,
			borderTopRightRadius: 20,
			shadowColor: "#000",
			shadowOffset: {
				width: 0,
				height: -2,
			},
			shadowOpacity: 0.25,
			shadowRadius: 3.84,
			elevation: 5,
		},
		bottomSheetHandle: {
			width: 40,
			height: 4,
			borderRadius: 2,
			opacity: 0.3,
		},
		bottomSheetContent: {
			flex: 1,
			padding: 20,
		},
		header: {
			alignItems: "center",
			paddingBottom: 16,
			borderBottomWidth: 1,
			borderBottomColor: theme.borderLight,
		},
		title: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
		},
		content: {
			flex: 1,
			flexDirection: "column",
			justifyContent: "center",
			gap: 24,
		},
		subtitle: {
			fontSize: 16,
			color: theme.textSecondary,
			textAlign: "center",
		},
		options: {
			flexDirection: "row",
			gap: 16,
		},
		optionButton: {
			flex: 1,
			backgroundColor: theme.surfaceSecondary,
			borderRadius: 16,
			padding: 30,
			gap: 20,
			alignItems: "center",
		},
		optionIcon: {
			// width: 64,
			// height: 64,
			alignItems: "center",
			justifyContent: "center",
		},
		optionTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
		},
		tipContainer: {
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: theme.surfaceSecondary,
			padding: 12,
			borderRadius: 16,
			gap: 8,
		},
		tipText: {
			flex: 1,
			fontSize: 13,
			color: theme.textSecondary,
			lineHeight: 18,
		},
		processingContainer: {
			flex: 1,
			// justifyContent: "space-between",
			alignItems: "stretch",
		},
		previewImage: {
			width: 250,
			height: 300,
			marginBottom: 24,
			borderRadius: 12,
			backgroundColor: theme.surfaceSecondary,
		},
		processingText: {
			marginTop: 16,
			fontSize: 16,
			color: theme.textSecondary,
		},
	});
