import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { useSettingsStore } from "@state/settingsStore";
import {
	StyleSheet,
	type ThemeMode,
	useAppTheme,
} from "@ui/theme";
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	withSpring,
} from "react-native-reanimated";
import { useAnimatedTheme } from "react-native-unistyles/reanimated";

const MODES: ThemeMode[] = ["light", "dark", "system"];

/**
 * Phase-0 spike gate (tasks 1.3, design D1): exercises unistyles theme
 * flips, variants, worklet theme access, and TrueSheet on RN 0.86.
 * Deleted before cutover.
 */
export function UnistylesSpike() {
	const { theme, rt } = useAppTheme();
	const mode = useSettingsStore((s) => s.theme);
	const setTheme = useSettingsStore((s) => s.setTheme);
	const sheetRef = useRef<TrueSheet>(null);
	const animatedTheme = useAnimatedTheme();

	const workletStyle = useAnimatedStyle(() => ({
		backgroundColor: animatedTheme.value.colors.accent,
		transform: [{ scale: withSpring(1) }],
	}));

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Unistyles spike</Text>
			<Text style={styles.subtitle}>
				resolved: {rt.themeName} | mode: {mode} | adaptive:{" "}
				{String(rt.hasAdaptiveThemes)}
			</Text>
			<View style={styles.row}>
				{MODES.map((m) => (
					<Pressable
						key={m}
						onPress={() => setTheme(m)}
						style={[styles.chip, mode === m && styles.chipActive]}
					>
						<Text style={styles.chipText}>{m}</Text>
					</Pressable>
				))}
			</View>
			<Animated.View style={[styles.workletBox, workletStyle]}>
				<Text style={styles.boxText}>worklet theme box</Text>
			</Animated.View>
			<Pressable
				style={styles.chip}
				onPress={() => sheetRef.current?.present()}
			>
				<Text style={styles.chipText}>open TrueSheet</Text>
			</Pressable>
			<TrueSheet ref={sheetRef} detents={["auto", 1]} cornerRadius={theme.radii.lg}>
				<ScrollView style={styles.sheetScroll} nestedScrollEnabled>
					{Array.from({ length: 30 }, (_, i) => (
						<Text key={`row-${i + 1}`} style={styles.sheetRow}>
							sheet row {i + 1}
						</Text>
					))}
				</ScrollView>
			</TrueSheet>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing.lg,
	},
	title: {
		color: theme.colors.textPrimary,
		fontSize: theme.typography.title2.fontSize,
		fontWeight: "700",
	},
	subtitle: {
		color: theme.colors.textSecondary,
		fontSize: theme.typography.footnote.fontSize,
	},
	row: { flexDirection: "row", gap: theme.spacing.sm },
	chip: {
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.sm,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.surfaceElevated,
		borderWidth: 1,
		borderColor: theme.colors.border,
	},
	chipActive: {
		backgroundColor: theme.colors.accentMuted,
		borderColor: theme.colors.accent,
	},
	chipText: { color: theme.colors.textPrimary },
	workletBox: {
		width: 180,
		height: 60,
		borderRadius: theme.radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	boxText: { color: theme.colors.textOnAccent, fontWeight: "600" },
	sheetScroll: { padding: theme.spacing.lg },
	sheetRow: {
		color: theme.colors.textPrimary,
		paddingVertical: theme.spacing.md,
	},
}));
