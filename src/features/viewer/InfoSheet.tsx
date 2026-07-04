/**
 * Info sheet for the CURRENT viewer photo (stale-metadata fix): it subscribes
 * to viewerStore itself, so metadata and every action always target
 * items[index] — never the photo the viewer was opened with. Metadata is
 * (re)loaded on each present for the item displayed at that moment, with real
 * persisted label confidences.
 *
 * Label chip tap = search-experience spec: set the query, activate search
 * mode, dismiss the sheet, close the viewer — inline results become visible.
 */

import { AddToAlbumSheetContent } from "@features/albums";
import { useNavStore } from "@state/navStore";
import { useSearchStore } from "@state/searchStore";
import { useViewerStore } from "@state/viewerStore";
import {
	Chip,
	IconButton,
	ListItem,
	Sheet,
	type SheetRef,
	Skeleton,
	Text,
	toast,
} from "@ui/components";
import { radii, StyleSheet } from "@ui/theme";
import {
	copyPhotoMetadata,
	openInExternalApp,
	sharePhoto,
} from "@utils/photoActions";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ScrollView, View } from "react-native";
import { formatViewerDate } from "./formatDate";
import { loadViewerMetadata, type ViewerMetadata } from "./metadata";

export interface InfoSheetRef {
	present(): void;
	dismiss(): Promise<void>;
}

export interface InfoSheetProps {
	/** Delete is confirmed at screen level (sheet dismisses first). */
	onRequestDelete: () => void;
	/** Closes the whole viewer (navigation.goBack owner is the screen). */
	onRequestClose: () => void;
}

type SheetMode = "info" | "album";

export const InfoSheet = forwardRef<InfoSheetRef, InfoSheetProps>(
	function InfoSheet({ onRequestDelete, onRequestClose }, ref) {
		const sheetRef = useRef<SheetRef>(null);
		const media = useViewerStore((s) => s.items[s.index] ?? null);
		const [active, setActive] = useState(false);
		const [mode, setMode] = useState<SheetMode>("info");
		const [meta, setMeta] = useState<ViewerMetadata | null>(null);

		useImperativeHandle(
			ref,
			() => ({
				present: () => {
					setMode("info");
					setActive(true);
					void sheetRef.current?.present();
				},
				dismiss: () => sheetRef.current?.dismiss() ?? Promise.resolve(),
			}),
			[],
		);

		// Load metadata for the item displayed when the sheet opens; reload if
		// the displayed item changes while open (e.g. viewer advanced).
		useEffect(() => {
			if (!active || !media) return;
			let cancelled = false;
			setMeta(null);
			loadViewerMetadata(media.id)
				.then((loaded) => {
					if (!cancelled) setMeta(loaded);
				})
				.catch(() => {
					if (!cancelled) {
						setMeta({ labels: [], ocrText: null });
						toast.error("Couldn't load photo details");
					}
				});
			return () => {
				cancelled = true;
			};
		}, [active, media]);

		const handleDismissed = useCallback(() => {
			setActive(false);
			setMode("info");
			setMeta(null);
		}, []);

		const handleLabelPress = useCallback(
			async (label: string) => {
				useSearchStore.getState().setQuery(label);
				useNavStore.getState().activateSearch();
				await (sheetRef.current?.dismiss() ?? Promise.resolve());
				onRequestClose();
			},
			[onRequestClose],
		);

		const handleShare = useCallback(async () => {
			if (!media) return;
			try {
				await sharePhoto(media);
			} catch {
				toast.error("Couldn't share photo");
			}
		}, [media]);

		const handleCopy = useCallback(async () => {
			if (!meta) return;
			try {
				await copyPhotoMetadata(
					meta.labels.map((l) => l.label),
					meta.ocrText,
				);
				toast.success("Details copied to clipboard");
			} catch {
				toast.error("No details to copy yet");
			}
		}, [meta]);

		const handleOpenExternal = useCallback(async () => {
			if (!media) return;
			try {
				await openInExternalApp(media);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Couldn't open photo",
				);
			}
		}, [media]);

		const handleAlbumDone = useCallback(() => {
			setMode("info");
			void sheetRef.current?.dismiss();
		}, []);

		return (
			<Sheet
				ref={sheetRef}
				detents={[0.6, 0.95]}
				scrollable
				onDismiss={handleDismissed}
				testID="viewer-info-sheet"
			>
				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.scrollContent}
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
				>
					{media == null ? null : mode === "album" ? (
						<View style={styles.albumPane}>
							<View style={styles.albumHeader}>
								<IconButton
									icon="arrow-left"
									onPress={() => setMode("info")}
									accessibilityLabel="Back to photo info"
									testID="info-sheet-album-back"
								/>
								<Text variant="headline">Add to album</Text>
							</View>
							<AddToAlbumSheetContent media={media} onDone={handleAlbumDone} />
						</View>
					) : (
						<>
							<View style={styles.header}>
								<Text variant="title3" numberOfLines={1}>
									{media.filename}
								</Text>
								<Text variant="footnote" color="textSecondary">
									{formatViewerDate(media.creationDate)}
								</Text>
							</View>

							<View style={styles.section}>
								<Text variant="footnote" color="textSecondary">
									Labels
								</Text>
								{meta == null ? (
									<View style={styles.chipRow}>
										<Skeleton width={104} height={28} radius={radii.full} />
										<Skeleton width={88} height={28} radius={radii.full} />
										<Skeleton width={120} height={28} radius={radii.full} />
									</View>
								) : meta.labels.length > 0 ? (
									<View style={styles.chipRow}>
										{meta.labels.map((label) => (
											<Chip
												key={label.id}
												label={`${label.label} · ${Math.round(label.confidence * 100)}%`}
												icon="label-outline"
												onPress={() => {
													void handleLabelPress(label.label);
												}}
												testID={`info-label-${label.label}`}
											/>
										))}
									</View>
								) : (
									<Text variant="footnote" color="textTertiary">
										{media.isProcessed
											? "No labels detected"
											: "Not analyzed yet"}
									</Text>
								)}
							</View>

							{meta?.ocrText ? (
								<View style={styles.section}>
									<Text variant="footnote" color="textSecondary">
										Text in photo
									</Text>
									<Text variant="subhead" selectable>
										{meta.ocrText}
									</Text>
								</View>
							) : null}

							<View style={styles.actions}>
								<ListItem
									title="Share"
									leadingIcon="share-variant"
									onPress={() => {
										void handleShare();
									}}
									testID="info-action-share"
								/>
								<ListItem
									title="Copy details"
									leadingIcon="content-copy"
									onPress={() => {
										void handleCopy();
									}}
									testID="info-action-copy"
								/>
								<ListItem
									title="Open in another app"
									leadingIcon="open-in-new"
									onPress={() => {
										void handleOpenExternal();
									}}
									testID="info-action-open"
								/>
								<ListItem
									title="Add to album"
									leadingIcon="folder-plus-outline"
									onPress={() => setMode("album")}
									testID="info-action-album"
								/>
								<ListItem
									title="Delete"
									leadingIcon="delete-outline"
									destructive
									onPress={onRequestDelete}
									testID="info-action-delete"
								/>
							</View>
						</>
					)}
				</ScrollView>
			</Sheet>
		);
	},
);

const styles = StyleSheet.create((theme, rt) => ({
	scroll: {
		maxHeight: rt.screen.height * 0.85,
	},
	scrollContent: {
		padding: theme.spacing.xl,
		paddingBottom: rt.insets.bottom + theme.spacing.xxl,
		gap: theme.spacing.xl,
	},
	header: {
		gap: theme.spacing.xxs,
	},
	section: {
		gap: theme.spacing.sm,
	},
	chipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing.sm,
	},
	actions: {
		marginHorizontal: -theme.spacing.lg,
	},
	albumPane: {
		gap: theme.spacing.md,
	},
	albumHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
	},
}));
