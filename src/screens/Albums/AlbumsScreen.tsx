import { AlbumList, type AlbumData } from "@components/organisms/AlbumList";
import type { Album } from "@models/Album";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@components/atoms/Icon";

export function AlbumsScreen() {
	const { colors } = useTheme();

	// TODO: Replace with actual albums from database
	const [albums, setAlbums] = useState<AlbumData[]>([
		{
			id: "1",
			album: {
				id: "1",
				name: "Receipts & Bills",
				isSmart: true,
			} as Album,
			coverImageUri: undefined,
			itemCount: 0,
		},
		{
			id: "2",
			album: {
				id: "2",
				name: "Screenshots",
				isSmart: true,
			} as Album,
			coverImageUri: undefined,
			itemCount: 0,
		},
		{
			id: "3",
			album: {
				id: "3",
				name: "Documents",
				isSmart: true,
			} as Album,
			coverImageUri: undefined,
			itemCount: 0,
		},
		{
			id: "4",
			album: {
				id: "4",
				name: "ID Cards",
				isSmart: true,
			} as Album,
			coverImageUri: undefined,
			itemCount: 0,
		},
		{
			id: "5",
			album: {
				id: "5",
				name: "Handwritten Notes",
				isSmart: true,
			} as Album,
			coverImageUri: undefined,
			itemCount: 0,
		},
	]);

	// Handle album press - open album contents
	const handleAlbumPress = useCallback((album: Album) => {
		// TODO: Navigate to album contents view
		console.log("Album pressed:", album.name);
	}, []);

	// Handle album reorder
	const handleAlbumReorder = useCallback((reorderedAlbums: AlbumData[]) => {
		setAlbums(reorderedAlbums);
		// TODO: Persist new album order to database
		console.log("Albums reordered");
	}, []);

	// Handle back navigation
	const handleBackPress = useCallback(() => {
		// TODO: Navigate back to gallery
		console.log("Back pressed");
	}, []);

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }]}
			edges={["top", "bottom"]}
		>
			{/* Header */}
			<View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
				<Pressable
					onPress={handleBackPress}
					style={styles.backButton}
					hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
				>
					<Icon name="arrow-left" size="medium" color={colors.text} />
				</Pressable>

				<Text style={[styles.headerTitle, { color: colors.text }]}>
					Albums
				</Text>

				<View style={styles.headerRight} />
			</View>

			{/* Albums List */}
			<AlbumList
				albums={albums}
				onAlbumPress={handleAlbumPress}
				onAlbumReorder={handleAlbumReorder}
				emptyMessage="No albums yet. Create your first album by starring photos!"
				style={styles.albumList}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm,
		borderBottomWidth: 1,
	},
	backButton: {
		padding: Spacing.xs,
	},
	headerTitle: {
		fontSize: Typography.fontSize.xxl,
		fontWeight: Typography.fontWeight.bold,
	},
	headerRight: {
		width: 40, // Balance for back button
	},
	albumList: {
		flex: 1,
	},
});
