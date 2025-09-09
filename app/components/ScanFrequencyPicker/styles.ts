import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		// Trigger Button Styles
		triggerButton: {
			backgroundColor: theme.surface,
			borderRadius: 12,
			padding: 16,
			marginHorizontal: 20,
			marginBottom: 8,
			shadowColor: theme.shadowColor,
			shadowOffset: {
				width: 0,
				height: 1,
			},
			shadowOpacity: 0.1,
			shadowRadius: 2,
			elevation: 2,
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
			backgroundColor: theme.primaryLight,
			paddingHorizontal: 8,
			paddingVertical: 4,
			borderRadius: 12,
			marginRight: 8,
		},
		badgeText: {
			fontSize: 12,
			fontWeight: "600",
			color: theme.primary,
		},

		// Modal Styles
		modalContainer: {
			flex: 1,
			backgroundColor: theme.background,
		},
		modalHeader: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 20,
			paddingVertical: 16,
			borderBottomWidth: 1,
			borderBottomColor: theme.border,
		},
		closeButton: {
			width: 40,
			height: 40,
			borderRadius: 20,
			backgroundColor: theme.surface,
			alignItems: "center",
			justifyContent: "center",
		},
		modalTitle: {
			fontSize: 18,
			fontWeight: "700",
			color: theme.text,
		},
		headerSpacer: {
			width: 40,
		},

		// Options List
		optionsList: {
			flex: 1,
			paddingTop: 16,
		},
		sectionDescription: {
			fontSize: 14,
			color: theme.textSecondary,
			paddingHorizontal: 20,
			paddingBottom: 20,
			lineHeight: 20,
		},
		optionButton: {
			backgroundColor: theme.surface,
			marginHorizontal: 20,
			marginBottom: 8,
			borderRadius: 12,
			padding: 16,
			borderWidth: 2,
			borderColor: "transparent",
		},
		selectedOption: {
			borderColor: theme.primary,
			backgroundColor: theme.primaryLight,
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
			backgroundColor: theme.primaryLight,
			alignItems: "center",
			justifyContent: "center",
			marginRight: 12,
		},
		selectedIconContainer: {
			backgroundColor: theme.primary,
		},
		optionTextContainer: {
			flex: 1,
		},
		optionTitleRow: {
			flexDirection: "row",
			alignItems: "center",
			marginBottom: 4,
		},
		optionTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginRight: 8,
		},
		selectedOptionTitle: {
			color: theme.primary,
		},
		optionBadge: {
			backgroundColor: theme.surface,
			paddingHorizontal: 6,
			paddingVertical: 2,
			borderRadius: 8,
			borderWidth: 1,
			borderColor: theme.border,
		},
		selectedBadge: {
			backgroundColor: theme.primary,
			borderColor: theme.primary,
		},
		optionBadgeText: {
			fontSize: 11,
			fontWeight: "600",
			color: theme.textSecondary,
		},
		selectedBadgeText: {
			color: theme.background,
		},
		optionDescription: {
			fontSize: 14,
			color: theme.textSecondary,
			lineHeight: 18,
		},
		selectedOptionDescription: {
			color: theme.primary,
		},
		checkmarkContainer: {
			marginLeft: 12,
		},

		// Info Section
		infoSection: {
			paddingHorizontal: 20,
			paddingTop: 20,
			paddingBottom: 40,
		},
		infoItem: {
			flexDirection: "row",
			alignItems: "flex-start",
		},
		infoText: {
			fontSize: 13,
			color: theme.textSecondary,
			marginLeft: 8,
			lineHeight: 18,
			flex: 1,
		},
	});