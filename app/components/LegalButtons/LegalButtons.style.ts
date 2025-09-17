import { StyleSheet } from "react-native";
import { SCREEN_WIDTH } from "../../../constants/dimensions";

const HORIZONTAL_MARGIN = 20;
const BUTTON_SPACING = 20;
const BUTTON_WIDTH =
	(SCREEN_WIDTH - HORIZONTAL_MARGIN * 2 - BUTTON_SPACING) / 2;

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flexDirection: "row",
			paddingHorizontal: HORIZONTAL_MARGIN,
			gap: BUTTON_SPACING,
			justifyContent: "space-between",
			marginVertical: 20,
		},
		legalButton: {
			width: BUTTON_WIDTH,
			backgroundColor: theme.surface,
			borderRadius: theme.borderRadius,
			borderWidth: 1,
			borderColor: theme.border,
			paddingVertical: 20,
			paddingHorizontal: 16,
			alignItems: "center",
			shadowColor: "#000",
			shadowOffset: {
				width: 0,
				height: 2,
			},
			shadowOpacity: 0.1,
			shadowRadius: 4,
			elevation: 3,
			minHeight: 50,
			justifyContent: "center",
		},
		iconContainer: {
			marginBottom: 12,
			alignItems: "center",
		},
		textContainer: {
			alignItems: "center",
			flex: 1,
			justifyContent: "center",
		},
		buttonTitle: {
			fontSize: 11,
			fontWeight: "600",
			color: theme.text,
			textAlign: "center",
			// marginBottom: 6,
		},
		buttonSubtitle: {
			fontSize: 11,
			color: theme.secondary,
			textAlign: "center",
			// lineHeight: 16,
			opacity: 0.8,
		},
	});
