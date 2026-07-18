/**
 * Card container for the photo drawer's sections: recessed surface, rounded
 * corners, and an accent icon + uppercase-label header row. Purely visual.
 */

import { Icon, Text } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import type { ReactNode } from "react";
import { View } from "react-native";

export interface DrawerCardProps {
	/** Material Design Icons glyph name for the header. */
	icon: string;
	title: string;
	children?: ReactNode;
	testID?: string;
}

export function DrawerCard({ icon, title, children, testID }: DrawerCardProps) {
	return (
		<View style={styles.card} testID={testID}>
			<View style={styles.header}>
				<Icon name={icon} size={16} color="accent" />
				<Text variant="caption" color="textSecondary" style={styles.label}>
					{title.toUpperCase()}
				</Text>
			</View>
			{children}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	card: {
		backgroundColor: theme.colors.surface,
		borderRadius: theme.radii.lg,
		padding: theme.spacing.lg,
		gap: theme.spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.sm,
	},
	label: {
		letterSpacing: 1.2,
	},
}));
