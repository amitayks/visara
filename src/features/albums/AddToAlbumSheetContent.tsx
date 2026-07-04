/**
 * AddToAlbumSheetContent — pinned export consumed by the viewer's Info sheet.
 *
 * Lists the user's custom albums as add targets (smart albums are predicate-
 * derived and never offered) plus an inline "New album" flow sharing the
 * Albums-page name validation. Adding is idempotent: re-adding to an album
 * the photo already belongs to never creates a duplicate membership.
 */

import type { Album } from "@models/Album";
import type { MediaFile } from "@models/MediaFile";
import { AlbumRepository } from "@services/database/AlbumRepository";
import { Button, Icon, ListItem, Text, toast } from "@ui/components";
import { StyleSheet, useAppTheme } from "@ui/theme";
import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import {
	addMediaToAlbumIdempotent,
	createCustomAlbum,
	normalizeAlbumName,
} from "./albumsData";

export interface AddToAlbumSheetContentProps {
	media: MediaFile;
	onDone: () => void;
}

export function AddToAlbumSheetContent({
	media,
	onDone,
}: AddToAlbumSheetContentProps) {
	const { theme } = useAppTheme();
	const [albums, setAlbums] = useState<Album[] | null>(null);
	const [memberOf, setMemberOf] = useState<ReadonlySet<string>>(new Set());
	const [creating, setCreating] = useState(false);
	const [nameDraft, setNameDraft] = useState("");
	const [nameError, setNameError] = useState(false);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [manual, memberships] = await Promise.all([
					AlbumRepository.getManualAlbums(),
					AlbumRepository.getAlbumsForMediaFile(media.id),
				]);
				if (cancelled) {
					return;
				}
				setAlbums(manual);
				setMemberOf(new Set(memberships.map((album) => album.id)));
			} catch (error) {
				console.warn("add-to-album: load failed", error);
				toast.error("Couldn't load albums");
				if (!cancelled) {
					setAlbums([]);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [media.id]);

	const handlePick = (album: Album) => {
		if (busy) {
			return;
		}
		if (memberOf.has(album.id)) {
			toast(`Already in "${album.name}"`);
			onDone();
			return;
		}
		setBusy(true);
		void (async () => {
			try {
				await addMediaToAlbumIdempotent(album.id, media.id);
				toast.success(`Added to "${album.name}"`);
				onDone();
			} catch (error) {
				console.warn("add-to-album: add failed", error);
				toast.error("Couldn't add to album");
				setBusy(false);
			}
		})();
	};

	const handleCreateAndAdd = () => {
		if (busy) {
			return;
		}
		const name = normalizeAlbumName(nameDraft);
		if (!name) {
			// Same validation as the Albums-page dialog: stay in the flow.
			setNameError(true);
			return;
		}
		setBusy(true);
		void (async () => {
			try {
				const album = await createCustomAlbum(name);
				await addMediaToAlbumIdempotent(album.id, media.id);
				toast.success(`Added to "${name}"`);
				onDone();
			} catch (error) {
				console.warn("add-to-album: create failed", error);
				toast.error("Couldn't create album");
				setBusy(false);
			}
		})();
	};

	return (
		<View style={styles.container} testID="add-to-album-sheet">
			<Text variant="title3" style={styles.title}>
				Add to album
			</Text>

			{albums === null ? (
				<Text variant="subhead" color="textSecondary" style={styles.hint}>
					Loading albums…
				</Text>
			) : (
				<ScrollView
					style={styles.list}
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
				>
					{albums.length === 0 ? (
						<Text variant="subhead" color="textSecondary" style={styles.hint}>
							No albums yet — create one below.
						</Text>
					) : (
						albums.map((album) => (
							<ListItem
								key={album.id}
								title={album.name}
								leadingIcon="folder-image"
								trailing={
									memberOf.has(album.id) ? (
										<Icon name="check" color="accent" />
									) : undefined
								}
								onPress={() => handlePick(album)}
								testID={`add-to-album-${album.id}`}
							/>
						))
					)}
				</ScrollView>
			)}

			{creating ? (
				<View style={styles.createRow}>
					<TextInput
						value={nameDraft}
						onChangeText={(value) => {
							setNameDraft(value);
							setNameError(false);
						}}
						placeholder="Album name"
						placeholderTextColor={theme.colors.textTertiary}
						selectionColor={theme.colors.accent}
						style={styles.nameInput}
						autoFocus
						maxLength={60}
						returnKeyType="done"
						onSubmitEditing={handleCreateAndAdd}
						accessibilityLabel="New album name"
					/>
					{nameError ? (
						<Text variant="footnote" color="danger">
							Enter an album name.
						</Text>
					) : null}
					<Button
						title="Create and add"
						onPress={handleCreateAndAdd}
						disabled={busy}
						icon="folder-plus-outline"
					/>
				</View>
			) : (
				<ListItem
					title="New album…"
					leadingIcon="folder-plus-outline"
					onPress={() => setCreating(true)}
					testID="add-to-album-new"
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	container: {
		paddingHorizontal: theme.spacing.sm,
		paddingTop: theme.spacing.lg,
		paddingBottom: rt.insets.bottom + theme.spacing.xl,
		gap: theme.spacing.sm,
	},
	title: {
		paddingHorizontal: theme.spacing.sm,
	},
	hint: {
		paddingHorizontal: theme.spacing.sm,
		paddingVertical: theme.spacing.md,
	},
	list: {
		flexGrow: 0,
		maxHeight: rt.screen.height * 0.4,
	},
	createRow: {
		gap: theme.spacing.sm,
		paddingHorizontal: theme.spacing.sm,
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
