/**
 * Quick-action row for the photo drawer: evenly spread circular tap targets
 * with caption labels (share / album / copy / delete), replacing full-width
 * list rows. Delete is tinted danger.
 */

import { Icon, PressableScale, Text } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { View } from "react-native";

interface QuickAction {
	key: string;
	icon: string;
	label: string;
	danger?: boolean;
	onPress: () => void;
	testID: string;
}

export interface QuickActionsProps {
	onShare: () => void;
	onOpenInGallery: () => void;
	onCopyDetails: () => void;
	onAddToAlbum: () => void;
	onDelete: () => void;
}

export function QuickActions({
	onShare,
	onOpenInGallery,
	onCopyDetails,
	onAddToAlbum,
	onDelete,
}: QuickActionsProps) {
	const actions: QuickAction[] = [
		{
			key: "share",
			icon: "share-variant",
			label: "Share",
			onPress: onShare,
			testID: "drawer-action-share",
		},
		{
			key: "open",
			icon: "open-in-new",
			label: "Open in",
			onPress: onOpenInGallery,
			testID: "drawer-action-open",
		},
		{
			key: "album",
			icon: "folder-plus-outline",
			label: "Album",
			onPress: onAddToAlbum,
			testID: "drawer-action-album",
		},
		{
			key: "copy",
			icon: "content-copy",
			label: "Copy",
			onPress: onCopyDetails,
			testID: "drawer-action-copy",
		},
		{
			key: "delete",
			icon: "delete-outline",
			label: "Delete",
			danger: true,
			onPress: onDelete,
			testID: "drawer-action-delete",
		},
	];

	return (
		<View style={styles.row}>
			{actions.map((action) => (
				<PressableScale
					key={action.key}
					onPress={action.onPress}
					accessibilityLabel={action.label}
					style={styles.action}
					testID={action.testID}
				>
					<View style={styles.circle}>
						<Icon
							name={action.icon}
							color={action.danger ? "danger" : "textPrimary"}
						/>
					</View>
					<Text
						variant="caption"
						color={action.danger ? "danger" : "textSecondary"}
					>
						{action.label}
					</Text>
				</PressableScale>
			))}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
	},
	action: {
		flex: 1,
		alignItems: "center",
		gap: theme.spacing.sm,
	},
	circle: {
		width: 48,
		height: 48,
		borderRadius: theme.radii.full,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.surfacePressed,
	},
}));
