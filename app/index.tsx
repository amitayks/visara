import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useCallback, useEffect, useState } from "react";
import {
	Keyboard,
	StatusBar,
	StyleSheet,
	TouchableWithoutFeedback,
} from "react-native";
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import {
	galleryScanner,
	type ScanProgress,
} from "../services/gallery/GalleryScanner";
import { useDocumentStore } from "../stores/documentStore";
import { useSearchStore } from "../stores/searchStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { RootStackParamList } from "../types/navigation";

import { AppHeader } from "./components/AppHeader";
import { Document, DocumentGrid } from "./components/DocumentGrid";
import { DocumentModal } from "./components/DocumentModal";
import { EmptyState } from "./components/EmptyState";
import { ScanProgressBar } from "./components/ScanProgressBar";
import { SearchContainer } from "./components/SearchContainer";
import { showToast, ToastContainer } from "./components/Toast";
import { UploadModal } from "./components/UploadModal";

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
	const navigation = useNavigation<NavigationProp>();
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);

	const { filteredDocuments, loadDocuments, initializeRealTimeUpdates } =
		useDocumentStore();
	const { searchQuery, queryChips } = useSearchStore();

	const { settings } = useSettingsStore();

	// Local UI state
	const [selectedDocument, setSelectedDocument] = useState<Document | null>(
		null,
	);

	// UI state
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isScanning, setIsScanning] = useState(false);
	const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [showDocumentModal, setShowDocumentModal] = useState(false);

	// Animation values
	const keyboard = useAnimatedKeyboard();

	// Real-time document updates
	useEffect(() => {
		const unsubscribe = initializeRealTimeUpdates();
		return unsubscribe;
	}, [initializeRealTimeUpdates]);

	// Scan progress subscription
	useEffect(() => {
		const subscription = galleryScanner.observeProgress((progress) => {
			setIsScanning(progress.isScanning);
			setScanProgress(progress);
		});

		return () => subscription?.unsubscribe?.();
	}, []);

	// Keyboard animation
	const searchBarStyle = useAnimatedStyle(() => {
		return {
			transform: [{ translateY: keyboard.height.value * -1 }],
		};
	});

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await loadDocuments();
		} catch (error) {
			console.error("Refresh documents error:", error);
			showToast({
				type: "error",
				message: "Failed to refresh documents",
				icon: "alert-circle",
			});
		} finally {
			setIsRefreshing(false);
		}

		try {
			const hasPermission = await galleryScanner.hasPermissions();
			if (!hasPermission) {
				const granted = await galleryScanner.requestPermissions();
				if (!granted) {
					return;
				}
			}

			setIsScanning(true);

			await galleryScanner.startScan(
				{
					batchSize: settings.maxScanBatchSize,
					smartFilterEnabled: settings.smartFilterEnabled,
					batterySaver: settings.batterySaver,
				},
				(progress) => {
					setScanProgress(progress);
					console.log(
						`Background scan progress: ${progress.processedImages}/${progress.totalImages}`,
					);
				},
			);

			showToast({
				type: "success",
				message: "Gallery refreshed successfully",
				icon: "checkmark-circle",
			});
		} catch (error) {
			console.error("Background scan error:", error);
			showToast({
				type: "error",
				message: "Failed to scan gallery",
				icon: "alert-circle",
			});
		} finally {
			setIsScanning(false);
			setScanProgress(null);
		}
	}, [loadDocuments]);

	// Handle document press
	const handleDocumentPress = useCallback((doc: Document) => {
		setSelectedDocument(doc);
		setShowDocumentModal(true);
	}, []);

	const handleStartBackgroundScan = useCallback(async () => {
		try {
			const hasPermission = await galleryScanner.hasPermissions();
			if (!hasPermission) {
				const granted = await galleryScanner.requestPermissions();
				if (!granted) {
					showToast({
						type: "error",
						message: `Permission Required Gallery access is needed to scan for documents.`,
						icon: "alert-circle",
					});
					return;
				}
			}

			// Only set scanning state after permissions are confirmed
			setIsScanning(true);

			// Start the scan (permissions already checked)
			await galleryScanner.startScan(
				{
					batchSize: settings.maxScanBatchSize,
					smartFilterEnabled: settings.smartFilterEnabled,
					batterySaver: settings.batterySaver,
				},
				(progress) => {
					setScanProgress(progress);
					console.log(
						`Manual scan progress: ${progress.processedImages}/${progress.totalImages}`,
					);
				},
			);

			// Refresh documents once scan is complete
			await loadDocuments();
		} catch (error) {
			console.error("Background scan error:", error);
			showToast({
				type: "error",
				message: "Failed to start scan",
				icon: "alert-circle",
			});
		} finally {
			setIsScanning(false);
			setScanProgress(null);
		}
	}, [loadDocuments]);

	// Handle manual upload
	const handleManualUpload = useCallback(() => {
		setShowUploadModal(true);
	}, []);

	// Handle upload complete
	const handleUploadComplete = useCallback(async (imageUri: string) => {
		try {
			// Process the uploaded image
			await galleryScanner.processImage(imageUri);
			showToast({
				type: "success",
				message: "Document processed successfully",
				icon: "checkmark-circle",
			});
		} catch (error) {
			console.error("Upload processing error:", error);
			showToast({
				type: "error",
				message: "Failed to process document",
				icon: "alert-circle",
			});
		}
	}, []);

	// Handle settings navigation
	const handleSettingsPress = useCallback(() => {
		navigation.navigate("Settings");
	}, [navigation]);

	// Initial load
	useEffect(() => {
		loadDocuments();
	}, [loadDocuments]);

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: theme.background }]}
			edges={["top"]}
		>
			<StatusBar
				barStyle={isDark ? "light-content" : "dark-content"}
				backgroundColor={theme.background}
			/>

			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				{/** biome-ignore lint/complexity/noUselessFragments: <explanation> */}
				<>
					{/* Header */}
					<AppHeader
						onScanPress={handleManualUpload}
						onSettingsPress={handleSettingsPress}
					/>

					{/* Scanning Progress */}
					{isScanning && scanProgress && (
						<ScanProgressBar
							current={scanProgress.processedImages}
							total={scanProgress.totalImages}
							animated
						/>
					)}

					{/* Document Grid */}

					<DocumentGrid
						documents={filteredDocuments}
						refreshing={isRefreshing}
						onRefresh={handleRefresh}
						onDocumentPress={handleDocumentPress}
						ListEmptyComponent={
							queryChips.length > 0 ? (
								<EmptyState
									icon="search-outline"
									title="No results found"
									message={`No documents found for "${queryChips[0]?.text || searchQuery}"`}
								/>
							) : (
								<EmptyState
									icon="folder-open-outline"
									title="No documents yet"
									message="Tap the scan button to find documents in your gallery"
									action={{
										label: "Start Scanning",
										onPress: handleStartBackgroundScan,
									}}
								/>
							)
						}
						contentContainerStyle={{
							paddingBottom: 100,
						}}
					/>
				</>
			</TouchableWithoutFeedback>

			{/* Search Section - Fixed at bottom */}
			<Animated.View style={[styles.searchWrapper, searchBarStyle]}>
				<SearchContainer />
			</Animated.View>

			{/* Document Modal */}
			<DocumentModal
				visible={showDocumentModal}
				document={selectedDocument}
				onClose={() => {
					setShowDocumentModal(false);
					setSelectedDocument(null);
				}}
			/>

			{/* Upload Modal */}
			<UploadModal
				visible={showUploadModal}
				onClose={() => setShowUploadModal(false)}
				onUploadComplete={handleUploadComplete}
			/>

			{/* Toast Container */}
			<ToastContainer />
		</SafeAreaView>
	);
}

const createStyles = (theme: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: theme.background,
		},
		searchWrapper: {
			position: "absolute",
			bottom: 0,
			left: 0,
			right: 0,
		},
	});
