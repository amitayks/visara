/**
 * ListItem primitive — a settings/list row: leading icon, title/subtitle,
 * trailing node (or an automatic chevron when pressable).
 */

import { StyleSheet } from "@ui/theme";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface ListItemProps {
	title: string;
	subtitle?: string;
	/** Material Design Icons glyph name. */
	leadingIcon?: string;
	trailing?: ReactNode;
	onPress?: () => void;
	destructive?: boolean;
	testID?: string;
}

export function ListItem({
	title,
	subtitle,
	leadingIcon,
	trailing,
	onPress,
	destructive = false,
	testID,
}: ListItemProps) {
	const content = (
		<>
			{leadingIcon ? (
				<Icon name={leadingIcon} color={destructive ? "danger" : "accent"} />
			) : null}
			<View style={styles.texts}>
				<Text
					variant="body"
					color={destructive ? "danger" : "textPrimary"}
					numberOfLines={1}
				>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="footnote" color="textSecondary" numberOfLines={2}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{trailing ??
				(onPress ? <Icon name="chevron-right" color="textTertiary" /> : null)}
		</>
	);

	if (!onPress) {
		return (
			<View style={styles.row} testID={testID}>
				{content}
			</View>
		);
	}

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
			accessibilityRole="button"
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			testID={testID}
		>
			{content}
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
		minHeight: theme.spacing.huge,
	},
	rowPressed: {
		backgroundColor: theme.colors.surfacePressed,
	},
	texts: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
}));
