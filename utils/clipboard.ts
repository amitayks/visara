import { showToast } from "../app/components/Toast";
import { Alert } from "react-native";

// Temporary clipboard implementation until we can properly install a clipboard package
class ClipboardService {
	private clipboardData: string = "";

	async setStringAsync(text: string): Promise<void> {
		// For now, we'll store it in memory
		// In production, you'd want to use @react-native-clipboard/clipboard
		this.clipboardData = text;

		// Note: In a real app, use @react-native-clipboard/clipboard
		// For now, we just store in memory
	}

	async getStringAsync(): Promise<string> {
		// Note: In a real app, use @react-native-clipboard/clipboard
		// For now, we just return stored data
		return this.clipboardData;
	}
}

export const Clipboard = new ClipboardService();

export const copyToClipboard = async (text: string, label: string = "Text") => {
	try {
		await Clipboard.setStringAsync(text);
		showToast({
			type: "success",
			message: `Copied ${label} to clipboard`,
			icon: "checkmark-circle",
		});
		// Alert.alert("Copied", `${label} copied to clipboard`);
	} catch (error) {
		console.error("Error copying to clipboard:", error);
		showToast({
			type: "error",
			message: "Failed to copy to clipboard",
			icon: "alert-circle",
		});
		// Alert.alert("Error", "Failed to copy to clipboard");
	}
};
