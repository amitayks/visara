/**
 * EmptyState primitive — centered icon + title + optional message/action
 * for empty datasets, denied permissions, and zero search results.
 */

import { StyleSheet } from "@ui/theme";
import { View } from "react-native";
import { Button } from "./Button";
import { Icon, iconSizes } from "./Icon";
import { Text } from "./Text";

export interface EmptyStateProps {
	/** Material Design Icons glyph name. */
	icon: string;
	title: string;
	message?: string;
	action?: { label: string; onPress: () => void };
	testID?: string;
}

export function EmptyState({
	icon,
	title,
	message,
	action,
	testID,
}: EmptyStateProps) {
	return (
		<View style={styles.container} testID={testID}>
			<Icon name={icon} size={iconSizes.xl} color="textTertiary" />
			<Text variant="title3" style={styles.centered}>
				{title}
			</Text>
			{message ? (
				<Text variant="subhead" color="textSecondary" style={styles.centered}>
					{message}
				</Text>
			) : null}
			{action ? (
				<View style={styles.action}>
					<Button
						title={action.label}
						onPress={action.onPress}
						variant="secondary"
					/>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing.md,
		padding: theme.spacing.xxxl,
	},
	centered: {
		textAlign: "center",
	},
	action: {
		marginTop: theme.spacing.sm,
	},
}));
