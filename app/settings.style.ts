import { StyleSheet } from "react-native";

export const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
		},
		header: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 16,
			paddingVertical: 12,
			borderBottomWidth: 1,
		},
		backButton: {
			width: 40,
			height: 40,
			justifyContent: "center",
			alignItems: "center",
		},
		headerTitle: {
			fontSize: 18,
			fontWeight: "600",
		},
		section: {
			paddingVertical: 16,
			borderBottomWidth: 1,
		},
		sectionTitle: {
			fontSize: 13,
			fontWeight: "600",
			textTransform: "uppercase",
			letterSpacing: 0.5,
			marginBottom: 12,
			marginHorizontal: 16,
		},
		settingRow: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 16,
			paddingVertical: 12,
		},
		settingInfo: {
			flex: 1,
			marginRight: 12,
		},
		settingTitle: {
			fontSize: 16,
			marginBottom: 2,
		},
		settingSubtitle: {
			fontSize: 13,
		},
		segmentedControl: {
			flexDirection: "row",
			borderRadius: 8,
			padding: 2,
		},
		segmentButton: {
			paddingHorizontal: 16,
			paddingVertical: 8,
			borderRadius: 6,
		},
		segmentText: {
			fontSize: 13,
		},
		dangerButton: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: "#FFF5F5",
			marginHorizontal: 16,
			paddingVertical: 12,
			borderRadius: 8,
			borderWidth: 1,
			borderColor: "#FFDDDD",
		},
		dangerButtonText: {
			fontSize: 16,
			color: "#FF3B30",
			fontWeight: "500",
			marginLeft: 8,
		},
		aboutRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			paddingHorizontal: 16,
			paddingVertical: 8,
		},
		aboutLabel: {
			fontSize: 15,
		},
		aboutValue: {
			fontSize: 15,
		},
		footer: {
			padding: 24,
			alignItems: "center",
		},
		footerText: {
			fontSize: 13,
			textAlign: "center",
			lineHeight: 18,
		},
	});
