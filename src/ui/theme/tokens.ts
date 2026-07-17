/**
 * Visara DS design tokens (ui-design-system spec).
 * Dark palette is the reference design; light is equally complete.
 */

export type ThemeMode = "light" | "dark" | "system";

const palette = {
	black: "#000000",
	white: "#FFFFFF",
	blue: "#0A84FF",
	blueLight: "#007AFF",
	red: "#FF453A",
	redLight: "#FF3B30",
	green: "#30D158",
	greenLight: "#34C759",
	orange: "#FF9F0A",
	orangeLight: "#FF9500",
} as const;

const darkColorsLiteral = {
	background: palette.black,
	surface: "#0E0E11",
	surfaceElevated: "#1A1A1E",
	surfacePressed: "#26262B",
	textPrimary: palette.white,
	textSecondary: "rgba(235,235,245,0.62)",
	textTertiary: "rgba(235,235,245,0.32)",
	textOnAccent: palette.white,
	accent: palette.blue,
	accentMuted: "rgba(10,132,255,0.22)",
	danger: palette.red,
	success: palette.green,
	warning: palette.orange,
	border: "rgba(255,255,255,0.12)",
	separator: "rgba(255,255,255,0.08)",
	overlay: "rgba(0,0,0,0.55)",
	barBackground: "rgba(18,18,22,0.92)",
	thumbnailPlaceholder: "#1C1C21",
	selectionScrim: "rgba(10,132,255,0.35)",
	edgePreview: "rgba(255,255,255,0.10)",
} as const;

export type ThemeColors = { [K in keyof typeof darkColorsLiteral]: string };

export const darkColors: ThemeColors = darkColorsLiteral;

export const lightColors: ThemeColors = {
	background: palette.white,
	surface: "#F2F2F7",
	surfaceElevated: palette.white,
	surfacePressed: "#E4E4EA",
	textPrimary: "#0A0A0C",
	textSecondary: "rgba(60,60,67,0.62)",
	textTertiary: "rgba(60,60,67,0.32)",
	textOnAccent: palette.white,
	accent: palette.blueLight,
	accentMuted: "rgba(0,122,255,0.14)",
	danger: palette.redLight,
	success: palette.greenLight,
	warning: palette.orangeLight,
	border: "rgba(0,0,0,0.12)",
	separator: "rgba(0,0,0,0.08)",
	overlay: "rgba(0,0,0,0.35)",
	barBackground: "rgba(249,249,251,0.94)",
	thumbnailPlaceholder: "#E9E9EE",
	selectionScrim: "rgba(0,122,255,0.30)",
	edgePreview: "rgba(0,0,0,0.08)",
} as const;

/** 4px-base scale; includes the 2/12/20 steps the old scale lacked. */
export const spacing = {
	xxs: 2,
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
	xxxl: 32,
	huge: 48,
} as const;

export const radii = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	full: 999,
} as const;

export const typography = {
	caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400" },
	caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
	footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
	subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
	body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
	headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
	title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
	title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
	title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
	largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
} as const;

export const motion = {
	duration: { fast: 150, base: 250, morph: 300, slow: 400 },
	/** Morph curve from the adopted bottom-bar decision record. */
	morphBezier: [0.25, 0.1, 0.25, 1] as const,
	spring: {
		snappy: { damping: 20, stiffness: 300 },
		/** Velocity-fed page transitions (UI-PAGES decision record). */
		page: { damping: 15, mass: 0.5, stiffness: 100, overshootClamping: false },
		gentle: { damping: 18, stiffness: 120 },
	},
} as const;

const shared = { spacing, radii, typography, motion } as const;

export const darkTheme = { colors: darkColors, ...shared } as const;
export const lightTheme = { colors: lightColors, ...shared } as const;

export type AppTheme = typeof darkTheme;
