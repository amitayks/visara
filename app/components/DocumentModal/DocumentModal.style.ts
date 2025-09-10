import { StyleSheet } from "react-native";
import type { ColorScheme } from "../../../constants/colors";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../../../constants/dimensions";

export const createStyles = (theme: ColorScheme) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: "transparent",
		},
		backdrop: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: "rgba(0, 0, 0, 0.9)",
		},
		image: {
			flex: 1,
			width: SCREEN_WIDTH * 0.9, // 90% of screen width
			height: SCREEN_HEIGHT * 0.7, // 70% of screen height
			alignSelf: "center",
			borderRadius: theme.borderRadius,
		},
		closeButton: {
			position: "absolute",
			top: 60,
			right: 20,
			width: 40,
			height: 40,
			borderRadius: 20,
			backgroundColor: "rgba(0, 0, 0, 0.5)",
			justifyContent: "center",
			alignItems: "center",
			zIndex: 1000,
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

		documentTitle: {
			fontSize: 18,
			fontWeight: "600",
			marginBottom: 16,
		},
		textPreview: {
			marginTop: 16,
			backgroundColor: theme.background,
			borderRadius: 8,
			borderWidth: 1,
			borderColor: theme.border,
			minHeight: SCREEN_HEIGHT * 0.45, // 25% of screen height minimum
			maxHeight: SCREEN_HEIGHT * 0.6, // 60% of screen height maximum
		},
		textPreviewLabel: {
			fontSize: 14,
			fontWeight: "500",
			marginBottom: 8,
			opacity: 0.7,
			paddingHorizontal: 12,
			paddingTop: 12,
		},
		textPreviewScrollView: {
			minHeight: SCREEN_HEIGHT * 0.4, // 20% of screen height minimum scrollable area
			maxHeight: SCREEN_HEIGHT * 0.55, // 55% of screen height maximum scrollable area
			paddingHorizontal: 12,
			paddingBottom: 12,
		},
		textPreviewContent: {
			fontSize: 16,
			lineHeight: 20,
		},
		actionButtons: {
			flexDirection: "row",
			justifyContent: "space-around",
			flexWrap: "wrap",
			gap: 12,
		},
		actionButton: {
			minWidth: "20%",
			maxWidth: "25%",
			marginBottom: 20,
		},
	});
