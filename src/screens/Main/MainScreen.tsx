import { InfoDrawer } from "@components/organisms/InfoDrawer";
import { PhotoViewerModal } from "@components/organisms/PhotoViewerModal";
import { UploadDrawer } from "@components/organisms/UploadDrawer";
import { MainTemplate } from "@components/templates/MainTemplate";
import { useGallery } from "@contexts/GalleryContext";
import { useNavigation } from "@contexts/NavigationContext";
import { useProcessing } from "@contexts/ProcessingContext";
import type { MediaFile } from "@models/MediaFile";
import type { DisplayLabel, DisplayOcrText } from "@shared-types/display";
import {
	copyPhotoMetadata,
	deletePhoto,
	loadMediaMetadata,
	openInExternalApp,
	sharePhoto,
} from "@utils/photoActions";
import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, StyleSheet } from "react-native";

export function MainScreen() {
	const { state: galleryState, dispatch: galleryDispatch } = useGallery();
	const { state: processingState } = useProcessing();
	const {
		state: navState,
		// goToAlbums,
		// toggleDocuments,
		// toggleSettings,
	} = useNavigation();

	// Local state for modals/drawers
	const [viewerVisible, setViewerVisible] = useState(false);
	const [infoDrawerVisible, setInfoDrawerVisible] = useState(false);
	const [uploadDrawerVisible, setUploadDrawerVisible] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
	const [selectedLabels, setSelectedLabels] = useState<DisplayLabel[]>([]);
	const [selectedOcrText, setSelectedOcrText] = useState<DisplayOcrText | null>(
		null,
	);

	// Calculate processing progress
	const processingProgress = processingState.isProcessing
		? processingState.currentProgress.current /
			processingState.currentProgress.total
		: 0;

	const processingCount = processingState.isProcessing
		? `${processingState.currentProgress.current}/${processingState.currentProgress.total}`
		: undefined;

	// Filter media based on document mode
	const displayedMedia = navState.documentMode
		? galleryState.mediaFiles.filter(
				(file) =>
					file.mimeType === "application/pdf" ||
					file.mimeType.startsWith("image/"),
			)
		: galleryState.mediaFiles;

	// Handle media press - open viewer modal
	const handleMediaPress = useCallback(
		async (media: MediaFile, _index: number) => {
			setSelectedMedia(media);
			galleryDispatch({ type: "SET_SELECTED_MEDIA", payload: media.id });
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
		[galleryDispatch],
	);

	// Handle zoom change
	const handleZoomChange = useCallback(
		(newColumns: 3 | 4 | 11) => {
			galleryDispatch({ type: "SET_ZOOM_LEVEL", payload: newColumns });
		},
		[galleryDispatch],
	);

	// Handle viewer swipe up - open info drawer
	const handleViewerSwipeUp = useCallback(() => {
		setInfoDrawerVisible(true);
	}, []);

	// Handle viewer close
	const handleViewerClose = useCallback(() => {
		setViewerVisible(false);
		galleryDispatch({ type: "SET_SELECTED_MEDIA", payload: null });
	}, [galleryDispatch]);

	// Handle info drawer close
	const handleInfoDrawerClose = useCallback(() => {
		setInfoDrawerVisible(false);
	}, []);

	// Handle plus button - open upload drawer
	const handlePlusPress = useCallback(() => {
		setUploadDrawerVisible(true);
	}, []);

	// Handle upload drawer close
	const handleUploadDrawerClose = useCallback(() => {
		setUploadDrawerVisible(false);
	}, []);

	// Bottom navigation handlers
	// Note: Search is handled by AnimatedBottomNav and parent component
	// const handleSearchPress = useCallback(() => {
	// 	// Search is handled by the parent MainNavigator
	// 	console.log("Search press delegated to parent");
	// }, []);

	// const handleDocumentsPress = useCallback(() => {
	// 	toggleDocuments();
	// }, [toggleDocuments]);

	// const handleAlbumsPress = useCallback(() => {
	// 	goToAlbums();
	// }, [goToAlbums]);

	// const handleSettingsPress = useCallback(() => {
	// 	toggleSettings();
	// }, [toggleSettings]);

	// Handle upload actions
	const handleSelectFromStorage = useCallback(() => {
		// TODO: Implement file picker
		console.log("Select from storage");
	}, []);

	const handleCaptureFromCamera = useCallback(() => {
		// TODO: Implement camera capture
		console.log("Capture from camera");
	}, []);

	// Handle info drawer actions
	const handleLabelPress = useCallback((_label: string) => {
		// TODO: Implement search by label
		console.log("Label pressed:", _label);
	}, []);

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
						galleryDispatch({
							type: "REMOVE_MEDIA_FILE",
							payload: selectedMedia.id,
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
						galleryDispatch({
							type: "REMOVE_MEDIA_FILE",
							payload: selectedMedia.id,
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
	}, [selectedMedia, galleryDispatch]);

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
		const backHandler = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				// Priority order: InfoDrawer > UploadDrawer > PhotoViewer

				if (infoDrawerVisible) {
					// Close info drawer
					handleInfoDrawerClose();
					return true; // Prevent default back behavior
				}

				if (uploadDrawerVisible) {
					// Close upload drawer
					handleUploadDrawerClose();
					return true; // Prevent default back behavior
				}

				if (viewerVisible) {
					// Close photo viewer
					handleViewerClose();
					return true; // Prevent default back behavior
				}

				// Let parent handle back (search mode, settings drawer, or exit)
				return false;
			},
		);

		return () => backHandler.remove();
	}, [
		infoDrawerVisible,
		uploadDrawerVisible,
		viewerVisible,
		handleInfoDrawerClose,
		handleUploadDrawerClose,
		handleViewerClose,
	]);

	return (
		<>
			<MainTemplate
				onPlusPress={handlePlusPress}
				isProcessing={processingState.isProcessing}
				processingProgress={processingProgress}
				processingCount={processingCount}
				mediaFiles={displayedMedia}
				gridColumns={galleryState.currentZoomLevel}
				onMediaPress={handleMediaPress}
				onZoomChange={handleZoomChange}
				activeNavButton={navState.documentMode ? "documents" : null}
				// onSearchPress={handleSearchPress}
				// onDocumentsPress={handleDocumentsPress}
				// onAlbumsPress={handleAlbumsPress}
				// onSettingsPress={handleSettingsPress}
				style={styles.container}
			/>

			{/* Photo Viewer Modal */}
			<PhotoViewerModal
				visible={viewerVisible}
				media={selectedMedia}
				allMedia={displayedMedia}
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

			{/* Upload Drawer */}
			<UploadDrawer
				visible={uploadDrawerVisible}
				onClose={handleUploadDrawerClose}
				onSelectFromStorage={handleSelectFromStorage}
				onCaptureFromCamera={handleCaptureFromCamera}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});
