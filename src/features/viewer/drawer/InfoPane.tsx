/**
 * Info pane of the photo drawer — card layout: date hero header, circular
 * quick-action row, then AI summary / tags / in-photo text / file details as
 * recessed cards. Pure presentation; the drawer shell resolves which photo
 * everything targets.
 */

import type { MediaRow as MediaFile } from "@backend/types";
import { Chip, Skeleton, Text } from "@ui/components";
import { radii, StyleSheet } from "@ui/theme";
import { View } from "react-native";
import { DrawerCard } from "./DrawerCard";
import { formatBytes, formatDrawerDate } from "./format";
import { QuickActions } from "./QuickActions";
import type { DrawerMetadata } from "./useDrawerMetadata";

export interface InfoPaneProps {
	media: MediaFile;
	/** `null` while metadata is loading (skeletons render). */
	metadata: DrawerMetadata | null;
	onTagPress: (tag: string) => void;
	onShare: () => void;
	onOpenInGallery: () => void;
	onCopyDetails: () => void;
	onAddToAlbum: () => void;
	onDelete: () => void;
}

export function InfoPane({
	media,
	metadata,
	onTagPress,
	onShare,
	onOpenInGallery,
	onCopyDetails,
	onAddToAlbum,
	onDelete,
}: InfoPaneProps) {
	const date = formatDrawerDate(media.creationDate);
	const size = formatBytes(media.fileSize);
	const hasAbout =
		metadata != null &&
		(metadata.caption != null || metadata.description != null);

	return (
		<View style={styles.root}>
			<View style={styles.header}>
				<Text variant="title2" numberOfLines={1}>
					{date ? date.title : media.filename}
				</Text>
				{date ? (
					<Text variant="footnote" color="textSecondary">
						{date.time}
					</Text>
				) : null}
			</View>

			<QuickActions
				onShare={onShare}
				onOpenInGallery={onOpenInGallery}
				onCopyDetails={onCopyDetails}
				onAddToAlbum={onAddToAlbum}
				onDelete={onDelete}
			/>

			{hasAbout ? (
				<DrawerCard icon="creation" title="AI summary" testID="drawer-card-ai">
					{metadata.caption != null ? (
						<Text variant="headline" selectable testID="drawer-caption">
							{metadata.caption}
						</Text>
					) : null}
					{metadata.description != null ? (
						<Text
							variant="subhead"
							color="textSecondary"
							selectable
							testID="drawer-description"
						>
							{metadata.description}
						</Text>
					) : null}
				</DrawerCard>
			) : null}

			<DrawerCard icon="tag-outline" title="Tags" testID="drawer-card-tags">
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
			</DrawerCard>

			{metadata?.ocrText ? (
				<DrawerCard icon="text-recognition" title="Text in photo">
					<Text variant="subhead" selectable>
						{metadata.ocrText}
					</Text>
				</DrawerCard>
			) : null}

			<DrawerCard
				icon="information-outline"
				title="Details"
				testID="drawer-card-details"
			>
				<DetailRow label="Name" value={media.filename} />
				{media.width > 0 && media.height > 0 ? (
					<DetailRow
						label="Dimensions"
						value={`${media.width} × ${media.height}`}
					/>
				) : null}
				{size != null ? <DetailRow label="Size" value={size} /> : null}
			</DrawerCard>
		</View>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.detailRow}>
			<Text variant="footnote" color="textSecondary">
				{label}
			</Text>
			<Text variant="footnote" numberOfLines={1} style={styles.detailValue}>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		gap: theme.spacing.lg,
	},
	header: {
		gap: theme.spacing.xxs,
	},
	chipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing.sm,
	},
	detailRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing.lg,
	},
	detailValue: {
		flexShrink: 1,
		textAlign: "right",
	},
}));
