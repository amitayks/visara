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
			backgroundColor: "rgba(0, 0, 0, 0.7)",
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
			paddingHorizontal: 20,
			paddingTop: 0,
		},
		header: {
			paddingVertical: 16,
			borderBottomWidth: 1,
			borderBottomColor: theme.border,
			marginBottom: 20,
		},
		title: {
			fontSize: 22,
			fontWeight: "700",
			textAlign: "center",
		},
		scrollView: {
			flex: 1,
		},
		scrollContent: {
			flexGrow: 1,
			paddingBottom: 120, // Extra space for the floating close button
			paddingTop: 0,
		},
		mainHeader: {
			fontSize: 18,
			fontWeight: "700",
			color: theme.text,
			marginTop: 24,
			marginBottom: 12,
			lineHeight: 24,
			opacity: 1,
		},
		subHeader: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginTop: 16,
			marginBottom: 8,
			lineHeight: 22,
			opacity: 1,
		},
		bodyText: {
			fontSize: 15,
			color: theme.text,
			lineHeight: 22,
			marginBottom: 12,
			opacity: 0.9,
		},
		listItem: {
			fontSize: 15,
			color: theme.text,
			lineHeight: 22,
			marginBottom: 6,
			marginLeft: 12,
			opacity: 0.9,
		},
		bottomPadding: {
			height: 80,
		},
		floatingCloseButton: {
			position: "absolute",
			bottom: SCREEN_HEIGHT * 0.02, // 10px above drawer bottom (90% - 5% = 85%, then 15% from bottom)
			left: SCREEN_WIDTH / 2 - 28, // Center horizontally (28 = half of button width)
			zIndex: 1000,
		},
		closeButton: {
			width: 56,
			height: 56,
			borderRadius: theme.borderRadius,
			backgroundColor: theme.background,
			justifyContent: "center",
			alignItems: "center",
			shadowColor: "#fefefeff",
			shadowOffset: {
				width: 0,
				height: 4,
			},
			shadowOpacity: 0.3,
			shadowRadius: 8,
			elevation: 3,
		},
	});
