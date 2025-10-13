import { PhotoGrid } from "@components/organisms/PhotoGrid";
import { PhotoViewerModal } from "@components/organisms/PhotoViewerModal";
import { InfoDrawer } from "@components/organisms/InfoDrawer";
import { useSearch } from "@contexts/SearchContext";
import { useGallery } from "@contexts/GalleryContext";
import type { MediaFile } from "@models/MediaFile";
import { SearchService } from "@services/search/SearchService";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import type { DisplayLabel, DisplayOcrText } from "@shared-types/display";
import {
	deletePhoto,
	sharePhoto,
	copyPhotoMetadata,
	openInExternalApp,
	loadMediaMetadata,
} from "@utils/photoActions";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useState, useEffect } from "react";
import {
	ActivityIndicator,
	Alert,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
	BackHandler,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

interface SearchModeOverlayProps {
	/** Whether the overlay is visible */
	visible: boolean;
	/** Current search query */
	searchQuery: string;
	style?: ViewStyle;
	testID?: string;
}

export function SearchModeOverlay({
	visible,
	searchQuery,
	style,
	testID,
}: SearchModeOverlayProps) {
	const { colors } = useTheme();
	const { state: searchState, dispatch: searchDispatch } = useSearch();
	const { state: galleryState, dispatch: galleryDispatch } = useGallery();

	// Local state for modals/drawers
	const [viewerVisible, setViewerVisible] = useState(false);
	const [infoDrawerVisible, setInfoDrawerVisible] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
	const [selectedLabels, setSelectedLabels] = useState<DisplayLabel[]>([]);
	const [selectedOcrText, setSelectedOcrText] = useState<DisplayOcrText | null>(
		null,
	);

	// Load search index on mount
	useEffect(() => {
		const initializeSearch = async () => {
			const loaded = await SearchService.loadIndex();
			if (!loaded) {
				// Index doesn't exist yet, build it
				await SearchService.index();
			}
		};

		initializeSearch();
	}, []);

	// Perform search when query changes
	useEffect(() => {
		if (!visible) return;

		const performSearch = async () => {
			if (!searchQuery.trim()) {
				searchDispatch({ type: "SET_SEARCH_RESULTS", payload: [] });
				return;
			}

			searchDispatch({ type: "SET_LOADING", payload: true });

			try {
				// Perform search using SearchService
				const searchResults = await SearchService.search(searchQuery);

				// Get full MediaFile objects for the results
				const mediaFiles = await Promise.all(
					searchResults.map(async (result) => {
						const mediaFile = await MediaFileRepository.findById(result.id);
						return mediaFile;
					}),
				);

				// Filter out null results and update state
				const validMediaFiles = mediaFiles.filter(
					(file): file is MediaFile => file !== null,
				);
				searchDispatch({
					type: "SET_SEARCH_RESULTS",
					payload: validMediaFiles,
				});
			} catch (error) {
				console.error("Search error:", error);
				searchDispatch({
					type: "SET_ERROR",
					payload: "Failed to perform search",
				});
			}
		};

		performSearch();
	}, [searchQuery, visible, searchDispatch]);

	// Handle zoom change
	const handleZoomChange = useCallback(
		(newColumns: 3 | 4 | 11) => {
			galleryDispatch({ type: "SET_ZOOM_LEVEL", payload: newColumns });
		},
		[galleryDispatch],
	);

	// Handle media press - open viewer modal
	const handleMediaPress = useCallback(
		async (media: MediaFile, _index: number) => {
			setSelectedMedia(media);
			setViewerVisible(true);

			// Load metadata in the background
			const metadata = await loadMediaMetadata(media.id);
			setSelectedLabels(
				metadata.labels.map((label, index) => ({
					id: `${media.id}-label-${index}`,
					label: label,
					confidence: 0,
				})),
			);
			setSelectedOcrText(
				metadata.ocrText
					? {
							text: metadata.ocrText,
						}
					: null,
			);
		},
		[],
	);

	// Handle viewer swipe up - open info drawer
	const handleViewerSwipeUp = useCallback(() => {
		setInfoDrawerVisible(true);
	}, []);

	// Handle viewer close
	const handleViewerClose = useCallback(() => {
		setViewerVisible(false);
	}, []);

	// Handle info drawer close
	const handleInfoDrawerClose = useCallback(() => {
		setInfoDrawerVisible(false);
	}, []);

	// Handle label press in drawer - search by label
	const handleLabelPress = useCallback(
		(label: string) => {
			searchDispatch({ type: "SET_SEARCH_QUERY", payload: label });
			setInfoDrawerVisible(false);
			// Search will trigger automatically via useEffect
		},
		[searchDispatch],
	);

	// Handle info drawer actions
	const handleDelete = useCallback(async () => {
		if (!selectedMedia) return;

		Alert.alert("Delete Photo", "How would you like to delete this photo?", [
			{
				text: "Cancel",
				style: "cancel",
			},
			{
				text: "Remove from App Only",
				onPress: async () => {
					try {
						await deletePhoto(selectedMedia, false);
						// Remove from gallery
						galleryDispatch({
							type: "REMOVE_MEDIA_FILE",
							payload: selectedMedia.id,
						});
						// Remove from search results
						const updatedResults = searchState.searchResults.filter(
							(media) => media.id !== selectedMedia.id,
						);
						searchDispatch({
							type: "SET_SEARCH_RESULTS",
							payload: updatedResults,
						});
						setInfoDrawerVisible(false);
						setViewerVisible(false);
						Alert.alert("Success", "Photo removed from app");
					} catch (error) {
						Alert.alert("Error", "Failed to remove photo from app");
					}
				},
			},
			{
				text: "Delete Permanently",
				style: "destructive",
				onPress: async () => {
					try {
						await deletePhoto(selectedMedia, true);
						// Remove from gallery
						galleryDispatch({
							type: "REMOVE_MEDIA_FILE",
							payload: selectedMedia.id,
						});
						// Remove from search results
						const updatedResults = searchState.searchResults.filter(
							(media) => media.id !== selectedMedia.id,
						);
						searchDispatch({
							type: "SET_SEARCH_RESULTS",
							payload: updatedResults,
						});
						setInfoDrawerVisible(false);
						setViewerVisible(false);
						Alert.alert("Success", "Photo permanently deleted");
					} catch (error) {
						Alert.alert("Error", "Failed to delete photo permanently");
					}
				},
			},
		]);
	}, [selectedMedia, galleryDispatch, searchDispatch, searchState.searchResults]);

	const handleShare = useCallback(async () => {
		if (!selectedMedia) return;

		try {
			await sharePhoto(selectedMedia);
		} catch (error) {
			Alert.alert("Error", "Failed to share photo");
		}
	}, [selectedMedia]);

	const handleCopy = useCallback(async () => {
		try {
			const labels = selectedLabels.map((label) => label.label);
			const ocrText = selectedOcrText?.text || null;
			await copyPhotoMetadata(labels, ocrText);
			Alert.alert("Success", "Metadata copied to clipboard");
		} catch (error) {
			Alert.alert("Error", "Failed to copy metadata");
		}
	}, [selectedLabels, selectedOcrText]);

	const handleOpen = useCallback(async () => {
		if (!selectedMedia) return;

		try {
			await openInExternalApp(selectedMedia);
		} catch (error) {
			Alert.alert(
				"Not Implemented",
				"Opening in external app is not yet implemented",
			);
		}
	}, [selectedMedia]);

	const handleStar = useCallback(async () => {
		if (!selectedMedia) return;

		// TODO: Show album selection dialog
		Alert.alert("Add to Album", "Album selection not yet implemented", [
			{ text: "OK" },
		]);
	}, [selectedMedia]);

	// Android back button handler for drawers
	useEffect(() => {
		if (!visible) return;

		const backHandler = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				// Priority order: InfoDrawer > PhotoViewer

				if (infoDrawerVisible) {
					// Close info drawer
					handleInfoDrawerClose();
					return true; // Prevent default back behavior
				}

				if (viewerVisible) {
					// Close photo viewer
					handleViewerClose();
					return true; // Prevent default back behavior
				}

				// Let parent handle back (close search mode)
				return false;
			},
		);

		return () => backHandler.remove();
	}, [
		visible,
		infoDrawerVisible,
		viewerVisible,
		handleInfoDrawerClose,
		handleViewerClose,
	]);

	if (!visible) return null;

	return (
		<Animated.View
			entering={FadeIn.duration(200)}
			exiting={FadeOut.duration(200)}
			style={[styles.container, { backgroundColor: colors.background }, style]}
			testID={testID}
		>
			{/* Header with result count */}
			<View
				style={[
					styles.header,
					{ backgroundColor: colors.surface, borderBottomColor: colors.border },
				]}
			>
				<Text style={[styles.headerTitle, { color: colors.text }]}>
					Search Results
				</Text>
				{searchState.resultCount > 0 && (
					<Text style={[styles.resultCount, { color: colors.textSecondary }]}>
						{searchState.resultCount}{" "}
						{searchState.resultCount === 1 ? "result" : "results"}
					</Text>
				)}
			</View>

			{/* Content Area */}
			<View style={styles.content}>
				{searchState.loading ? (
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color={colors.buttonPrimary} />
						<Text style={[styles.loadingText, { color: colors.textSecondary }]}>
							Reasoning...
						</Text>
					</View>
				) : searchState.error ? (
					<View style={styles.emptyContainer}>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							{searchState.error}
						</Text>
					</View>
				) : searchQuery && searchState.resultCount === 0 ? (
					<View style={styles.emptyContainer}>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							I couldn't think this over
						</Text>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							"{searchQuery}"
						</Text>
					</View>
				) : searchState.resultCount > 0 ? (
					<PhotoGrid
						mediaFiles={searchState.searchResults}
						columns={galleryState.currentZoomLevel}
						onMediaPress={handleMediaPress}
						onZoomChange={handleZoomChange}
						style={styles.photoGrid}
					/>
				) : (
					<View style={styles.emptyContainer}>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							Guide me through what your heart desires
						</Text>
					</View>
				)}
			</View>

			{/* Photo Viewer Modal */}
			<PhotoViewerModal
				visible={viewerVisible}
				media={selectedMedia}
				allMedia={searchState.searchResults}
				onClose={handleViewerClose}
				onSwipeUp={handleViewerSwipeUp}
			/>

			{/* Info Drawer */}
			<InfoDrawer
				visible={infoDrawerVisible}
				labels={selectedLabels}
				ocrText={selectedOcrText}
				onClose={handleInfoDrawerClose}
				onLabelPress={handleLabelPress}
				onDelete={handleDelete}
				onShare={handleShare}
				onCopy={handleCopy}
				onOpen={handleOpen}
				onStar={handleStar}
			/>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 10,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm,
		borderBottomWidth: 1,
	},
	headerTitle: {
		fontSize: Typography.fontSize.xxl,
		fontWeight: Typography.fontWeight.bold,
	},
	resultCount: {
		fontSize: Typography.fontSize.md,
	},
	content: {
		flex: 1,
	},
	loadingContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: Spacing.md,
	},
	loadingText: {
		fontSize: Typography.fontSize.md,
	},
	emptyContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: Spacing.xl,
	},
	emptyText: {
		fontSize: Typography.fontSize.lg,
		textAlign: "center",
	},
	photoGrid: {
		flex: 1,
	},
});
