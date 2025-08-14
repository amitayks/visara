import { Platform, StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			backgroundColor: theme.background,
			borderTopWidth: 1,
			borderTopColor: theme.border,
			paddingBottom: Platform.OS === "ios" ? 20 : 10,
		},
		chipsContainer: {
			backgroundColor: theme.background,
			paddingHorizontal: 16,
			paddingTop: 12,
			paddingBottom: 8,
		},
		chipsScrollContent: {
			paddingVertical: 4,
			gap: 8,
		},
		chipWrapper: {
			marginRight: 8,
		},
		chip: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: 12,
			paddingVertical: 6,
			borderRadius: 16,
		},
		chipIcon: {
			marginRight: 6,
		},
		chipText: {
			fontSize: 14,
			fontWeight: "500",
			maxWidth: 150,
		},
		removeButton: {
			marginLeft: 6,
			padding: 2,
		},
		searchInputRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: 16,
			paddingVertical: 12,
			backgroundColor: theme.background,
		},
		inputContainer: {
			flex: 1,
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: theme.surfaceSecondary,
			borderRadius: 24,
			paddingHorizontal: 16,
			height: 44,
		},
		input: {
			flex: 1,
			fontSize: 16,
			color: theme.text,
			paddingVertical: 0,
		},
		sendButtonContainer: {
			marginLeft: 12,
			overflow: "hidden",
		},
		sendButton: {
			width: 44,
			height: 44,
			borderRadius: 22,
			alignItems: "center",
			justifyContent: "center",
		},
	});
