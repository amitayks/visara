import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: theme.background,
		},
		header: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: 16,
			paddingVertical: 12,
			// borderBottomWidth: 1,
			// borderBottomColor: theme.borderLight,
		},
		backButton: {
			padding: 8,
			marginLeft: -8,
		},
		headerTitle: {
			flex: 1,
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			textAlign: "center",
			marginRight: 40, // Compensate for back button width
		},
		headerSpacer: {
			width: 40, // Same as back button width for centering
		},
		content: {
			flex: 1,
		},
		// comingSoon: {
		// 	flex: 1,
		// 	alignItems: "center",
		// 	justifyContent: "center",
		// 	paddingHorizontal: 40,
		// 	minHeight: SCREEN_HEIGHT * 0.3,
		// 	marginTop: 60,
		// },
		// comingSoonTitle: {
		// 	fontSize: 24,
		// 	fontWeight: "600",
		// 	color: theme.text,
		// 	marginTop: 20,
		// 	marginBottom: 12,
		// },
		// comingSoonText: {
		// 	fontSize: 16,
		// 	color: theme.textSecondary,
		// 	textAlign: "center",
		// 	lineHeight: 24,
		// },
		footer: {
			borderTopWidth: 1,
			// borderTopColor: theme.borderLight,
			// backgroundColor: theme.surfaceSecondary,
		},
		versionSection: {
			alignItems: "center",
			paddingHorizontal: 20,
			paddingVertical: 24,
		},
		appName: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 4,
		},
		version: {
			fontSize: 16,
			color: theme.textSecondary,
			marginBottom: 2,
		},
		buildInfo: {
			fontSize: 14,
			color: theme.textTertiary,
			marginBottom: 16,
		},
		infoRow: {
			flexDirection: "row",
			gap: 24,
			marginBottom: 16,
		},
		infoItem: {
			flexDirection: "row",
			alignItems: "center",
			gap: 6,
		},
		infoText: {
			fontSize: 13,
			color: theme.textSecondary,
			fontWeight: "500",
		},
		copyright: {
			fontSize: 12,
			color: theme.textTertiary,
			textAlign: "center",
		},
	});
