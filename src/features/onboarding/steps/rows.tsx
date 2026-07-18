/**
 * Onboarding content rows. RowCard is the recessed container (same card
 * language as the photo drawer). FeatureRow carries the story steps;
 * TaskRow renders a setup-checklist entry whose trailing status glyph
 * pops in with a spring when its task settles (done / attention).
 */

import { Icon, Text } from "@ui/components";
import { motion, StyleSheet, useAppTheme } from "@ui/theme";
import { type ReactNode, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import type { SetupTaskStatus } from "../useSetupSequence";

export type RowTint = "accent" | "success" | "warning" | "danger";

export function RowCard({ children }: { children: ReactNode }) {
	return <View style={styles.card}>{children}</View>;
}

export interface FeatureRowProps {
	/** Material Design Icons glyph name. */
	icon: string;
	title: string;
	note?: string;
	tint?: RowTint;
}

export function FeatureRow({
	icon,
	title,
	note,
	tint = "accent",
}: FeatureRowProps) {
	return (
		<View style={styles.row}>
			<View style={styles.glyph(tint)}>
				<Icon name={icon} size={20} color={tint} />
			</View>
			<View style={styles.rowBody}>
				<Text variant="headline">{title}</Text>
				{note ? (
					<Text variant="footnote" color="textSecondary">
						{note}
					</Text>
				) : null}
			</View>
		</View>
	);
}

/** Trailing status glyph: springs in whenever the settled state changes. */
function StatusGlyph({ status }: { status: SetupTaskStatus }) {
	const { theme } = useAppTheme();
	const pop = useSharedValue(status === "pending" ? 1 : 0);

	useEffect(() => {
		if (status === "done" || status === "attention") {
			pop.value = 0;
			pop.value = withSpring(1, motion.spring.snappy);
		} else {
			pop.value = 1;
		}
	}, [status, pop]);

	const popStyle = useAnimatedStyle(() => ({
		opacity: pop.value,
		transform: [{ scale: 0.4 + 0.6 * pop.value }],
	}));

	if (status === "active") {
		return <ActivityIndicator size="small" color={theme.colors.accent} />;
	}
	return (
		<Animated.View style={popStyle}>
			{status === "done" ? (
				<Icon name="check-circle" size={24} color="success" />
			) : status === "attention" ? (
				<Icon name="alert-circle" size={24} color="warning" />
			) : (
				<Icon name="circle-outline" size={24} color="textTertiary" />
			)}
		</Animated.View>
	);
}

export interface TaskRowProps {
	/** Material Design Icons glyph name. */
	icon: string;
	title: string;
	note: string;
	status: SetupTaskStatus;
}

export function TaskRow({ icon, title, note, status }: TaskRowProps) {
	const tint: RowTint =
		status === "done"
			? "success"
			: status === "attention"
				? "warning"
				: "accent";
	return (
		<View style={styles.row}>
			<View style={styles.glyph(tint)}>
				<Icon name={icon} size={20} color={tint} />
			</View>
			<View style={styles.rowBody}>
				<Text variant="headline">{title}</Text>
				<Text variant="footnote" color="textSecondary">
					{note}
				</Text>
			</View>
			<View style={styles.status}>
				<StatusGlyph status={status} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	card: {
		backgroundColor: theme.colors.surface,
		borderRadius: theme.radii.lg,
		padding: theme.spacing.lg,
		gap: theme.spacing.lg,
	},
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: theme.spacing.md,
	},
	glyph: (tint: RowTint) => ({
		width: 36,
		height: 36,
		borderRadius: theme.radii.md,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		backgroundColor:
			tint === "accent" ? theme.colors.accentMuted : `${theme.colors[tint]}26`,
	}),
	rowBody: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
	status: {
		alignSelf: "center",
		width: 28,
		alignItems: "center",
	},
}));
