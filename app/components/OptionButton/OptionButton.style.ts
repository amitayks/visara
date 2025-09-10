import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		optionButton: {
			backgroundColor: theme.surfaceSecondary,
			borderRadius: theme.borderRadius,
			padding: 16,
			borderWidth: 1.5,
			borderColor: "transparent",
		},
		selectedOption: {
			borderColor: theme.secondary,
		},
		optionContent: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
		},
		optionLeft: {
			flexDirection: "row",
			alignItems: "center",
			flex: 1,
		},
		optionIconContainer: {
			width: 48,
			height: 48,
			borderRadius: 24,
			alignItems: "center",
			justifyContent: "center",
			marginRight: 12,
			color: theme.text,
		},
		optionTextContainer: {
			flex: 1,
		},
		optionTitleRow: {
			flexDirection: "column",
		},
		optionTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginRight: 8,
		},
		optionBadge: {
			backgroundColor: theme.surface,
			alignSelf: "flex-start",
			paddingHorizontal: 6,
			paddingVertical: 2,
			borderRadius: theme.borderRadius,
		},
		optionBadgeText: {
			fontSize: 11,
			fontWeight: "600",
			color: theme.textSecondary,
		},
		checkmarkContainer: {
			marginLeft: 12,
		},
	});
