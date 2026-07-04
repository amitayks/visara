/**
 * AlbumsPage — pager page 1 (albums-experience spec).
 *
 * Sections: Smart Albums (label-derived, live counts, zero-count hidden) and
 * My Albums (custom albums, drag-reorder persisted to Album.sortOrder).
 *
 * Reorder notes (design risk R4): the list lives in reanimated-dnd's own
 * Sortable container (useFlatList={false} → its plain animated ScrollView),
 * NEVER nested in a plain ScrollView, so no nested-VirtualizedList warning.
 * The old tree's bug — a written-but-never-wired move handler — is fixed by
 * passing onMove/onDrop into each SortableItem: onMove tracks displacement in
 * a ref during the drag (no React state churn mid-drag — a data change would
 * remount the Sortable via its data-hash key), and onDrop commits the final
 * order to state and persists it through AlbumRepository.
 */

import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AlbumRepository } from "@services/database/AlbumRepository";
import {
	Dialog,
	EmptyState,
	Icon,
	IconButton,
	Menu,
	PressableScale,
	Skeleton,
	Text,
	toast,
} from "@ui/components";
import { StyleSheet, useAppTheme } from "@ui/theme";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import {
	Sortable,
	SortableItem,
	type SortableRenderItemProps,
} from "react-native-reanimated-dnd";
import {
	type CustomAlbumEntry,
	createCustomAlbum,
	normalizeAlbumName,
	persistAlbumOrder,
	type SmartAlbumEntry,
	useAlbumsPageData,
} from "./albumsData";
import type { SmartAlbumDef } from "./smartAlbums";
import type { AlbumsNavParams } from "./types";

type AlbumsNav = NativeStackNavigationProp<AlbumsNavParams>;

/** Fixed slot height required by Sortable's absolute item positioning. */
const ALBUM_ROW_CONTENT = 64;
const ALBUM_ROW_HEIGHT = 76; // content + spacing.md gap
const SMART_CARD_SIZE = 116;
const ROW_COVER_SIZE = 48;

function formatCount(count: number): string {
	return count === 1 ? "1 item" : `${count} items`;
}

export function AlbumsPage() {
	const navigation = useNavigation<AlbumsNav>();
	const { theme } = useAppTheme();
	const { smart, custom, ready } = useAlbumsPageData();

	// Local ordered copy backing the Sortable; optimistic on drop, re-synced
	// from the DB-derived dataset on every recompute.
	const [ordered, setOrdered] = useState<CustomAlbumEntry[]>([]);
	const orderRef = useRef<CustomAlbumEntry[]>([]);
	useEffect(() => {
		setOrdered(custom);
		orderRef.current = custom;
	}, [custom]);

	const [menuFor, setMenuFor] = useState<string | null>(null);
	const [createVisible, setCreateVisible] = useState(false);
	const [renameTarget, setRenameTarget] = useState<CustomAlbumEntry | null>(
		null,
	);
	const [deleteTarget, setDeleteTarget] = useState<CustomAlbumEntry | null>(
		null,
	);
	const [nameDraft, setNameDraft] = useState("");
	const [nameError, setNameError] = useState(false);

	const visibleSmart = smart.filter((entry) => entry.count > 0);
	const isEmpty = ready && visibleSmart.length === 0 && ordered.length === 0;

	// ---- Navigation ---------------------------------------------------------

	const handleOpenAlbum = useCallback(
		(entry: CustomAlbumEntry) => {
			navigation.navigate("AlbumDetail", { albumId: entry.album.id });
		},
		[navigation],
	);

	const handleOpenSmart = useCallback(
		(def: SmartAlbumDef) => {
			navigation.navigate("AlbumDetail", { smartLabel: def.key });
		},
		[navigation],
	);

	// ---- Reorder (the wired move handler + persistence) ---------------------

	const handleAlbumMove = useCallback(
		(id: string, _from: number, to: number) => {
			const ids = orderRef.current.map((entry) => entry.id);
			const fromIndex = ids.indexOf(id);
			if (fromIndex === -1) {
				return;
			}
			ids.splice(fromIndex, 1);
			ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
			const byId = new Map(orderRef.current.map((entry) => [entry.id, entry]));
			orderRef.current = ids.flatMap((entryId) => {
				const entry = byId.get(entryId);
				return entry ? [entry] : [];
			});
		},
		[],
	);

	const commitOrder = useCallback((orderedIds: readonly string[]) => {
		const byId = new Map(orderRef.current.map((entry) => [entry.id, entry]));
		const next: CustomAlbumEntry[] = [];
		for (const id of orderedIds) {
			const entry = byId.get(id);
			if (entry) {
				next.push(entry);
				byId.delete(id);
			}
		}
		// Anything the drop payload missed keeps its relative position.
		for (const entry of orderRef.current) {
			if (byId.has(entry.id)) {
				next.push(entry);
			}
		}
		orderRef.current = next;
		setOrdered(next);
		void persistAlbumOrder(next.map((entry) => entry.album)).catch((error) => {
			console.warn("albums: order persist failed", error);
			toast.error("Couldn't save album order");
		});
	}, []);

	const handleAlbumDrop = useCallback(
		(
			_id: string,
			_position: number,
			allPositions?: { [id: string]: number },
		) => {
			if (allPositions) {
				const ids = Object.keys(allPositions).sort(
					(a, b) => (allPositions[a] ?? 0) - (allPositions[b] ?? 0),
				);
				commitOrder(ids);
				return;
			}
			commitOrder(orderRef.current.map((entry) => entry.id));
		},
		[commitOrder],
	);

	// ---- Lifecycle dialogs ---------------------------------------------------

	const openCreate = useCallback(() => {
		setNameDraft("");
		setNameError(false);
		setCreateVisible(true);
	}, []);

	const startRename = useCallback((entry: CustomAlbumEntry) => {
		setNameDraft(entry.album.name);
		setNameError(false);
		setRenameTarget(entry);
	}, []);

	const startDelete = useCallback((entry: CustomAlbumEntry) => {
		setDeleteTarget(entry);
	}, []);

	const closeNameDialogs = useCallback(() => {
		setCreateVisible(false);
		setRenameTarget(null);
		setNameDraft("");
		setNameError(false);
	}, []);

	const handleDraftChange = useCallback((value: string) => {
		setNameDraft(value);
		setNameError(false);
	}, []);

	const confirmCreate = useCallback(() => {
		const name = normalizeAlbumName(nameDraft);
		if (!name) {
			// Invalid name: stay in the dialog (spec scenario).
			setNameError(true);
			return;
		}
		closeNameDialogs();
		void (async () => {
			try {
				await createCustomAlbum(name);
				toast.success(`Created "${name}"`);
			} catch (error) {
				console.warn("albums: create failed", error);
				toast.error("Couldn't create album");
			}
		})();
	}, [nameDraft, closeNameDialogs]);

	const confirmRename = useCallback(() => {
		const target = renameTarget;
		const name = normalizeAlbumName(nameDraft);
		if (!name) {
			setNameError(true);
			return;
		}
		closeNameDialogs();
		if (!target || name === target.album.name) {
			return;
		}
		void (async () => {
			try {
				await AlbumRepository.update(target.album, { name });
				toast.success(`Renamed to "${name}"`);
			} catch (error) {
				console.warn("albums: rename failed", error);
				toast.error("Couldn't rename album");
			}
		})();
	}, [renameTarget, nameDraft, closeNameDialogs]);

	const confirmDelete = useCallback(() => {
		const target = deleteTarget;
		setDeleteTarget(null);
		if (!target) {
			return;
		}
		void (async () => {
			try {
				await AlbumRepository.delete(target.album);
				toast.success(`Deleted "${target.album.name}"`);
			} catch (error) {
				console.warn("albums: delete failed", error);
				toast.error("Couldn't delete album");
			}
		})();
	}, [deleteTarget]);

	// ---- Menu ----------------------------------------------------------------

	const handleMenuOpen = useCallback((id: string) => {
		setMenuFor(id);
	}, []);

	const handleMenuDismiss = useCallback(() => {
		setMenuFor(null);
	}, []);

	// ---- Sortable rendering ---------------------------------------------------

	const renderSortableItem = useCallback(
		(props: SortableRenderItemProps<CustomAlbumEntry>) => {
			const {
				item,
				id,
				positions,
				lowerBound,
				autoScrollDirection,
				itemsCount,
				itemHeight,
			} = props;
			return (
				<SortableItem
					key={id}
					id={id}
					data={item}
					positions={positions}
					lowerBound={lowerBound}
					autoScrollDirection={autoScrollDirection}
					itemsCount={itemsCount}
					itemHeight={itemHeight}
					onMove={handleAlbumMove}
					onDrop={handleAlbumDrop}
				>
					<CustomAlbumRow
						entry={item}
						menuOpen={menuFor === item.id}
						onOpen={handleOpenAlbum}
						onMenuOpen={handleMenuOpen}
						onMenuDismiss={handleMenuDismiss}
						onRename={startRename}
						onDelete={startDelete}
					/>
				</SortableItem>
			);
		},
		[
			menuFor,
			handleAlbumMove,
			handleAlbumDrop,
			handleOpenAlbum,
			handleMenuOpen,
			handleMenuDismiss,
			startRename,
			startDelete,
		],
	);

	// ---- Name field (shared by create/rename dialogs) -------------------------

	const renderNameField = (onSubmit: () => void) => (
		<View style={styles.nameField}>
			<TextInput
				value={nameDraft}
				onChangeText={handleDraftChange}
				placeholder="Album name"
				placeholderTextColor={theme.colors.textTertiary}
				selectionColor={theme.colors.accent}
				style={styles.nameInput}
				autoFocus
				maxLength={60}
				returnKeyType="done"
				onSubmitEditing={onSubmit}
				accessibilityLabel="Album name"
			/>
			{nameError ? (
				<Text variant="footnote" color="danger">
					Enter an album name.
				</Text>
			) : null}
		</View>
	);

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text variant="largeTitle">Albums</Text>
				<IconButton
					icon="plus"
					onPress={openCreate}
					accessibilityLabel="Create album"
					testID="albums-create"
				/>
			</View>

			{!ready ? (
				<View style={styles.loading}>
					<Skeleton height={SMART_CARD_SIZE} />
					<Skeleton height={ALBUM_ROW_CONTENT} />
					<Skeleton height={ALBUM_ROW_CONTENT} />
				</View>
			) : isEmpty ? (
				<EmptyState
					icon="folder-multiple-image"
					title="No albums yet"
					message="Create an album, or let smart albums appear as your photos are analyzed."
					action={{ label: "Create album", onPress: openCreate }}
					testID="albums-empty"
				/>
			) : (
				<>
					{visibleSmart.length > 0 ? (
						<View style={styles.smartSection}>
							<Text variant="headline" style={styles.sectionTitle}>
								Smart Albums
							</Text>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.smartRowContent}
							>
								{visibleSmart.map((entry) => (
									<SmartAlbumCard
										key={entry.def.key}
										entry={entry}
										onPress={handleOpenSmart}
									/>
								))}
							</ScrollView>
						</View>
					) : null}

					<Text variant="headline" style={styles.sectionTitle}>
						My Albums
					</Text>
					{ordered.length === 0 ? (
						<View style={styles.noCustom}>
							<Icon name="folder-plus-outline" color="textTertiary" />
							<Text variant="subhead" color="textSecondary">
								No albums yet — tap + to create one.
							</Text>
						</View>
					) : (
						<View style={styles.sortableWrap}>
							<Sortable
								data={ordered}
								renderItem={renderSortableItem}
								itemHeight={ALBUM_ROW_HEIGHT}
								useFlatList={false}
								style={styles.sortable}
							/>
						</View>
					)}
				</>
			)}

			<Dialog
				visible={createVisible}
				title="New album"
				confirmLabel="Create"
				onConfirm={confirmCreate}
				onCancel={closeNameDialogs}
			>
				{createVisible ? renderNameField(confirmCreate) : null}
			</Dialog>

			<Dialog
				visible={renameTarget !== null}
				title="Rename album"
				confirmLabel="Rename"
				onConfirm={confirmRename}
				onCancel={closeNameDialogs}
			>
				{renameTarget !== null ? renderNameField(confirmRename) : null}
			</Dialog>

			<Dialog
				visible={deleteTarget !== null}
				title={
					deleteTarget ? `Delete "${deleteTarget.album.name}"?` : "Delete album"
				}
				message="The album is removed; its photos stay in your library and on this device."
				confirmLabel="Delete"
				destructive
				onConfirm={confirmDelete}
				onCancel={() => setDeleteTarget(null)}
			/>
		</View>
	);
}

// ---- Row & card components ---------------------------------------------------

interface SmartAlbumCardProps {
	entry: SmartAlbumEntry;
	onPress: (def: SmartAlbumDef) => void;
}

function SmartAlbumCard({ entry, onPress }: SmartAlbumCardProps) {
	return (
		<PressableScale
			onPress={() => onPress(entry.def)}
			style={styles.smartCard}
			accessibilityRole="button"
			accessibilityLabel={`${entry.def.title}, ${formatCount(entry.count)}`}
			testID={`smart-album-${entry.def.key}`}
		>
			<AlbumCover uri={entry.coverUri} icon={entry.def.icon} variant="card" />
			<Text variant="subhead" numberOfLines={1}>
				{entry.def.title}
			</Text>
			<Text variant="caption" color="textSecondary">
				{formatCount(entry.count)}
			</Text>
		</PressableScale>
	);
}

interface CustomAlbumRowProps {
	entry: CustomAlbumEntry;
	menuOpen: boolean;
	onOpen: (entry: CustomAlbumEntry) => void;
	onMenuOpen: (id: string) => void;
	onMenuDismiss: () => void;
	onRename: (entry: CustomAlbumEntry) => void;
	onDelete: (entry: CustomAlbumEntry) => void;
}

function CustomAlbumRow({
	entry,
	menuOpen,
	onOpen,
	onMenuOpen,
	onMenuDismiss,
	onRename,
	onDelete,
}: CustomAlbumRowProps) {
	return (
		<View style={styles.albumRow} testID={`album-row-${entry.id}`}>
			<PressableScale
				onPress={() => onOpen(entry)}
				style={styles.albumRowMain}
				accessibilityRole="button"
				accessibilityLabel={`${entry.album.name}, ${formatCount(entry.count)}`}
			>
				<AlbumCover uri={entry.coverUri} icon="folder-image" variant="row" />
				<View style={styles.albumRowTexts}>
					<Text variant="headline" numberOfLines={1}>
						{entry.album.name}
					</Text>
					<Text variant="footnote" color="textSecondary">
						{formatCount(entry.count)}
					</Text>
				</View>
			</PressableScale>
			<Menu
				visible={menuOpen}
				anchor={
					<IconButton
						icon="dots-vertical"
						onPress={() => onMenuOpen(entry.id)}
						color="textSecondary"
						accessibilityLabel={`Options for ${entry.album.name}`}
					/>
				}
				items={[
					{
						label: "Rename",
						icon: "pencil-outline",
						onPress: () => onRename(entry),
					},
					{
						label: "Delete",
						icon: "delete-outline",
						destructive: true,
						onPress: () => onDelete(entry),
					},
				]}
				onDismiss={onMenuDismiss}
			/>
		</View>
	);
}

interface AlbumCoverProps {
	uri: string | null;
	icon: string;
	variant: "card" | "row";
}

function AlbumCover({ uri, icon, variant }: AlbumCoverProps) {
	return (
		<View style={styles.cover(variant)}>
			{uri ? (
				<Image
					source={{ uri }}
					style={styles.coverImage}
					contentFit="cover"
					recyclingKey={uri}
				/>
			) : (
				<Icon name={icon} color="textTertiary" />
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
		paddingTop: rt.insets.top + theme.spacing.sm,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing.lg,
		paddingBottom: theme.spacing.sm,
	},
	loading: {
		flex: 1,
		gap: theme.spacing.md,
		padding: theme.spacing.lg,
	},
	sectionTitle: {
		paddingHorizontal: theme.spacing.lg,
		paddingTop: theme.spacing.xs,
		paddingBottom: theme.spacing.sm,
	},
	smartSection: {
		marginBottom: theme.spacing.md,
	},
	smartRowContent: {
		paddingHorizontal: theme.spacing.lg,
		gap: theme.spacing.md,
	},
	smartCard: {
		width: SMART_CARD_SIZE,
		gap: theme.spacing.xxs,
	},
	noCustom: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.sm,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
	},
	// The Sortable's own container (never a plain ScrollView). Bottom margin
	// keeps the last row clear of the shell's floating bottom bar.
	sortableWrap: {
		flex: 1,
		paddingHorizontal: theme.spacing.lg,
		marginBottom: rt.insets.bottom + theme.spacing.huge + theme.spacing.xxl,
	},
	// Overrides the library's hardcoded white scroll-view background.
	sortable: {
		backgroundColor: theme.colors.background,
	},
	albumRow: {
		height: ALBUM_ROW_CONTENT,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.xs,
		paddingLeft: theme.spacing.sm,
		paddingRight: theme.spacing.xs,
		borderRadius: theme.radii.lg,
		backgroundColor: theme.colors.surfaceElevated,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
	},
	albumRowMain: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
	},
	albumRowTexts: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
	cover: (variant: "card" | "row") => ({
		width: variant === "card" ? SMART_CARD_SIZE : ROW_COVER_SIZE,
		height: variant === "card" ? SMART_CARD_SIZE : ROW_COVER_SIZE,
		borderRadius: theme.radii.md,
		backgroundColor: theme.colors.thumbnailPlaceholder,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		overflow: "hidden" as const,
	}),
	coverImage: {
		width: "100%",
		height: "100%",
	},
	nameField: {
		gap: theme.spacing.xs,
	},
	nameInput: {
		...theme.typography.body,
		color: theme.colors.textPrimary,
		backgroundColor: theme.colors.surface,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.sm,
		paddingHorizontal: theme.spacing.md,
		paddingVertical: theme.spacing.sm,
	},
}));
