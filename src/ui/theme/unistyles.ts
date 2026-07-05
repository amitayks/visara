import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { storage } from "@utils/storage/mmkv";
import { Appearance } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { darkTheme, lightTheme, type ThemeMode } from "./tokens";

const appThemes = {
	light: lightTheme,
	dark: darkTheme,
} as const;

type AppThemes = typeof appThemes;

declare module "react-native-unistyles" {
	export interface UnistylesThemes extends AppThemes {}
}

/**
 * Resolve the persisted mode synchronously (MMKV is sync) so first paint uses
 * the right theme. `system` resolves via the OS scheme here; adaptive-theme
 * following is enabled right after mount by applyThemeMode().
 */
function initialThemeName(): "light" | "dark" {
	const mode = (storage.getString(STORAGE_KEYS.THEME) as ThemeMode) ?? "system";
	if (mode === "light" || mode === "dark") return mode;
	return Appearance.getColorScheme() === "light" ? "light" : "dark";
}

StyleSheet.configure({
	themes: appThemes,
	settings: {
		initialTheme: initialThemeName,
	},
});
