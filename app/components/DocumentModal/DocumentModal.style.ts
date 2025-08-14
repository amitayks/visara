import { Dimensions, StyleSheet } from "react-native";
import { SCREEN_HEIGHT } from "../../../constants/dimensions";

// const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
			minHeight: SCREEN_HEIGHT * 0.7,
			maxHeight: SCREEN_HEIGHT * 0.9,
			marginTop: SCREEN_HEIGHT * 0.1,
			shadowColor: theme.shadow,
			shadowOffset: {
				width: 0,
				height: -10,
			},
			shadowOpacity: 0.25,
			shadowRadius: 20,
			elevation: 15,
		},
		// handle: {
		//   width: 40,
		//   height: 4,
		//   backgroundColor: '#DDD',
		//   borderRadius: 2,
		//   alignSelf: 'center',
		//   marginTop: 12,
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

		content: {
			flexGrow: 1,
		},

		infoSection: {
			paddingHorizontal: 20,
			paddingBottom: 20,
		},
		infoRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingVertical: 12,
			// borderBottomWidth: 0.5,
			// borderBottomColor: "#F0F0F0",
		},
		infoIcon: {
			marginRight: 16,
		},
		infoContent: {
			flex: 1,
		},
		infoLabel: {
			fontSize: 12,
			color: theme.textTertiary,
			marginBottom: 2,
		},
		infoValue: {
			fontSize: 16,
			color: theme.text,
			fontWeight: "500",
		},
		actionBar: {
			flexDirection: "row",
			paddingHorizontal: 20,
			paddingVertical: 0,
			paddingBottom: 20,
			gap: 12,
			// backgroundColor: theme.surface,
			// borderTopWidth: 1,
			// borderTopColor: theme.borderLight,
		},

		galleryButton: {
			marginHorizontal: 20,
			marginVertical: 16,
			paddingVertical: 14,
			borderRadius: 12,
			alignItems: "center",
		},
		galleryButtonText: {
			fontSize: 16,
			color: "#e0e0e0ff",
		},
		deletingOverlay: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: theme.overlay,
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			alignItems: "center",
			justifyContent: "center",
		},
	});
