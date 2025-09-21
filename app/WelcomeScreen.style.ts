import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: theme.background,
		},
		wrappContent: {
			flexGrow: 1,
			// flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			paddingVertical: 24,
			paddingHorizontal: 24,
			// paddingBottom: 40,
			// alignItems: "center",
			// justifyContent: "center",
		},
		skipButton: {
			position: "absolute",
			top: 20,
			right: 24,
			padding: 8,
			zIndex: 1,
		},
		skipText: {
			fontSize: 16,
			color: theme.textSecondary,
		},
		content: {
			flex: 1,
			justifyContent: "space-between",
			// gap: 12,
			alignItems: "center",
			marginBottom: 40,
		},
		iconContainer: {
			// flex: 1,
			backgroundColor: theme.accent + "40",
			width: 120,
			height: 120,
			borderRadius: theme.borderRadius,
			alignItems: "center",
			justifyContent: "center",
			marginTop: 80,
			marginBottom: 40,
		},
		title: {
			fontSize: 28,
			fontWeight: "bold",
			color: theme.text,
			textAlign: "center",
		},
		subtitle: {
			fontSize: 18,
			fontWeight: "600",
			marginVertical: 16,
			textAlign: "center",
			color: theme.info,
		},
		description: {
			fontSize: 16,
			color: theme.textSecondary,
			textAlign: "center",
			lineHeight: 24,
			paddingHorizontal: 20,
		},
		indicatoresAndButton: {
			alignItems: "center",
			gap: 20,
		},
		indicators: {
			flexDirection: "row",
		},
		indicator: {
			width: 8,
			height: 8,
			borderRadius: 4,
			backgroundColor: theme.text,
			marginHorizontal: 4,
		},
		activeIndicator: {
			width: 24,
			height: 8,
			backgroundColor: theme.accent,
		},
		button: {
			flexDirection: "row",
			// paddingHorizontal: 32,
			paddingVertical: 16,
			borderRadius: theme.borderRadius,
			alignItems: "center",
			justifyContent: "center",
			minWidth: 200,
			backgroundColor: theme.accent,
		},
		buttonDisabled: {
			opacity: 0.7,
		},
		buttonText: {
			fontSize: 18,
			fontWeight: "600",
			color: theme.text,
		},
		buttonIcon: {
			marginLeft: 8,
		},
	});
