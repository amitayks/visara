import { Thumbnail } from "@components/atoms/Thumbnail";
import { DateSectionHeader } from "@components/molecules/DateSectionHeader";
import type { MediaFile } from "@models/MediaFile";
import { FlashList } from "@shopify/flash-list";
import { Spacing } from "@theme/colors";
import { useCallback, useMemo } from "react";
import {
	Dimensions,
	Pressable,
	StyleSheet,
	View,
	type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

interface DateSection {
	type: "header";
	label: string;
	itemCount: number;
}

interface MediaItem {
	type: "media";
	data: MediaFile;
}

type GridItem = DateSection | MediaItem;

interface PhotoGridProps {
	mediaFiles: MediaFile[];
	columns: 3 | 4 | 11;
	onMediaPress: (media: MediaFile, index: number) => void;
	onZoomChange?: (newColumns: 3 | 4 | 11) => void;
	style?: ViewStyle;
	testID?: string;
}

export function PhotoGrid({
	mediaFiles,
	columns,
	onMediaPress,
	onZoomChange,
	style,
	testID,
}: PhotoGridProps) {
	const screenWidth = Dimensions.get("window").width;
	const spacing = Spacing.xs;
	const itemSize = (screenWidth - spacing * (columns + 1)) / columns;

	// Group media by date sections
	const groupedData = useMemo(() => {
		const groups: GridItem[] = [];
		const sections = new Map<string, MediaFile[]>();

		// Group by date
		mediaFiles.forEach((media) => {
			const date = new Date(media.creationDate);
			const today = new Date();
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);

			let label: string;
			if (columns === 11) {
				// Monthly sections for 11 columns
				label = date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
				});
			} else {
				// Daily sections for 3/4 columns
				if (date.toDateString() === today.toDateString()) {
					label = "Today";
				} else if (date.toDateString() === yesterday.toDateString()) {
					label = "Yesterday";
				} else {
					label = date.toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
					});
				}
			}

			if (!sections.has(label)) {
				sections.set(label, []);
			}
			sections.get(label)?.push(media);
		});

		// Convert to flat list with headers
		sections.forEach((items, label) => {
			groups.push({
				type: "header",
				label,
				itemCount: items.length,
			});
			items.forEach((item) => {
				groups.push({
					type: "media",
					data: item,
				});
			});
		});

		return groups;
	}, [mediaFiles, columns]);

	// Pinch-to-zoom gesture
	const pinchGesture = Gesture.Pinch().onEnd((event) => {
		if (!onZoomChange) return;

		if (event.scale > 1.2) {
			// Zoom in (more columns)
			if (columns === 3) onZoomChange(4);
			else if (columns === 4) onZoomChange(11);
		} else if (event.scale < 0.8) {
			// Zoom out (fewer columns)
			if (columns === 11) onZoomChange(4);
			else if (columns === 4) onZoomChange(3);
		}
	});

	const renderItem = useCallback(
		({ item }: { item: GridItem }) => {
			if (item.type === "header") {
				return (
					<DateSectionHeader
						label={item.label}
						itemCount={item.itemCount}
						style={styles.sectionHeader}
					/>
				);
			}

			// Media item
			const mediaIndex = mediaFiles.findIndex((m) => m.id === item.data.id);

			return (
				<Pressable
					onPress={() => onMediaPress(item.data, mediaIndex)}
					style={[styles.mediaItem, { width: itemSize, height: itemSize }]}
				>
					<Thumbnail
						uri={item.data.thumbnailUri}
						size={itemSize}
						aspectRatio={1}
						showLoader={true}
					/>
				</Pressable>
			);
		},
		[itemSize, mediaFiles, onMediaPress],
	);

	const getItemType = useCallback((item: GridItem) => {
		return item.type === "header" ? "sectionHeader" : "row";
	}, []);

	return (
		<GestureDetector gesture={pinchGesture}>
			<View style={[styles.container, style]} testID={testID}>
				<FlashList
					data={groupedData}
					renderItem={renderItem}
					numColumns={columns}
					key={`grid-${columns}`}
					getItemType={getItemType}
					contentContainerStyle={styles.contentContainer}
					showsVerticalScrollIndicator={true}
				/>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	contentContainer: {
		paddingHorizontal: Spacing.xs,
		paddingTop: Spacing.xs,
	},
	sectionHeader: {
		width: "100%",
	},
	mediaItem: {
		padding: Spacing.xs / 2,
	},
});
