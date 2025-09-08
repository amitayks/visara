import { showToast } from "../app/components/Toast";
import { Clipboard as RNClipboard } from "react-native";

// Built-in React Native Clipboard implementation
export const Clipboard = {
	setString: (text: string) => {
		RNClipboard.setString(text);
	},
	getString: async (): Promise<string> => {
		return await RNClipboard.getString();
	},
};

export const copyToClipboard = async (text: string, label: string = "Text") => {
	try {
		Clipboard.setString(text);
		showToast({
			type: "success",
			message: `Copied ${label} to clipboard`,
			icon: "checkmark-circle",
		});
	} catch (error) {
		console.error("Error copying to clipboard:", error);
		showToast({
			type: "error",
			message: "Failed to copy to clipboard",
			icon: "alert-circle",
		});
	}
};
