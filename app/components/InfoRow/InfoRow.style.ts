import { StyleSheet } from "react-native";
import { SCREEN_WIDTH } from "../../../constants/dimensions";

const HORIZONTAL_MARGIN = 20;
const BLOCK_SPACING = 12;
const BLOCK_WIDTH = (SCREEN_WIDTH - HORIZONTAL_MARGIN * 2 - BLOCK_SPACING) / 2;

export const createStyles = (theme: any) =>
	StyleSheet.create({
		touchableWrapper: {
			width: BLOCK_WIDTH,
			marginBottom: 12,
		},
		infoBlock: {
			backgroundColor: theme.surface,
			borderRadius: theme.borderRadius,
			padding: 16,
			minHeight: BLOCK_WIDTH / 2,
			borderWidth: 1,
			borderColor: theme.border,
			shadowColor: "#000",
			shadowOffset: {
				width: 0,
				height: 2,
			},
			shadowOpacity: 0.1,
			shadowRadius: 3.84,
			elevation: 5,
		},
		infoIcon: {
			position: "absolute",
			top: 12,
			right: 12,
			opacity: 0.6,
		},
		infoContent: {
			flex: 1,
			paddingRight: 24, // Space for icon
			gap: 14,
		},
		infoLabel: {
			fontSize: 11,
			color: theme.secondary,
			fontWeight: "600",
			textTransform: "uppercase",
			letterSpacing: 0.5,
		},
		infoValue: {
			fontSize: 16,
			color: theme.text,
			fontWeight: "500",
			lineHeight: 20,
		},
		copyIndicator: {
			position: "absolute",
			top: 8,
			right: 8,
			backgroundColor: theme.background,
			borderRadius: 12,
			padding: 4,
			opacity: 0.7,
		},
	});
