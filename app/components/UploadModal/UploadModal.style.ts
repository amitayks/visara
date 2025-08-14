import { Dimensions, Platform, StyleSheet } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export const createStyles = (theme: any) =>
	StyleSheet.create({
		backdrop: {
			flex: 1,
			backgroundColor: theme.overlay,
			justifyContent: "flex-end",
		},
		container: {
			backgroundColor: theme.surface,
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			paddingBottom: Platform.OS === "ios" ? 34 : 24,
			marginTop: SCREEN_HEIGHT * 0.1,
			minHeight: SCREEN_HEIGHT * 0.7,
			maxHeight: SCREEN_HEIGHT * 0.9,
			shadowColor: theme.shadow,
			shadowOffset: {
				width: 0,
				height: -10,
			},
			shadowOpacity: 0.25,
			shadowRadius: 20,
			elevation: 15,
			// borderWidth: 1,
			// borderTopColor: theme.surfaceSecondary,
		},
		// handle: {
		// 	width: 40,
		// 	height: 4,
		// 	backgroundColor: "#DDD",
		// 	borderRadius: 2,
		// 	alignSelf: "center",
		// 	marginTop: 12,
		// },
		header: {
			alignItems: "center",
			paddingHorizontal: 20,
			paddingVertical: 16,
			borderBottomWidth: 1,
			borderBottomColor: theme.borderLight,
		},
		title: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
		},
		// closeButton: {
		//   padding: 8,
		// },
		content: {
			flex: 1,
			justifyContent: "space-around",
			// alignItems: "center",
			padding: 20,
		},
		subtitle: {
			fontSize: 16,
			color: theme.textSecondary,
			textAlign: "center",
			marginBottom: 24,
		},
		options: {
			flexDirection: "row",
			gap: 16,
			marginBottom: 24,
		},
		optionButton: {
			flex: 1,
			backgroundColor: theme.surfaceSecondary,
			borderRadius: 16,
			padding: 20,
			alignItems: "center",
			borderWidth: 2,
			borderColor: theme.borderLight,
		},
		optionIcon: {
			width: 64,
			height: 64,
			borderRadius: 32,
			backgroundColor: theme.accentLight,
			alignItems: "center",
			justifyContent: "center",
			marginBottom: 12,
		},
		optionTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 4,
		},
		optionDescription: {
			fontSize: 13,
			color: theme.textSecondary,
			textAlign: "center",
		},
		tipContainer: {
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: theme.surfaceSecondary,
			padding: 12,
			borderRadius: 12,
			gap: 8,
		},
		tipText: {
			flex: 1,
			fontSize: 13,
			color: theme.textSecondary,
			lineHeight: 18,
		},
		processingContainer: {
			padding: 40,
			alignItems: "center",
		},
		previewImage: {
			width: 200,
			height: 200,
			marginBottom: 24,
			borderRadius: 12,
			backgroundColor: theme.surfaceSecondary,
		},
		processingText: {
			marginTop: 16,
			fontSize: 16,
			color: theme.textSecondary,
		},
	});
