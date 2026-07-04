/**
 * Date-sectioned photo grid on FlashList v2 (gallery-experience spec).
 *
 * Fixes the mapped defects of the old PhotoGrid:
 * - column changes update `numColumns` in place — NO key-based remount, so
 *   list identity and scroll position survive a zoom (v2 keeps
 *   maintainVisibleContentPosition on by default);
 * - section headers span the full row via `overrideItemLayout` span (never a
 *   styled cell occupying one column slot);
 * - cells receive their dataset index as a prop (no per-cell findIndex).
 *
 * Pinch (GH3 declarative) steps 3/4/11 through settingsStore, the single
 * persisted owner of the zoom level.
 */

import { openPhotoViewer } from "@features/viewer/openPhotoViewer";
import type { MediaFile } from "@models/MediaFile";
import { FlashList } from "@shopify/flash-list";
import { useSelectionStore } from "@state/selectionStore";
import { useSettingsStore } from "@state/settingsStore";
import { Text } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { GalleryCell } from "./GalleryCell";
import {
	buildGridData,
	type GridItem,
	granularityForColumns,
	nextZoomLevel,
	zoomDirectionForScale,
} from "./gridSections";

export interface GalleryGridProps {
	/** The displayed dataset (gallery, document filter, or search results). */
	items: MediaFile[];
}

const SectionHeader = memo(function SectionHeader({
	label,
	count,
}: {
	label: string;
	count: number;
}) {
	return (
		<View style={styles.header}>
			<Text variant="headline">{label}</Text>
			<Text variant="footnote" color="textTertiary">
				{count}
			</Text>
		</View>
	);
});

export function GalleryGrid({ items }: GalleryGridProps) {
	const columns = useSettingsStore((s) => s.gridZoomLevel);
	const granularity = granularityForColumns(columns);

	const gridData = useMemo(
		() => buildGridData(items, granularity),
		[items, granularity],
	);

	// Latest displayed dataset for the stable press handlers: the viewer must
	// open on exactly the array the tapped cell belongs to.
	const itemsRef = useRef(items);
	useEffect(() => {
		itemsRef.current = items;
	}, [items]);

	const handlePress = useCallback((media: MediaFile, mediaIndex: number) => {
		const selection = useSelectionStore.getState();
		if (selection.active) {
			selection.toggle(media.id);
			return;
		}
		openPhotoViewer(itemsRef.current, mediaIndex);
	}, []);

	const handleLongPress = useCallback((media: MediaFile) => {
		const selection = useSelectionStore.getState();
		if (selection.active) {
			selection.toggle(media.id);
		} else {
			selection.enter(media.id);
		}
	}, []);

	const renderItem = useCallback(
		({ item }: { item: GridItem }) => {
			if (item.type === "header") {
				return <SectionHeader label={item.label} count={item.count} />;
			}
			return (
				<GalleryCell
					media={item.media}
					mediaIndex={item.mediaIndex}
					onPress={handlePress}
					onLongPress={handleLongPress}
				/>
			);
		},
		[handlePress, handleLongPress],
	);

	const keyExtractor = useCallback((item: GridItem) => item.key, []);

	const getItemType = useCallback((item: GridItem) => item.type, []);

	const overrideItemLayout = useCallback(
		(
			layout: { span?: number },
			item: GridItem,
			_index: number,
			maxColumns: number,
		) => {
			if (item.type === "header") {
				layout.span = maxColumns;
			}
		},
		[],
	);

	const pinchGesture = useMemo(
		() =>
			Gesture.Pinch()
				.runOnJS(true)
				.onEnd((event) => {
					const direction = zoomDirectionForScale(event.scale);
					if (direction === null) return;
					const { gridZoomLevel, setGridZoomLevel } =
						useSettingsStore.getState();
					const next = nextZoomLevel(gridZoomLevel, direction);
					if (next !== gridZoomLevel) {
						setGridZoomLevel(next);
					}
				}),
		[],
	);

	return (
		<GestureDetector gesture={pinchGesture}>
			<View style={styles.container} testID="gallery-grid">
				<FlashList
					data={gridData}
					renderItem={renderItem}
					numColumns={columns}
					keyExtractor={keyExtractor}
					getItemType={getItemType}
					overrideItemLayout={overrideItemLayout}
					contentContainerStyle={styles.content}
					showsVerticalScrollIndicator
				/>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	container: {
		flex: 1,
	},
	content: {
		paddingTop: rt.insets.top + theme.spacing.xs,
		// Clears the floating bottom bar + selection bar overlays.
		paddingBottom: rt.insets.bottom + theme.spacing.huge * 2,
	},
	header: {
		width: "100%",
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing.md,
		paddingTop: theme.spacing.xl,
		paddingBottom: theme.spacing.sm,
	},
}));
