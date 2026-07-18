/**
 * Info pane of the photo drawer — pure presentation for one photo's story:
 * filename/date header, the enrichment caption + description ("About"), tag
 * chips, transcribed in-photo text, and the action list. All data arrives via
 * props; the drawer shell resolves which photo everything targets.
 */

import type { MediaRow as MediaFile } from "@backend/types";
import { Chip, ListItem, Skeleton, Text } from "@ui/components";
import { radii, StyleSheet } from "@ui/theme";
import { View } from "react-native";
import { formatViewerDate } from "../formatDate";
import type { DrawerMetadata } from "./useDrawerMetadata";

export interface InfoPaneProps {
	media: MediaFile;
	/** `null` while metadata is loading (skeletons render). */
	metadata: DrawerMetadata | null;
	onTagPress: (tag: string) => void;
	onShare: () => void;
	onCopyDetails: () => void;
	onAddToAlbum: () => void;
	onDelete: () => void;
}

export function InfoPane({
	media,
	metadata,
	onTagPress,
	onShare,
	onCopyDetails,
	onAddToAlbum,
	onDelete,
}: InfoPaneProps) {
	const hasAbout =
		metadata != null &&
		(metadata.caption != null || metadata.description != null);

	return (
		<View style={styles.root}>
			<View style={styles.header}>
				<Text variant="title3" numberOfLines={1}>
					{media.filename}
				</Text>
				<Text variant="footnote" color="textSecondary">
					{formatViewerDate(media.creationDate)}
				</Text>
			</View>

			{hasAbout ? (
				<View style={styles.section}>
					<Text variant="footnote" color="textSecondary">
						About
					</Text>
					{metadata.caption != null ? (
						<Text variant="subhead" selectable testID="drawer-caption">
							{metadata.caption}
						</Text>
					) : null}
					{metadata.description != null ? (
						<Text
							variant="footnote"
							color="textSecondary"
							selectable
							testID="drawer-description"
						>
							{metadata.description}
						</Text>
					) : null}
				</View>
			) : null}

			<View style={styles.section}>
				<Text variant="footnote" color="textSecondary">
					Tags
				</Text>
				{metadata == null ? (
					<View style={styles.chipRow}>
						<Skeleton width={104} height={28} radius={radii.full} />
						<Skeleton width={88} height={28} radius={radii.full} />
						<Skeleton width={120} height={28} radius={radii.full} />
					</View>
				) : metadata.tags.length > 0 ? (
					<View style={styles.chipRow}>
						{metadata.tags.map((tag) => (
							<Chip
								key={tag}
								label={tag}
								icon="label-outline"
								onPress={() => onTagPress(tag)}
								testID={`drawer-tag-${tag}`}
							/>
						))}
					</View>
				) : (
					<Text variant="footnote" color="textTertiary">
						{media.isProcessed ? "No tags detected" : "Not analyzed yet"}
					</Text>
				)}
			</View>

			{metadata?.ocrText ? (
				<View style={styles.section}>
					<Text variant="footnote" color="textSecondary">
						Text in photo
					</Text>
					<Text variant="subhead" selectable>
						{metadata.ocrText}
					</Text>
				</View>
			) : null}

			<View style={styles.actions}>
				<ListItem
					title="Share"
					leadingIcon="share-variant"
					onPress={onShare}
					testID="drawer-action-share"
				/>
				<ListItem
					title="Copy details"
					leadingIcon="content-copy"
					onPress={onCopyDetails}
					testID="drawer-action-copy"
				/>
				<ListItem
					title="Add to album"
					leadingIcon="folder-plus-outline"
					onPress={onAddToAlbum}
					testID="drawer-action-album"
				/>
				<ListItem
					title="Delete"
					leadingIcon="delete-outline"
					destructive
					onPress={onDelete}
					testID="drawer-action-delete"
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
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
}));
