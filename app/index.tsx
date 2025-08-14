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
	TouchableWithoutFeedback,
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
import { SkeletonGrid } from "./components/gallery/SkeletonGrid";
import { AppHeader } from "./components/layout/AppHeader";
import { ScanProgressBar } from "./components/layout/ScanProgressBar";
import { DocumentModal } from "./components/modals/DocumentModal";
import { ToastContainer, showToast } from "./components/modals/Toast";
import { UploadModal } from "./components/modals/UploadModal";
import {
	QueryChip,
	SearchContainer,
} from "./components/search/SearchContainer";

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
	const [isSearching, setIsSearching] = useState(false);
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
			// Only update filtered documents if not currently showing search results
			if (queryChips.length === 0) {
				setFilteredDocuments(transformedDocs);
			}
		});

		return () => subscription?.unsubscribe?.();
	}, [queryChips.length]);

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

		// First: Add chip immediately for better UX (before loading state)
		const newChip: QueryChip = {
			id: Date.now().toString(),
			text: searchQuery,
			type: "search",
		};
		setQueryChips((prev) => [...prev, newChip]);

		// Clear search input immediately
		setSearchQuery("");

		// Small delay to let chip animation complete before showing loading
		await new Promise((resolve) => setTimeout(resolve, 200));

		setIsSearching(true);
		try {
			// Build combined search query from all chips (including new one)
			const allSearchTerms = [
				...queryChips.map((chip) => chip.text),
				newChip.text,
			];
			const combinedQuery = allSearchTerms.join(" ");

			const result = await searchOrchestrator.search(combinedQuery, {
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
		} catch (error) {
			console.error("Search error:", error);
			// Remove the chip if search failed
			setQueryChips((prev) => prev.filter((chip) => chip.id !== newChip.id));
			showToast({
				type: "error",
				message: "Search failed",
				icon: "alert-circle",
			});
		} finally {
			setIsSearching(false);
		}
	}, [searchQuery, queryChips, searchOrchestrator]);

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
		async (chipId: string) => {
			const updatedChips = queryChips.filter((chip) => chip.id !== chipId);
			setQueryChips(updatedChips);

			// If this was the last chip, clear search state
			if (updatedChips.length === 0) {
				setFilteredDocuments(documents);
				setSearchQuery("");
				setSearchResults([]);
				return;
			}

			// Re-search with remaining chips
			try {
				setIsSearching(true);
				const combinedQuery = updatedChips.map((chip) => chip.text).join(" ");

				const result = await searchOrchestrator.search(combinedQuery, {
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
					date: scored.document.date
						? new Date(scored.document.date)
						: undefined,
					totalAmount: scored.document.totalAmount,
					metadata: scored.document.metadata,
					createdAt: new Date(scored.document.createdAt),
				}));

				setSearchResults(docs);
				setFilteredDocuments(docs);
			} catch (error) {
				console.error("Re-search error:", error);
				showToast({
					type: "error",
					message: "Search failed",
					icon: "alert-circle",
				});
			} finally {
				setIsSearching(false);
			}
		},
		[queryChips, documents, searchOrchestrator],
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
					{isSearching ? (
						<SkeletonGrid columns={2} count={6} />
					) : (
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
					)}
				</>
			</TouchableWithoutFeedback>

			{/* Search Section - Fixed at bottom */}
			<Animated.View style={[styles.searchWrapper, searchBarStyle]}>
				<SearchContainer
					searchValue={searchQuery}
					onSearchChange={(text) => {
						setSearchQuery(text);
						// Only clear search results if user clears input AND there are no chips
						if (!text.trim() && queryChips.length === 0) {
							setFilteredDocuments(documents);
							setSearchResults([]);
						}
					}}
					onSubmit={handleSearch}
					queryChips={queryChips}
					onRemoveChip={handleRemoveChip}
					showSendButton={searchQuery.length > 0}
				/>
			</Animated.View>

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
		searchWrapper: {
			position: "absolute",
			bottom: 0,
			left: 0,
			right: 0,
		},
	});
