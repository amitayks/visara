/**
 * Shared content rows for onboarding steps: a recessed RowCard container
 * (same card language as the photo drawer) holding icon rows with a title
 * and supporting note. Tinted rows carry permission/model outcomes.
 */

import { Icon, Text } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import type { ReactNode } from "react";
import { View } from "react-native";

export type RowTint = "accent" | "success" | "warning" | "danger";

export function RowCard({ children }: { children: ReactNode }) {
	return <View style={styles.card}>{children}</View>;
}

export interface InfoRowProps {
	/** Material Design Icons glyph name. */
	icon: string;
	title: string;
	note?: string;
	tint?: RowTint;
}

export function InfoRow({ icon, title, note, tint = "accent" }: InfoRowProps) {
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
}));
