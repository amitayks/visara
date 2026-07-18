/**
 * Album pane of the photo drawer — the add-to-album flow presented inside the
 * drawer with a back affordance returning to the info pane. The list/create
 * content itself is the pinned albums-experience export.
 */

import type { MediaRow as MediaFile } from "@backend/types";
import { AddToAlbumSheetContent } from "@features/albums";
import { IconButton, Text } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { View } from "react-native";

export interface AlbumPaneProps {
	media: MediaFile;
	onBack: () => void;
	onDone: () => void;
}

export function AlbumPane({ media, onBack, onDone }: AlbumPaneProps) {
	return (
		<View style={styles.root}>
			<View style={styles.header}>
				<IconButton
					icon="arrow-left"
					onPress={onBack}
					accessibilityLabel="Back to photo info"
					testID="drawer-album-back"
				/>
				<Text variant="title3">Add to album</Text>
			</View>
			<AddToAlbumSheetContent media={media} onDone={onDone} />
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		gap: theme.spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
	},
}));
