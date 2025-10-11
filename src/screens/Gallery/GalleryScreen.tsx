import { MainTemplate } from "@components/templates/MainTemplate";
import { InfoDrawer } from "@components/organisms/InfoDrawer";
import { PhotoViewerModal } from "@components/organisms/PhotoViewerModal";
import { UploadDrawer } from "@components/organisms/UploadDrawer";
import { useGallery } from "@contexts/GalleryContext";
import { useProcessing } from "@contexts/ProcessingContext";
import type { MediaFile } from "@models/MediaFile";
import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";

export function GalleryScreen() {
	const { state: galleryState, dispatch: galleryDispatch } = useGallery();
	const { state: processingState } = useProcessing();

	// Local state for modals/drawers
	const [viewerVisible, setViewerVisible] = useState(false);
	const [infoDrawerVisible, setInfoDrawerVisible] = useState(false);
	const [uploadDrawerVisible, setUploadDrawerVisible] = useState(false);
	const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);

	// Calculate processing progress
	const processingProgress = processingState.isProcessing
		? processingState.currentProgress.current / processingState.currentProgress.total
		: 0;

	const processingCount = processingState.isProcessing
		? `${processingState.currentProgress.current}/${processingState.currentProgress.total}`
		: undefined;

	// Filter media based on document mode (PDFs and document-like images)
	const displayedMedia = galleryState.isDocumentMode
		? galleryState.mediaFiles.filter((file) =>
			file.mimeType === "application/pdf" ||
			file.mimeType.startsWith("image/") // TODO: Add more sophisticated document detection
		)
		: galleryState.mediaFiles;

	// Handle media press - open viewer modal
	const handleMediaPress = useCallback((media: MediaFile, _index: number) => {
		setSelectedMedia(media);
		galleryDispatch({ type: "SET_SELECTED_MEDIA", payload: media.id });
		setViewerVisible(true);
	}, [galleryDispatch]);

	// Handle zoom change
	const handleZoomChange = useCallback((newColumns: 3 | 4 | 11) => {
		galleryDispatch({ type: "SET_ZOOM_LEVEL", payload: newColumns });
	}, [galleryDispatch]);

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
	const handleSearchPress = useCallback(() => {
		// TODO: Navigate to search screen
		console.log("Search pressed");
	}, []);

	const handleDocumentsPress = useCallback(() => {
		galleryDispatch({ type: "TOGGLE_DOCUMENT_MODE" });
	}, [galleryDispatch]);

	const handleAlbumsPress = useCallback(() => {
		// TODO: Navigate to albums screen
		console.log("Albums pressed");
	}, []);

	const handleSettingsPress = useCallback(() => {
		// TODO: Navigate to settings screen
		console.log("Settings pressed");
	}, []);

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
		console.log("Label pressed");
	}, []);

	const handleDelete = useCallback(() => {
		// TODO: Implement delete
		console.log("Delete pressed");
	}, []);

	const handleShare = useCallback(() => {
		// TODO: Implement share
		console.log("Share pressed");
	}, []);

	const handleCopy = useCallback(() => {
		// TODO: Implement copy
		console.log("Copy pressed");
	}, []);

	const handleOpen = useCallback(() => {
		// TODO: Implement open in external app
		console.log("Open pressed");
	}, []);

	const handleStar = useCallback(() => {
		// TODO: Implement add to album
		console.log("Star pressed");
	}, []);

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
				activeNavButton={galleryState.isDocumentMode ? "documents" : null}
				onSearchPress={handleSearchPress}
				onDocumentsPress={handleDocumentsPress}
				onAlbumsPress={handleAlbumsPress}
				onSettingsPress={handleSettingsPress}
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
				labels={[]} // TODO: Get labels from selected media
				ocrText={null} // TODO: Get OCR text from selected media
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
