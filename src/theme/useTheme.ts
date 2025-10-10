import { useSettings } from "@contexts/SettingsContext";
import { useColorScheme } from "react-native";
import { type ColorScheme, Colors, Shadows } from "./colors";

export function useTheme() {
	const { state } = useSettings();
	const systemColorScheme = useColorScheme();

	// Determine effective theme
	const effectiveTheme =
		state.theme === "system" ? systemColorScheme || "light" : state.theme;

	const colors: ColorScheme = Colors[effectiveTheme];
	const shadows = Shadows[effectiveTheme];
	const isDark = effectiveTheme === "dark";

	return {
		colors,
		shadows,
		isDark,
		theme: effectiveTheme,
	};
}
