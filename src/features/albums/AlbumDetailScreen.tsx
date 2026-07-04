/**
 * AlbumDetail — native-stack route (params PINNED: {albumId?, smartLabel?}).
 *
 * Scoped photo grid: custom-album memberships OR smart-album label matches,
 * intersected with the live visible library (useVisibleMedia), so deleted or
 * hidden media drop out of the grid and the count immediately. Local grid on
 * purpose — gallery internals are owned by another slice and not imported.
 * Viewer opens via the pinned openPhotoViewer entry with the scoped dataset,
 * so viewer paging stays inside the album.
 */

import { openPhotoViewer } from "@features/viewer";
import type { MediaFile } from "@models/MediaFile";
import {
	type StaticScreenProps,
	useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { removeMedia } from "@services/facade";
import { FlashList } from "@shopify/flash-list";
import { useIsSelected, useSelectionStore } from "@state/selectionStore";
import { useVisibleMedia } from "@state/useVisibleMedia";
import {
	Button,
	Dialog,
	EmptyState,
	Icon,
	iconSizes,
	PressableScale,
	SelectionBar,
	Skeleton,
	toast,
} from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { sharePhoto } from "@utils/photoActions";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useAlbumDetailSource } from "./albumsData";
import { findSmartAlbum } from "./smartAlbums";
import type { AlbumDetailParams, AlbumsNavParams } from "./types";

type AlbumDetailProps = StaticScreenProps<AlbumDetailParams | undefined>;
type AlbumDetailNav = NativeStackNavigationProp<AlbumsNavParams, "AlbumDetail">;

const GRID_COLUMNS = 3;

export function AlbumDetail({ route }: AlbumDetailProps) {
	const { albumId, smartLabel } = route.params ?? {};
	const navigation = useNavigation<AlbumDetailNav>();

	const smartDef = smartLabel ? findSmartAlbum(smartLabel) : null;
	const { memberIds, album } = useAlbumDetailSource(albumId, smartDef);
	const { media, ready } = useVisibleMedia();

	const scoped = useMemo(
		() => (memberIds ? media.filter((item) => memberIds.has(item.id)) : []),
		[media, memberIds],
	);
	const scopedRef = useRef<MediaFile[]>(scoped);
	useEffect(() => {
		scopedRef.current = scoped;
	}, [scoped]);

	const title = smartDef?.title ?? album?.name ?? "Album";
	useEffect(() => {
		navigation.setOptions({ title });
	}, [navigation, title]);

	// Selection state (multi-select parity with gallery-experience).
	const selectionActive = useSelectionStore((s) => s.active);
	const selectionCount = useSelectionStore((s) => s.ids.size);
	const [deleteVisible, setDeleteVisible] = useState(false);

	// Leaving the screen always exits selection mode.
	useEffect(
		() => () => {
			useSelectionStore.getState().clear();
		},
		[],
	);

	const handleCellPress = useCallback((item: MediaFile, index: number) => {
		const selection = useSelectionStore.getState();
		if (selection.active) {
			selection.toggle(item.id);
			return;
		}
		openPhotoViewer(scopedRef.current, index);
	}, []);

	const handleCellLongPress = useCallback((item: MediaFile) => {
		useSelectionStore.getState().enter(item.id);
	}, []);

	const selectedItems = useCallback((): MediaFile[] => {
		const ids = useSelectionStore.getState().ids;
		return scopedRef.current.filter((item) => ids.has(item.id));
	}, []);

	const handleShare = useCallback(() => {
		const items = selectedItems();
		void (async () => {
			try {
				for (const item of items) {
					await sharePhoto(item);
				}
			} catch (error) {
				console.warn("album detail: share failed", error);
				toast.error("Share failed");
			}
		})();
	}, [selectedItems]);

	const handleClearSelection = useCallback(() => {
		useSelectionStore.getState().clear();
	}, []);

	const runDelete = useCallback(
		(permanent: boolean) => {
			setDeleteVisible(false);
			const items = selectedItems();
			useSelectionStore.getState().clear();
			void (async () => {
				let failed = 0;
				for (const item of items) {
					try {
						await removeMedia(item, { permanent });
					} catch (error) {
						failed += 1;
						console.warn("album detail: delete failed", error);
					}
				}
				if (failed > 0) {
					toast.error(
						failed === 1
							? "Couldn't delete 1 photo"
							: `Couldn't delete ${failed} photos`,
					);
				} else {
					toast.success(
						permanent ? "Deleted from device" : "Removed from Visara",
					);
				}
			})();
		},
		[selectedItems],
	);

	const renderItem = useCallback(
		({ item, index }: { item: MediaFile; index: number }) => (
			<AlbumCell
				media={item}
				index={index}
				onPress={handleCellPress}
				onLongPress={handleCellLongPress}
			/>
		),
		[handleCellPress, handleCellLongPress],
	);

	const loading = !ready || memberIds === null;

	return (
		<View style={styles.container}>
			{loading ? (
				<View style={styles.loading}>
					<Skeleton height={120} />
					<Skeleton height={120} />
					<Skeleton height={120} />
				</View>
			) : scoped.length === 0 ? (
				<EmptyState
					icon="image-off-outline"
					title="Nothing here yet"
					message={
						smartDef
							? `Photos recognized as ${smartDef.title.toLowerCase()} will appear here automatically.`
							: "Add photos to this album from a photo's info sheet."
					}
					testID="album-detail-empty"
				/>
			) : (
				<FlashList
					data={scoped}
					numColumns={GRID_COLUMNS}
					keyExtractor={keyExtractor}
					renderItem={renderItem}
					contentContainerStyle={styles.gridContent}
					testID="album-detail-grid"
				/>
			)}

			{selectionActive ? (
				<SelectionBar
					count={selectionCount}
					onShare={handleShare}
					onDelete={() => setDeleteVisible(true)}
					onClear={handleClearSelection}
				/>
			) : null}

			<Dialog
				visible={deleteVisible}
				title={
					selectionCount === 1
						? "Delete 1 photo?"
						: `Delete ${selectionCount} photos?`
				}
				message="Remove from Visara only, or also delete the files from this device."
				confirmLabel="Remove from app"
				onConfirm={() => runDelete(false)}
				onCancel={() => setDeleteVisible(false)}
			>
				<Button
					title="Delete from device"
					variant="destructive"
					icon="delete-forever"
					onPress={() => runDelete(true)}
				/>
			</Dialog>
		</View>
	);
}

function keyExtractor(item: MediaFile): string {
	return item.id;
}

interface AlbumCellProps {
	media: MediaFile;
	index: number;
	onPress: (item: MediaFile, index: number) => void;
	onLongPress: (item: MediaFile) => void;
}

/** Memoized cell: re-renders only when its own selection membership flips. */
const AlbumCell = memo(function AlbumCell({
	media,
	index,
	onPress,
	onLongPress,
}: AlbumCellProps) {
	const selected = useIsSelected(media.id);

	return (
		<PressableScale
			onPress={() => onPress(media, index)}
			onLongPress={() => onLongPress(media)}
			style={styles.cell}
			accessibilityRole="imagebutton"
			accessibilityLabel={media.filename}
			accessibilityState={{ selected }}
			testID={`album-cell-${media.id}`}
		>
			<View style={styles.cellInner}>
				<Image
					source={{ uri: media.thumbnailUri ?? media.uri }}
					recyclingKey={media.id}
					contentFit="cover"
					style={styles.cellImage}
				/>
				{selected ? (
					<View style={styles.cellScrim}>
						<View style={styles.checkBadge}>
							<Icon name="check" size={iconSizes.sm} color="textOnAccent" />
						</View>
					</View>
				) : null}
			</View>
		</PressableScale>
	);
});

const styles = StyleSheet.create((theme, rt) => ({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	loading: {
		flex: 1,
		gap: theme.spacing.md,
		padding: theme.spacing.lg,
	},
	gridContent: {
		paddingBottom: rt.insets.bottom + theme.spacing.xl,
	},
	cell: {
		flex: 1,
		aspectRatio: 1,
		padding: theme.spacing.xxs / 2,
	},
	cellInner: {
		flex: 1,
		borderRadius: theme.radii.xs,
		overflow: "hidden",
		backgroundColor: theme.colors.thumbnailPlaceholder,
	},
	cellImage: {
		width: "100%",
		height: "100%",
	},
	cellScrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: theme.colors.selectionScrim,
	},
	checkBadge: {
		position: "absolute",
		top: theme.spacing.xs,
		right: theme.spacing.xs,
		backgroundColor: theme.colors.accent,
		borderRadius: theme.radii.full,
		padding: theme.spacing.xxs,
	},
}));
