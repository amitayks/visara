import { AlbumCard } from "@components/molecules/AlbumCard";
import type { Album } from "@models/Album";
import { Spacing } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useEffect, useState } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { DropProvider, Sortable } from "react-native-reanimated-dnd";

export interface AlbumData {
	id: string; // Required by react-native-reanimated-dnd
	album: Album;
	coverImageUri?: string;
	itemCount: number;
}

interface SortableRenderItemProps {
	item: AlbumData;
	id: string;
	positions: SharedValue<Record<string, number>>;
	itemsCount: number;
}

interface AlbumListProps {
	albums: AlbumData[];
	onAlbumPress: (album: Album) => void;
	onAlbumReorder?: (albums: AlbumData[]) => void;
	emptyMessage?: string;
	style?: ViewStyle;
	testID?: string;
}

export function AlbumList({
	albums,
	onAlbumPress,
	onAlbumReorder,
	emptyMessage = "No albums yet",
	style,
	testID,
}: AlbumListProps) {
	const { colors } = useTheme();
	const [localAlbums, setLocalAlbums] = useState(albums);

	// Sync local state with props when albums change
	useEffect(() => {
		setLocalAlbums(albums);
	}, [albums]);

	const handleMove = useCallback(
		(_itemId: string, fromIndex: number, toIndex: number) => {
			const newAlbums = [...localAlbums];
			const [movedAlbum] = newAlbums.splice(fromIndex, 1);
			newAlbums.splice(toIndex, 0, movedAlbum);

			setLocalAlbums(newAlbums);
			if (onAlbumReorder) {
				onAlbumReorder(newAlbums);
			}
		},
		[localAlbums, onAlbumReorder],
	);

	const renderSortableItem = useCallback(
		({ item }: SortableRenderItemProps) => {
			return (
				// key needed here: Sortable's non-virtualized path (useFlatList={false})
				// maps items without assigning keys to what renderItem returns.
				<View key={item.id} style={styles.albumCardWrapper}>
					<AlbumCard
						coverImageUri={item.coverImageUri}
						name={item.album.name}
						itemCount={item.itemCount}
						onPress={() => onAlbumPress(item.album)}
						style={styles.albumCard}
					/>
				</View>
			);
		},
		[onAlbumPress, handleMove],
	);

	const renderEmpty = () => (
		<View style={styles.emptyContainer}>
			<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
				{emptyMessage}
			</Text>
		</View>
	);

	if (albums.length === 0) {
		return (
			<View style={[styles.container, style]} testID={testID}>
				{renderEmpty()}
			</View>
		);
	}

	return (
		<View style={[styles.container, style]} testID={testID}>
			<DropProvider>
				{onAlbumReorder ? (
					// Sortable scrolls itself — nesting it in the outer ScrollView put a
					// VirtualizedList inside a same-orientation plain ScrollView (RN 0.86
					// warns and windowing breaks). useFlatList={false} renders its plain
					// animated ScrollView instead; album counts are small, virtualization
					// buys nothing here.
					<View style={styles.sortableContainer}>
						<Sortable
							data={localAlbums}
							renderItem={renderSortableItem}
							itemHeight={180}
							useFlatList={false}
						/>
					</View>
				) : (
					<ScrollView
						contentContainerStyle={styles.contentContainer}
						showsVerticalScrollIndicator={true}
					>
						<View style={styles.grid}>
							{albums.map((item) => (
								<View key={item.id} style={styles.albumCardWrapper}>
									<AlbumCard
										coverImageUri={item.coverImageUri}
										name={item.album.name}
										itemCount={item.itemCount}
										onPress={() => onAlbumPress(item.album)}
										style={styles.albumCard}
									/>
								</View>
							))}
						</View>
					</ScrollView>
				)}
			</DropProvider>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	sortableContainer: {
		flex: 1,
		paddingHorizontal: Spacing.sm,
		paddingTop: Spacing.sm,
	},
	contentContainer: {
		paddingHorizontal: Spacing.sm,
		paddingTop: Spacing.sm,
		paddingBottom: Spacing.xl,
	},
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
	},
	albumCardWrapper: {
		width: "48%",
		marginBottom: Spacing.md,
	},
	albumCard: {
		width: "100%",
	},
	emptyContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: Spacing.xxl * 2,
	},
	emptyText: {
		fontSize: 16,
		textAlign: "center",
	},
});
