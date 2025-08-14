import { Dimensions, StyleSheet } from "react-native";

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
		// closeButton: {
		//   padding: 8,
		// },
		content: {
			flexGrow: 1,
		},
		// imageContainer: {
		//   height: 300,
		//   backgroundColor: '#F5F5F5',
		//   margin: 20,
		//   borderRadius: 12,
		//   overflow: 'hidden',
		//   alignItems: 'center',
		//   justifyContent: 'center',
		// },
		// image: {
		//   width: '100%',
		//   height: '100%',
		// },
		// imageLoader: {
		//   position: 'absolute',
		// },
		infoSection: {
			paddingHorizontal: 20,
			paddingBottom: 20,
		},
		infoRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingVertical: 12,
			// borderBottomWidth: 0.5,
			// borderBottomColor: '#F0F0F0',
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
			paddingVertical: 16,
			paddingBottom: 20,
			gap: 12,
			backgroundColor: theme.surface,
			borderTopWidth: 1,
			borderTopColor: theme.borderLight,
		},
		actions: {
			flexDirection: "row",
			paddingHorizontal: 20,
			paddingBottom: 20,
			gap: 12,
		},
		actionButton: {
			flex: 1,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			paddingVertical: 14,
			borderRadius: 12,
			gap: 8,
		},
		actionLabel: {
			fontSize: 16,
			fontWeight: "600",
		},
		skeleton: {
			padding: 20,
		},
		skeletonImage: {
			height: 300,
			backgroundColor: theme.skeleton,
			borderRadius: 12,
			marginBottom: 20,
		},
		skeletonInfo: {
			gap: 16,
		},
		skeletonRow: {
			height: 50,
			backgroundColor: theme.skeleton,
			borderRadius: 8,
		},
		deletingOverlay: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: theme.overlay,
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			alignItems: "center",
			justifyContent: "center",
		},
		actionBarSkeleton: {
			flexDirection: "row",
			gap: 12,
			flex: 1,
		},
		actionButtonSkeleton: {
			flex: 1,
			height: 52,
			backgroundColor: theme.skeleton,
			borderRadius: 12,
		},
	});
