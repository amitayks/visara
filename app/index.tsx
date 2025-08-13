import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback, useEffect, useState } from "react";
import {
	Alert,
	Dimensions,
	Keyboard,
	Platform,
	StatusBar,
	StyleSheet,
} from "react-native";
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme, useThemedStyles } from "../contexts/ThemeContext";

// Import our new components
import { EmptyState } from "./components/common/LoadingStates";
import { Document, DocumentGrid } from "./components/gallery/DocumentGrid";
import { AppHeader } from "./components/layout/AppHeader";
import { ScanProgressBar } from "./components/layout/ScanProgressBar";
import { DocumentModal } from "./components/modals/DocumentModal";
import { ToastContainer, showToast } from "./components/modals/Toast";
import { UploadModal } from "./components/modals/UploadModal";
import { QueryChip, QueryChips } from "./components/search/QueryChips";
import { SearchBar } from "./components/search/SearchBar";
import { SearchResults } from "./components/search/SearchResults";

// Import services
import { database } from "../services/database";
import { documentStorage } from "../services/database/documentStorage";
import {
	galleryScanner,
	type ScanProgress,
} from "../services/gallery/GalleryScanner";
import { SearchOrchestrator } from "../services/search/searchOrchestrator";
import type { RootStackParamList } from "../types/navigation";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
	const navigation = useNavigation<NavigationProp>();
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);

	// Document state
	const [documents, setDocuments] = useState<Document[]>([]);
	const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
	const [selectedDocument, setSelectedDocument] = useState<Document | null>(
		null,
	);

	// Search state
	const [searchQuery, setSearchQuery] = useState("");
	const [queryChips, setQueryChips] = useState<QueryChip[]>([]);
	const [searchResults, setSearchResults] = useState<Document[]>([]);
	const [showSearchResults, setShowSearchResults] = useState(false);
	const [searchOrchestrator] = useState(() => new SearchOrchestrator(database));

	// UI state
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isScanning, setIsScanning] = useState(false);
	const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [showDocumentModal, setShowDocumentModal] = useState(false);

	// Animation values
	const keyboard = useAnimatedKeyboard();
	const searchBarTranslateY = useSharedValue(0);

	// Load documents
	const loadDocuments = useCallback(async () => {
		try {
			const docs = await documentStorage.getAllDocuments();
			const sortedDocs = docs.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);

			// Transform database documents to our Document interface
			const transformedDocs: Document[] = sortedDocs.map((doc) => ({
				id: doc.id,
				imageUri: doc.imageUri,
				documentType: doc.documentType,
				vendor: doc.vendor,
				date: doc.date ? new Date(doc.date) : undefined,
				totalAmount: doc.totalAmount,
				metadata: doc.metadata,
				createdAt: new Date(doc.createdAt),
			}));

			setDocuments(transformedDocs);
			setFilteredDocuments(transformedDocs);
		} catch (error) {
			console.error("Failed to load documents:", error);
			showToast({
				type: "error",
				message: "Failed to load documents",
				icon: "alert-circle",
			});
		}
	}, []);

	// Real-time document updates
	useEffect(() => {
		const subscription = documentStorage.observeDocuments((docs) => {
			// Sort documents by creation date (newest first) - same as loadDocuments
			const sortedDocs = docs.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);

			const transformedDocs: Document[] = sortedDocs.map((doc) => ({
				id: doc.id,
				imageUri: doc.imageUri,
				documentType: doc.documentType,
				vendor: doc.vendor,
				date: doc.date ? new Date(doc.date) : undefined,
				totalAmount: doc.totalAmount,
				metadata: doc.metadata,
				createdAt: new Date(doc.createdAt),
			}));

			setDocuments(transformedDocs);
			if (!showSearchResults) {
				setFilteredDocuments(transformedDocs);
			}
		});

		return () => subscription?.unsubscribe?.();
	}, [showSearchResults]);

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
			transform: [
				{
					translateY: withSpring(keyboard.height.value * -1, {
						damping: 50,
						stiffness: 600,
					}),
				},
			],
		};
	});

	// Core scan logic - extracted for reusability
	const performGalleryScan = useCallback(
		async (onProgress?: (progress: ScanProgress) => void) => {
			// Check permissions first
			const hasPermission = await galleryScanner.hasPermissions();
			if (!hasPermission) {
				const granted = await galleryScanner.requestPermissions();
				if (!granted) {
					Alert.alert(
						"Permission Required",
						"Gallery access is needed to scan for documents. Please enable it in settings.",
					);
					return false;
				}
			}

			// Start the scan
			await galleryScanner.startScan(
				{
					batchSize: 15,
					smartFilterEnabled: true,
					batterySaver: true,
				},
				onProgress ||
					((progress) => {
						setScanProgress(progress);
						console.log(
							`Scan progress: ${progress.processedImages}/${progress.totalImages}`,
						);
					}),
			);

			return true;
		},
		[],
	);

	// Handle refresh - loads documents first, then triggers background scan
	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			// First: Load existing documents (original refresh behavior)
			await loadDocuments();
		} catch (error) {
			console.error("Refresh documents error:", error);
			showToast({
				type: "error",
				message: "Failed to refresh documents",
				icon: "alert-circle",
			});
		} finally {
			// End refresh indicator
			setIsRefreshing(false);
		}

		// Then: Start background gallery scan separately
		try {
			// Check permissions first - don't set scanning state until after permissions
			const hasPermission = await galleryScanner.hasPermissions();
			if (!hasPermission) {
				const granted = await galleryScanner.requestPermissions();
				if (!granted) {
					// Don't show alert for refresh - silently skip scanning if no permission
					return;
				}
			}

			// Only set scanning state after permissions are confirmed
			setIsScanning(true);

			// Start the scan (permissions already checked)
			await galleryScanner.startScan(
				{
					batchSize: 15,
					smartFilterEnabled: true,
					batterySaver: true,
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
				message: "Gallery scan completed successfully",
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
	}, [performGalleryScan, loadDocuments]);

	// Handle search
	const handleSearch = useCallback(async () => {
		if (!searchQuery.trim()) return;

		try {
			const result = await searchOrchestrator.search(searchQuery, {
				useSemanticSearch: true,
				usePhoneticMatching: true,
				useFuzzyMatching: true,
				maxResults: 50,
			});

			const docs: Document[] = result.documents.map((scored) => ({
				id: scored.document.id,
				imageUri: scored.document.imageUri,
				documentType: scored.document.documentType,
				vendor: scored.document.vendor,
				date: scored.document.date ? new Date(scored.document.date) : undefined,
				totalAmount: scored.document.totalAmount,
				metadata: scored.document.metadata,
				createdAt: new Date(scored.document.createdAt),
			}));

			setSearchResults(docs);
			setFilteredDocuments(docs);
			setShowSearchResults(true);

			// Add to query chips
			const newChip: QueryChip = {
				id: Date.now().toString(),
				text: searchQuery,
				type: "search",
			};
			setQueryChips((prev) => [...prev, newChip]);

			Keyboard.dismiss();
		} catch (error) {
			console.error("Search error:", error);
			showToast({
				type: "error",
				message: "Search failed",
				icon: "alert-circle",
			});
		}
	}, [searchQuery, searchOrchestrator]);

	// Handle document press
	const handleDocumentPress = useCallback((doc: Document) => {
		setSelectedDocument(doc);
		setShowDocumentModal(true);
	}, []);

	// Handle document deletion
	const handleDeleteDocument = useCallback(async (doc: Document) => {
		try {
			await documentStorage.deleteDocument(doc.id);
			showToast({
				type: "success",
				message: "Document deleted",
				icon: "checkmark-circle",
			});
		} catch (error) {
			console.error("Delete error:", error);
			throw error;
		}
	}, []);

	// Handle manual background scan (initiated by user via button)
	const handleStartBackgroundScan = useCallback(async () => {
		try {
			// Check permissions first - don't set scanning state until after permissions
			const hasPermission = await galleryScanner.hasPermissions();
			if (!hasPermission) {
				const granted = await galleryScanner.requestPermissions();
				if (!granted) {
					Alert.alert(
						"Permission Required",
						"Gallery access is needed to scan for documents. Please enable it in settings.",
					);
					return; // Exit early if permission denied - no UI state change
				}
			}

			// Only set scanning state after permissions are confirmed
			setIsScanning(true);

			// Start the scan (permissions already checked)
			await galleryScanner.startScan(
				{
					batchSize: 15,
					smartFilterEnabled: true,
					batterySaver: true,
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

			showToast({
				type: "success",
				message: "Scan completed successfully",
				icon: "checkmark-circle",
			});
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

	// Handle chip removal
	const handleRemoveChip = useCallback(
		(chipId: string) => {
			setQueryChips((prev) => prev.filter((chip) => chip.id !== chipId));

			if (queryChips.length === 1) {
				setFilteredDocuments(documents);
				setShowSearchResults(false);
				setSearchQuery("");
			}
		},
		[queryChips, documents],
	);

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
					<EmptyState
						icon="folder-open-outline"
						title="No documents yet"
						message="Tap the scan button to find documents in your gallery"
						action={{
							label: "Start Scanning",
							onPress: handleStartBackgroundScan,
						}}
					/>
				}
				contentContainerStyle={{
					paddingBottom: 100,
				}}
			/>

			{/* Search Section - Fixed at bottom */}
			<Animated.View style={[styles.searchContainer, searchBarStyle]}>
				{/* Query Chips */}
				{queryChips.length > 0 && (
					<QueryChips
						chips={queryChips}
						onRemoveChip={handleRemoveChip}
						style={styles.queryChips}
					/>
				)}

				{/* Search Bar */}
				<SearchBar
					value={searchQuery}
					onChangeText={setSearchQuery}
					onSubmit={handleSearch}
					// placeholder="Search documents..."
					showSendButton={searchQuery.length > 0}
				/>
			</Animated.View>

			{/* Search Results Overlay */}
			{showSearchResults && (
				<SearchResults
					results={searchResults}
					loading={false}
					query={searchQuery}
					onResultPress={handleDocumentPress}
					onClose={() => {
						setShowSearchResults(false);
						setFilteredDocuments(documents);
						setSearchQuery("");
						setQueryChips([]);
					}}
				/>
			)}

			{/* Document Modal */}
			<DocumentModal
				visible={showDocumentModal}
				document={selectedDocument}
				onClose={() => {
					setShowDocumentModal(false);
					setSelectedDocument(null);
				}}
				onDelete={handleDeleteDocument}
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
		searchContainer: {
			position: "absolute",
			bottom: 0,
			left: 0,
			right: 0,
			backgroundColor: theme.background,
			borderTopWidth: 1,
			borderTopColor: theme.border,
			paddingBottom: Platform.OS === "ios" ? 20 : 10,
		},
		queryChips: {
			paddingHorizontal: 16,
			paddingTop: 12,
			paddingBottom: 8,
			borderBottomWidth: 1,
			borderBottomColor: theme.borderLight,
		},
	});
