/**
 * SelectionBar primitive — floating action bar shown while multi-select is
 * active: clear, count, share, delete.
 */

import { motion, StyleSheet } from "@ui/theme";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

export interface SelectionBarProps {
	count: number;
	onShare: () => void;
	onDelete: () => void;
	onClear: () => void;
}

export function SelectionBar({
	count,
	onShare,
	onDelete,
	onClear,
}: SelectionBarProps) {
	return (
		<Animated.View
			entering={FadeIn.duration(motion.duration.fast)}
			exiting={FadeOut.duration(motion.duration.fast)}
			style={styles.bar}
			testID="selection-bar"
		>
			<IconButton
				icon="close"
				onPress={onClear}
				accessibilityLabel="Clear selection"
			/>
			<Text variant="headline" style={styles.count}>
				{count} selected
			</Text>
			<IconButton
				icon="share-variant"
				onPress={onShare}
				accessibilityLabel="Share selected photos"
			/>
			<IconButton
				icon="delete-outline"
				onPress={onDelete}
				color="danger"
				accessibilityLabel="Delete selected photos"
			/>
		</Animated.View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	bar: {
		position: "absolute",
		left: theme.spacing.lg,
		right: theme.spacing.lg,
		bottom: rt.insets.bottom + theme.spacing.huge + theme.spacing.xxxl,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.lg,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.surfaceElevated,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
	},
	count: {
		flex: 1,
	},
}));
