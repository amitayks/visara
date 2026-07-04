/**
 * Toast host — sonner-native Toaster themed from the RESOLVED app theme
 * (an in-app mode that overrides the OS scheme drives toasts too).
 * The imperative `toast` API is re-exported for all features.
 */

import { useAppTheme } from "@ui/theme";
import { Toaster } from "sonner-native";

export { toast } from "sonner-native";

export function AppToaster() {
	const { theme, isDark } = useAppTheme();

	return (
		<Toaster
			theme={isDark ? "dark" : "light"}
			position="bottom-center"
			toastOptions={{
				style: {
					backgroundColor: theme.colors.surfaceElevated,
					borderRadius: theme.radii.lg,
					borderWidth: 1,
					borderColor: theme.colors.border,
				},
				titleStyle: { color: theme.colors.textPrimary },
				descriptionStyle: { color: theme.colors.textSecondary },
			}}
		/>
	);
}
