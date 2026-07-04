/**
 * Drain progress surface (gallery-experience spec): processed/total counts +
 * current activity while the pipeline drains. Only THIS component re-renders
 * on processingStore snapshots — grid cells never see progress events — and
 * the bar itself animates from the `processingProgress` SharedValue with zero
 * React re-renders.
 */

import { processingProgress, useProcessingStore } from "@state/processingStore";
import { ProgressBar, Text } from "@ui/components";
import { motion, StyleSheet } from "@ui/theme";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

export function DrainProgress() {
	const isProcessing = useProcessingStore((s) => s.isProcessing);
	const isPaused = useProcessingStore((s) => s.isPaused);
	const processed = useProcessingStore((s) => s.processed);
	const total = useProcessingStore((s) => s.total);
	const currentFileName = useProcessingStore((s) => s.currentFileName);

	if (!isProcessing) return null;

	const counts = total > 0 ? `${processed}/${total}` : null;
	const label = isPaused
		? counts
			? `Paused ${counts}`
			: "Paused"
		: counts
			? `Processing ${counts}`
			: "Preparing library…";

	return (
		<Animated.View
			entering={FadeIn.duration(motion.duration.fast)}
			exiting={FadeOut.duration(motion.duration.fast)}
			style={styles.pill}
			testID="drain-progress"
		>
			<Text variant="caption" color="textSecondary" numberOfLines={1}>
				{label}
			</Text>
			{currentFileName ? (
				<Text variant="caption2" color="textTertiary" numberOfLines={1}>
					{currentFileName}
				</Text>
			) : null}
			<ProgressBar progress={processingProgress} testID="drain-progress-bar" />
		</Animated.View>
	);
}

const styles = StyleSheet.create((theme) => ({
	pill: {
		minWidth: "50%",
		maxWidth: "80%",
		gap: theme.spacing.xxs,
		paddingHorizontal: theme.spacing.md,
		paddingVertical: theme.spacing.sm,
		borderRadius: theme.radii.lg,
		backgroundColor: theme.colors.surfaceElevated,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
	},
}));
