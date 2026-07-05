/**
 * Gallery grid cell — O(1) render work regardless of library size
 * (gallery-experience spec): the dataset index arrives as a prop (never a
 * findIndex), selection is a per-id store subscription so only flipped cells
 * re-render, and React.memo skips re-renders on reference-stable Model
 * instances across data emissions.
 */

import type { MediaRow as MediaFile } from "@backend/types";
import { useIsSelected } from "@state/selectionStore";
import { Icon, iconSizes, PressableScale } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { Image } from "expo-image";
import { memo } from "react";
import { View } from "react-native";
import { PDF_MIME_TYPE } from "./gridSections";

export interface GalleryCellProps {
	media: MediaFile;
	/** Index within the displayed media array (viewer start index). */
	mediaIndex: number;
	onPress: (media: MediaFile, mediaIndex: number) => void;
	onLongPress: (media: MediaFile) => void;
}

function GalleryCellInner({
	media,
	mediaIndex,
	onPress,
	onLongPress,
}: GalleryCellProps) {
	const selected = useIsSelected(media.id);
	const isDocumentTile =
		media.mimeType === PDF_MIME_TYPE && !media.thumbnailUri;

	return (
		<PressableScale
			onPress={() => onPress(media, mediaIndex)}
			onLongPress={() => onLongPress(media)}
			style={styles.cell}
			accessibilityRole="imagebutton"
			accessibilityLabel={media.filename}
			accessibilityState={{ selected }}
			testID={`gallery-cell-${media.id}`}
		>
			{isDocumentTile ? (
				<View style={styles.documentTile}>
					<Icon
						name="file-document-outline"
						size={iconSizes.md}
						color="textSecondary"
					/>
				</View>
			) : (
				<Image
					source={{ uri: media.thumbnailUri ?? media.uri }}
					recyclingKey={media.id}
					contentFit="cover"
					cachePolicy="memory-disk"
					style={styles.image}
				/>
			)}
			{selected ? (
				<View style={styles.scrim}>
					<View style={styles.checkBadge}>
						<Icon name="check" size={iconSizes.sm} color="textOnAccent" />
					</View>
				</View>
			) : null}
		</PressableScale>
	);
}

/**
 * Default shallow compare: `media` is a reference-stable WatermelonDB Model,
 * `mediaIndex` a number, and both handlers are stable callbacks in
 * GalleryGrid — so unchanged cells skip entirely on data emissions.
 */
export const GalleryCell = memo(GalleryCellInner);

const styles = StyleSheet.create((theme) => ({
	cell: {
		width: "100%",
		aspectRatio: 1,
		padding: theme.spacing.xxs / 2,
	},
	image: {
		flex: 1,
		backgroundColor: theme.colors.thumbnailPlaceholder,
	},
	documentTile: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.surfaceElevated,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
	},
	scrim: {
		position: "absolute",
		top: theme.spacing.xxs / 2,
		left: theme.spacing.xxs / 2,
		right: theme.spacing.xxs / 2,
		bottom: theme.spacing.xxs / 2,
		backgroundColor: theme.colors.selectionScrim,
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "flex-start",
	},
	checkBadge: {
		margin: theme.spacing.xs,
		padding: theme.spacing.xxs,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.accent,
	},
}));
