export const Colors = {
	light: {
		// Primary colors
		primary: "#000000",
		secondary: "#666666",
		tertiary: "#d1d1d1ff",
		accent: "#0066FF",

		// Background colors (background must stay #FFFFFF per requirement)
		background: "#FFFFFF",
		surface: "#FFFFFF",
		surfaceSecondary: "#F8F8F8",
		surfaceElevated: "#FAFAFA",
		overlay: "rgba(0, 0, 0, 0.5)",

		// Text colors
		text: "#000000",
		textSecondary: "#666666",
		textTertiary: "#999999",
		textInverse: "#FFFFFF",
		textOnAccent: "#FFFFFF",

		// Button colors
		buttonPrimary: "#007AFF",
		buttonPrimaryText: "#FFFFFF",
		buttonSecondary: "#F2F2F7",
		buttonSecondaryText: "#000000",
		buttonDisabled: "#E5E5EA",
		buttonDisabledText: "#999999",

		// Border colors
		border: "#E5E5E7",
		borderLight: "#F0F0F0",
		borderFocus: "#007AFF",

		// Status colors
		success: "#34C759",
		error: "#FF3B30",
		warning: "#FF9500",
		info: "#0066FF",
		processing: "#007AFF",

		// Badge colors
		badgePending: "#FF9500",
		badgeProcessing: "#0066FF",
		badgeCompleted: "#34C759",
		badgeFailed: "#FF3B30",

		// Component specific
		skeleton: "#F0F0F0",
		shadow: "rgba(0, 0, 0, 0.1)",
		shadowDark: "rgba(0, 0, 0, 0.2)",
		thumbnailPlaceholder: "#E5E5EA",
		progressBar: "#007AFF",
		progressBarBackground: "#E5E5EA",

		// Navigation
		navigationBackground: "#FFFFFF",
		navigationBorder: "#E5E5E7",
		navigationActive: "#007AFF",
		navigationInactive: "#999999",
	},

	dark: {
		// Primary colors
		primary: "#FFFFFF",
		secondary: "#AAAAAA",
		tertiary: "#4a4a4aff",
		accent: "#0A84FF",

		// Background colors (background must stay #000000 per requirement)
		background: "#000000",
		surface: "#1C1C1E",
		surfaceSecondary: "#2C2C2E",
		surfaceElevated: "#3A3A3C",
		overlay: "rgba(0, 0, 0, 0.8)",

		// Text colors
		text: "#FFFFFF",
		textSecondary: "#AAAAAACC", // 80% opacity
		textTertiary: "#AAAAAA99", // 60% opacity
		textInverse: "#000000",
		textOnAccent: "#FFFFFF",

		// Button colors
		buttonPrimary: "#0A84FF",
		buttonPrimaryText: "#FFFFFF",
		buttonSecondary: "#2C2C2E",
		buttonSecondaryText: "#FFFFFF",
		buttonDisabled: "#3A3A3C",
		buttonDisabledText: "#666666",

		// Border colors
		border: "#38383A",
		borderLight: "#48484A",
		borderFocus: "#0A84FF",

		// Status colors
		success: "#30D158",
		error: "#FF453A",
		warning: "#FF9F0A",
		info: "#0A84FF",
		processing: "#0A84FF",

		// Badge colors
		badgePending: "#FF9F0A",
		badgeProcessing: "#0A84FF",
		badgeCompleted: "#30D158",
		badgeFailed: "#FF453A",

		// Component specific
		skeleton: "#2C2C2E",
		shadow: "rgba(0, 0, 0, 0.3)",
		shadowDark: "rgba(0, 0, 0, 0.5)",
		thumbnailPlaceholder: "#3A3A3C",
		progressBar: "#0A84FF",
		progressBarBackground: "#3A3A3C",

		// Navigation
		navigationBackground: "#1C1C1E",
		navigationBorder: "#38383A",
		navigationActive: "#0A84FF",
		navigationInactive: "#666666",
	},
};

// Spacing system (8px base grid)
export const Spacing = {
	xs: 4,
	sm: 8,
	md: 16,
	lg: 24,
	xl: 32,
	xxl: 48,
};

// Border radius
export const BorderRadius = {
	sm: 4,
	md: 8,
	lg: 12,
	xl: 16,
	full: 9999,
};

// Typography
export const Typography = {
	fontSize: {
		xs: 12,
		sm: 14,
		md: 16,
		lg: 18,
		xl: 20,
		xxl: 24,
		xxxl: 32,
	},
	fontWeight: {
		regular: "400" as const,
		medium: "500" as const,
		semibold: "600" as const,
		bold: "700" as const,
	},
	lineHeight: {
		tight: 1.2,
		normal: 1.5,
		relaxed: 1.75,
	},
};

// Shadows (for elevation)
export const Shadows = {
	light: {
		sm: {
			shadowColor: "#000000",
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.05,
			shadowRadius: 2,
			elevation: 2,
		},
		md: {
			shadowColor: "#000000",
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: 0.1,
			shadowRadius: 4,
			elevation: 4,
		},
		lg: {
			shadowColor: "#000000",
			shadowOffset: { width: 0, height: 4 },
			shadowOpacity: 0.15,
			shadowRadius: 8,
			elevation: 8,
		},
	},
	dark: {
		sm: {
			shadowColor: "#000000",
			shadowOffset: { width: 0, height: 1 },
			shadowOpacity: 0.3,
			shadowRadius: 2,
			elevation: 2,
		},
		md: {
			shadowColor: "#000000",
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: 0.4,
			shadowRadius: 4,
			elevation: 4,
		},
		lg: {
			shadowColor: "#000000",
			shadowOffset: { width: 0, height: 4 },
			shadowOpacity: 0.5,
			shadowRadius: 8,
			elevation: 8,
		},
	},
};

// Animation timings (for Reanimated)
export const AnimationTimings = {
	fast: 150,
	normal: 250,
	slow: 350,
};

// Spring configs (for Reanimated)
export const SpringConfigs = {
	gentle: {
		damping: 30,
		stiffness: 200,
	},
	snappy: {
		damping: 15,
		stiffness: 300,
	},
	bouncy: {
		damping: 10,
		stiffness: 400,
	},
};

export type ColorScheme = typeof Colors.light;
export type ThemeMode = "light" | "dark" | "system";
