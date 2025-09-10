import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		// Trigger Button Styles
		container: {
			marginHorizontal: 16,
			marginTop: 20,
			borderRadius: 16,
			// overflow: "hidden",
		},
		modalContainer: {
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

		row: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 20,
			paddingVertical: 16,
		},
		disabled: {
			opacity: 0.6,
		},
		triggerContent: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
		},
		triggerLeft: {
			flexDirection: "row",
			alignItems: "center",
			flex: 1,
		},
		iconContainer: {
			width: 40,
			height: 40,
			borderRadius: 20,
			backgroundColor: theme.primaryLight,
			alignItems: "center",
			justifyContent: "center",
			marginRight: 12,
		},
		triggerTextContainer: {
			flex: 1,
		},
		triggerTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 2,
		},
		triggerSubtitle: {
			fontSize: 14,
			color: theme.textSecondary,
		},
		triggerRight: {
			flexDirection: "row",
			alignItems: "center",
		},
		badgeContainer: {
			// backgroundColor: theme.primaryLight,
			// paddingHorizontal: 8,
			// paddingVertical: 4,
			borderRadius: theme.borderRadius,
			marginRight: 8,
		},
		badgeText: {
			fontSize: 12,
			fontWeight: "600",
			color: theme.primary,
		},
		optionsList: {
			flex: 1,
			flexDirection: "column",
			justifyContent: "space-around",
			gap: 20,
			paddingTop: 16,
			marginHorizontal: 16,
		},
		sectionDescription: {
			fontSize: 14,
			color: theme.textSecondary,
			lineHeight: 20,
		},
		optionsContainer: {
			flex: 1,
			flexDirection: "column",
			gap: 14,
		},
		infoItem: {
			flexDirection: "row",
		},
		infoText: {
			fontSize: 13,
			color: theme.textSecondary,
			marginLeft: 8,
			lineHeight: 18,
			flex: 1,
		},
	});
