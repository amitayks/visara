/**
 * PhotoInfoDrawer — the drawer presented over the viewer for the CURRENT
 * photo. It subscribes to viewerStore itself, so its content and every action
 * always target items[index] — never the photo the viewer was opened with —
 * and paging the viewer while the drawer is open re-loads metadata for the
 * newly displayed photo (gallery-experience spec).
 *
 * Presentation goes through the design-system Sheet primitive (TrueSheet,
 * ui-design-system spec) — lifecycle resolves via native callbacks, no
 * timer-based close races. Tag chip tap = search-experience spec: set the
 * query, activate search mode, dismiss the drawer, close the viewer so the
 * inline results become visible.
 */

import { useNavStore } from "@state/navStore";
import { useSearchStore } from "@state/searchStore";
import { useViewerStore } from "@state/viewerStore";
import { Sheet, type SheetRef, toast } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { copyPhotoMetadata, sharePhoto } from "@utils/photoActions";
import {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ScrollView } from "react-native";
import { AlbumPane } from "./AlbumPane";
import { InfoPane } from "./InfoPane";
import { useDrawerMetadata } from "./useDrawerMetadata";

export interface PhotoInfoDrawerRef {
	present(): void;
	dismiss(): Promise<void>;
}

export interface PhotoInfoDrawerProps {
	/** Delete is confirmed at screen level (the drawer dismisses first). */
	onRequestDelete: () => void;
	/** Closes the whole viewer (navigation.goBack owner is the screen). */
	onRequestClose: () => void;
}

type Pane = "info" | "albums";

export const PhotoInfoDrawer = forwardRef<
	PhotoInfoDrawerRef,
	PhotoInfoDrawerProps
>(function PhotoInfoDrawer({ onRequestDelete, onRequestClose }, ref) {
	const sheetRef = useRef<SheetRef>(null);
	const media = useViewerStore((s) => s.items[s.index] ?? null);
	const [open, setOpen] = useState(false);
	const [pane, setPane] = useState<Pane>("info");
	const metadata = useDrawerMetadata(open && media != null ? media.id : null);

	useImperativeHandle(
		ref,
		() => ({
			present: () => {
				setPane("info");
				setOpen(true);
				void sheetRef.current?.present();
			},
			dismiss: () => sheetRef.current?.dismiss() ?? Promise.resolve(),
		}),
		[],
	);

	const handleDismissed = useCallback(() => {
		setOpen(false);
		setPane("info");
	}, []);

	const handleTagPress = useCallback(
		async (tag: string) => {
			useSearchStore.getState().setQuery(tag);
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

	const handleCopyDetails = useCallback(async () => {
		if (!metadata) return;
		try {
			await copyPhotoMetadata(metadata.tags, metadata.ocrText);
			toast.success("Details copied to clipboard");
		} catch {
			toast.error("No details to copy yet");
		}
	}, [metadata]);

	const handleAlbumDone = useCallback(() => {
		setPane("info");
		void sheetRef.current?.dismiss();
	}, []);

	return (
		<Sheet
			ref={sheetRef}
			detents={[0.6, 0.95]}
			scrollable
			onDismiss={handleDismissed}
			testID="photo-info-drawer"
		>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				nestedScrollEnabled
				showsVerticalScrollIndicator={false}
			>
				{media == null ? null : pane === "albums" ? (
					<AlbumPane
						media={media}
						onBack={() => setPane("info")}
						onDone={handleAlbumDone}
					/>
				) : (
					<InfoPane
						media={media}
						metadata={metadata}
						onTagPress={(tag) => {
							void handleTagPress(tag);
						}}
						onShare={() => {
							void handleShare();
						}}
						onCopyDetails={() => {
							void handleCopyDetails();
						}}
						onAddToAlbum={() => setPane("albums")}
						onDelete={onRequestDelete}
					/>
				)}
			</ScrollView>
		</Sheet>
	);
});

const styles = StyleSheet.create((theme, rt) => ({
	scroll: {
		maxHeight: rt.screen.height * 0.85,
	},
	scrollContent: {
		padding: theme.spacing.xl,
		paddingBottom: rt.insets.bottom + theme.spacing.xxl,
	},
}));
