import { Platform, StyleSheet } from "react-native";
import { SCREEN_WIDTH } from "../../../constants/dimensions";

export const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: Platform.OS === "ios" ? 50 : 30,
		left: 20,
		right: 20,
		maxWidth: SCREEN_WIDTH - 40,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderRadius: 12,
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 4,
		},
		shadowOpacity: 0.3,
		shadowRadius: 4.65,
		elevation: 8,
		zIndex: 10000,
	},
	icon: {
		marginRight: 12,
	},
	message: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "500",
		flex: 1,
		lineHeight: 20,
	},
});
