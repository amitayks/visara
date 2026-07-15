/**
 * Visara DS theme wrapper (design D1): every call site imports from here, so
 * the styling engine stays swappable (Unistyles today; typed StyleSheet
 * fallback would re-implement this module with an identical surface).
 */
import { StatusBar } from "react-native";
import {
	StyleSheet,
	UnistylesRuntime,
	useUnistyles,
} from "react-native-unistyles";
import type { ThemeMode } from "./tokens";

export * from "./tokens";
export { StyleSheet, UnistylesRuntime };

/** Theme values for JSX props; styles should use StyleSheet.create(theme => …). */
export function useAppTheme() {
	const { theme, rt } = useUnistyles();
	return { theme, rt, isDark: rt.themeName === "dark" };
}

/**
 * Apply a user-selected mode: `system` follows the OS adaptively; explicit
 * modes pin the theme. Also drives the StatusBar from the RESOLVED theme
 * (ui-design-system spec — never the raw OS scheme).
 */
export function applyThemeMode(mode: ThemeMode): void {
	if (mode === "system") {
		if (!UnistylesRuntime.hasAdaptiveThemes) {
			UnistylesRuntime.setAdaptiveThemes(true);
		}
	} else {
		if (UnistylesRuntime.hasAdaptiveThemes) {
			UnistylesRuntime.setAdaptiveThemes(false);
		}
		UnistylesRuntime.setTheme(mode);
	}
	syncStatusBar();
}

export function syncStatusBar(): void {
	StatusBar.setBarStyle(
		UnistylesRuntime.themeName === "dark" ? "light-content" : "dark-content",
	);
}
