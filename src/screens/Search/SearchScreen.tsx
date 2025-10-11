import { SearchBar } from "@components/molecules/SearchBar";
import { PhotoGrid } from "@components/organisms/PhotoGrid";
import { PhotoViewerModal } from "@components/organisms/PhotoViewerModal";
import { InfoDrawer } from "@components/organisms/InfoDrawer";
import { useSearch } from "@contexts/SearchContext";
import type { MediaFile } from "@models/MediaFile";
import { SearchService } from "@services/search/SearchService";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { LabelRepository } from "@services/database/LabelRepository";
import { OcrTextRepository } from "@services/database/OcrTextRepository";
import type { Label } from "@models/Label";
import type { OcrText } from "@models/OcrText";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useState, useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function SearchScreen() {
	const { colors } = useTheme();
	const { state: searchState, dispatch: searchDispatch } = useSearch();

	// Local state for modals/drawers
	const [viewerVisible, setViewerVisible] = useState(false);
	const [infoDrawerVisible, setInfoDrawerVisible] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
	const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
	const [selectedOcrText, setSelectedOcrText] = useState<OcrText | null>(null);

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

	// Handle search query change
	const handleSearchQueryChange = useCallback((text: string) => {
		searchDispatch({ type: "SET_SEARCH_QUERY", payload: text });
	}, [searchDispatch]);

	// Perform search
	const handleSearch = useCallback(async () => {
		if (!searchState.searchQuery.trim()) {
			searchDispatch({ type: "SET_SEARCH_RESULTS", payload: [] });
			return;
		}

		searchDispatch({ type: "SET_LOADING", payload: true });

		try {
			// Perform search using SearchService
			const searchResults = await SearchService.search(searchState.searchQuery);

			// Get full MediaFile objects for the results
			const mediaFiles = await Promise.all(
				searchResults.map(async (result) => {
					const mediaFile = await MediaFileRepository.findById(result.id);
					return mediaFile;
				})
			);

			// Filter out null results and update state
			const validMediaFiles = mediaFiles.filter((file): file is MediaFile => file !== null);
			searchDispatch({ type: "SET_SEARCH_RESULTS", payload: validMediaFiles });
		} catch (error) {
			console.error("Search error:", error);
			searchDispatch({ type: "SET_ERROR", payload: "Failed to perform search" });
		}
	}, [searchState.searchQuery, searchDispatch]);

	// Handle search close
	const handleSearchClose = useCallback(() => {
		searchDispatch({ type: "CLEAR_SEARCH" });
	}, [searchDispatch]);

	// Handle media press - open viewer modal
	const handleMediaPress = useCallback(async (media: MediaFile, _index: number) => {
		setSelectedMedia(media);

		// Load labels and OCR text for the selected media
		const labels = await LabelRepository.findByMediaFileId(media.id);
		const ocrTexts = await OcrTextRepository.findByMediaFileId(media.id);

		setSelectedLabels(labels);
		setSelectedOcrText(ocrTexts.length > 0 ? ocrTexts[0] : null);
		setViewerVisible(true);
	}, []);

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
	const handleLabelPress = useCallback((label: string) => {
		searchDispatch({ type: "SET_SEARCH_QUERY", payload: label });
		setInfoDrawerVisible(false);
		// Trigger search with new query
		setTimeout(() => {
			handleSearch();
		}, 100);
	}, [searchDispatch, handleSearch]);

	// Handle info drawer actions (placeholder implementations)
	const handleDelete = useCallback(() => {
		console.log("Delete action");
	}, []);

	const handleShare = useCallback(() => {
		console.log("Share action");
	}, []);

	const handleCopy = useCallback(async () => {
		if (selectedOcrText?.text) {
			// TODO: Copy to clipboard
			console.log("Copy text:", selectedOcrText.text);
		}
	}, [selectedOcrText]);

	const handleOpen = useCallback(() => {
		console.log("Open action");
	}, []);

	const handleStar = useCallback(() => {
		console.log("Star action");
	}, []);

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }]}
			edges={["top"]}
		>
			{/* Header with result count */}
			<View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
				<Text style={[styles.headerTitle, { color: colors.text }]}>
					Search Results
				</Text>
				{searchState.resultCount > 0 && (
					<Text style={[styles.resultCount, { color: colors.textSecondary }]}>
						{searchState.resultCount} {searchState.resultCount === 1 ? "result" : "results"}
					</Text>
				)}
			</View>

			{/* Content Area */}
			<View style={styles.content}>
				{searchState.loading ? (
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color={colors.buttonPrimary} />
						<Text style={[styles.loadingText, { color: colors.textSecondary }]}>
							Searching...
						</Text>
					</View>
				) : searchState.error ? (
					<View style={styles.emptyContainer}>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							{searchState.error}
						</Text>
					</View>
				) : searchState.searchQuery && searchState.resultCount === 0 ? (
					<View style={styles.emptyContainer}>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							No results found for "{searchState.searchQuery}"
						</Text>
					</View>
				) : searchState.resultCount > 0 ? (
					<PhotoGrid
						mediaFiles={searchState.searchResults}
						columns={4}
						onMediaPress={handleMediaPress}
						style={styles.photoGrid}
					/>
				) : (
					<View style={styles.emptyContainer}>
						<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
							Search your photos by objects, scenes, or text
						</Text>
					</View>
				)}
			</View>

			{/* Search Bar at bottom */}
			<SearchBar
				value={searchState.searchQuery}
				onChangeText={handleSearchQueryChange}
				onClose={handleSearchClose}
				onSearch={handleSearch}
				style={styles.searchBar}
			/>

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
	searchBar: {
		// SearchBar handles its own styling
	},
});
