/**
 * ListSection primitive — grouped settings-style section: optional header
 * title, a bordered card of rows with hairline separators, optional footer.
 */

import { StyleSheet } from "@ui/theme";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./Text";

export interface ListSectionProps {
	title?: string;
	footer?: string;
	children?: ReactNode;
}

export function ListSection({ title, footer, children }: ListSectionProps) {
	const items = Children.toArray(children);

	return (
		<View style={styles.section}>
			{title ? (
				<Text variant="footnote" color="textSecondary" style={styles.title}>
					{title.toUpperCase()}
				</Text>
			) : null}
			<View style={styles.card}>
				{items.map((child, index) => (
					<Fragment key={elementKey(child) ?? `separator-${String(index)}`}>
						{index > 0 ? <View style={styles.separator} /> : null}
						{child}
					</Fragment>
				))}
			</View>
			{footer ? (
				<Text variant="footnote" color="textTertiary" style={styles.footer}>
					{footer}
				</Text>
			) : null}
		</View>
	);
}

/** Children.toArray always assigns keys to elements; plain text has none. */
function elementKey(child: ReactNode): string | null {
	return isValidElement(child) && child.key != null ? child.key : null;
}

const styles = StyleSheet.create((theme) => ({
	section: {
		marginBottom: theme.spacing.xxl,
	},
	title: {
		paddingHorizontal: theme.spacing.lg,
		paddingBottom: theme.spacing.sm,
	},
	card: {
		backgroundColor: theme.colors.surfaceElevated,
		borderRadius: theme.radii.lg,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
		overflow: "hidden",
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: theme.colors.separator,
		marginLeft: theme.spacing.lg,
	},
	footer: {
		paddingHorizontal: theme.spacing.lg,
		paddingTop: theme.spacing.sm,
	},
}));
