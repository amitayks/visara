import React, { useEffect, useState, useCallback } from "react";
import {
	View,
	StatusBar,
	StyleSheet,
	Text,
	ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { MMKV } from "react-native-mmkv";
import { useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";

import { realTimeGalleryManager } from "../services/realtime/RealTimeGalleryManager";
import { initialScanner } from "../services/realtime/InitialScanner";
import { useDocumentStore } from "../stores/documentStore";
import { useSearchStore } from "../stores/searchStore";
import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import { AppHeader } from "./components/AppHeader";
import { type Document, DocumentGrid } from "./components/DocumentGrid";
import { DocumentModal } from "./components/DocumentModal";
import { SearchBar } from "./components/SearchBar";
import { showToast, ToastContainer } from "./components/Toast";
import { UploadModal } from "./components/UploadModal";

const storage = new MMKV();

export default function HomeScreen() {
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);
	const navigation = useNavigation();

	const {
		documents,
		filteredDocuments,
		loadDocuments,
		checkExistingDocuments,
		initializeRealTimeUpdates,
		selectedDocument,
		isModalVisible,
		openDocumentModal,
		closeDocumentModal,
		setFilteredDocuments,
	} = useDocumentStore();
	const { searchQuery, clearSearch } = useSearchStore();

	// Local UI state
	const [isInitialScan, setIsInitialScan] = useState(false);
	const [scanProgress, setScanProgress] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [showUploadModal, setShowUploadModal] = useState(false);

	// Check if this is first launch
	useEffect(() => {
		checkFirstLaunch();
	}, []);

	const checkFirstLaunch = async () => {
		try {
			console.log("[HomeScreen] Checking first launch...");
			const welcomeCompleted = storage.getBoolean("welcome_completed");
			console.log("[HomeScreen] Welcome completed:", welcomeCompleted);

			// MMKV getBoolean returns undefined for non-existent keys
			if (welcomeCompleted !== true) {
				console.log("[HomeScreen] Navigating to Welcome screen");
				// Set loading to false and navigate to welcome screen
				setIsLoading(false);
				navigation.reset({
					index: 0,
					routes: [{ name: "Welcome" } as never],
				});
				return;
			}

			console.log("[HomeScreen] Welcome completed, initializing app");
			// Initialize app
			await initializeApp();
		} catch (error) {
			console.error("[HomeScreen] Launch check error:", error);
			// On error, try to initialize anyway
			setIsLoading(false);
		}
	};

	const initializeApp = async () => {
		try {
			console.log("[HomeScreen] Starting app initialization...");
			setIsLoading(true);

			// Load existing documents
			console.log("[HomeScreen] Loading documents...");
			await loadDocuments();
			console.log("[HomeScreen] Documents loaded");

			// Check if initial scan was completed
			const scanCompleted = storage.getBoolean("initial_scan_completed");
			console.log("[HomeScreen] Initial scan completed:", scanCompleted);

			// Hide loading indicator and show home screen before starting background tasks
			setIsLoading(false);

			if (scanCompleted !== true) {
				// Start initial scan in background
				console.log("[HomeScreen] Starting initial scan...");
				startInitialScan(); // Don't await - run in background
			} else {
				// Just start real-time monitoring
				console.log("[HomeScreen] Starting real-time monitoring...");
				await startRealTimeMonitoring();
			}

			// Setup real-time updates from database
			console.log("[HomeScreen] Setting up real-time updates...");
			const unsubscribe = initializeRealTimeUpdates();
			console.log("[HomeScreen] App initialization complete!");
			return unsubscribe;
		} catch (error) {
			console.error("[HomeScreen] Initialization error:", error);
			showToast({
				type: "error",
				message: "Failed to initialize app",
			});
		} finally {
			// Loading already set to false above
		}
	};

	const startInitialScan = async () => {
		console.log("[HomeScreen] Starting initial scan...");
		setIsInitialScan(true);

		try {
			// Subscribe to progress updates
			const progressSub = initialScanner
				.observeProgress()
				.subscribe((progress) => {
					setScanProgress(progress);

					// Update documents as they're found
					if (
						progress.documentsFound > 0 &&
						progress.documentsFound % 5 === 0
					) {
						loadDocuments();
					}
				});

			// Perform initial scan
			await initialScanner.performInitialScan();

			// Cleanup subscription
			progressSub.unsubscribe();

			// Mark as completed
			storage.set("initial_scan_completed", true);

			// Start real-time monitoring
			await startRealTimeMonitoring();

			showToast({
				type: "success",
				message: `Found ${scanProgress?.documentsFound || 0} documents`,
			});
		} catch (error) {
			console.error("[HomeScreen] Initial scan failed:", error);
			showToast({
				type: "error",
				message: "Initial scan failed",
			});
		} finally {
			setIsInitialScan(false);
			setScanProgress(null);
		}
	};

	const startRealTimeMonitoring = async () => {
		try {
			console.log("[HomeScreen] Starting real-time monitoring...");
			await realTimeGalleryManager.start();
			console.log("[HomeScreen] Real-time monitoring started");
		} catch (error) {
			console.error("[HomeScreen] Failed to start monitoring:", error);
		}
	};

	// Handle search
	const handleSearch = useCallback(
		(query: string) => {
			if (!query.trim()) {
				setFilteredDocuments(documents);
				return;
			}

			const lowerQuery = query.toLowerCase();
			const filtered = documents.filter((doc) => {
				const inText = doc.ocrText?.toLowerCase().includes(lowerQuery);
				const inType = doc.documentType?.toLowerCase().includes(lowerQuery);
				const inKeywords = doc.keywords?.some((k) =>
					k.toLowerCase().includes(lowerQuery),
				);
				const inVendor = doc.vendor?.toLowerCase().includes(lowerQuery);

				return inText || inType || inKeywords || inVendor;
			});

			setFilteredDocuments(filtered);
		},
		[documents, setFilteredDocuments],
	);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		await loadDocuments();
		setRefreshing(false);
	}, [loadDocuments]);

	// Handle document press
	const handleDocumentPress = useCallback(
		(doc: Document) => {
			openDocumentModal(doc);
		},
		[openDocumentModal],
	);

	const renderEmptyState = () => {
		if (isInitialScan) {
			return (
				<View style={styles.scanningContainer}>
					<ActivityIndicator size="large" color="#0066FF" />
					<Text style={styles.scanningTitle}>Scanning Gallery</Text>
					<Text style={styles.scanningSubtitle}>
						{scanProgress?.phase === "scanning" && "Looking for documents..."}
						{scanProgress?.phase === "processing" &&
							`Processing ${scanProgress.processedImages}/${scanProgress.totalImages} images`}
					</Text>
					{scanProgress?.percentage > 0 && (
						<View style={styles.progressBar}>
							<View
								style={[
									styles.progressFill,
									{ width: `${scanProgress.percentage}%` },
								]}
							/>
						</View>
					)}
					{scanProgress?.documentsFound > 0 && (
						<Text style={styles.documentsFound}>
							Found {scanProgress.documentsFound} documents
						</Text>
					)}
				</View>
			);
		}

		if (searchQuery) {
			return (
				<View style={styles.emptyContainer}>
					<Text style={styles.emptyTitle}>No results found</Text>
					<Text style={styles.emptyMessage}>
						No documents found for "{searchQuery}"
					</Text>
				</View>
			);
		}

		return (
			<View style={styles.emptyContainer}>
				<Text style={styles.emptyTitle}>No documents yet</Text>
				<Text style={styles.emptyMessage}>
					Take photos of documents and they'll appear here automatically
				</Text>
			</View>
		);
	};

	if (isLoading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color="#0066FF" />
			</View>
		);
	}

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
			<AppHeader setShowUploadModal={setShowUploadModal} />

			{/* Initial Scan Progress */}
			{isInitialScan && scanProgress && (
				<View style={styles.scanProgressContainer}>
					<View style={styles.scanProgressHeader}>
						<Text style={styles.scanProgressTitle}>Scanning Gallery...</Text>
						<Text style={styles.scanProgressPercentage}>
							{scanProgress.percentage}%
						</Text>
					</View>
					<View style={styles.progressBar}>
						<View
							style={[
								styles.progressFill,
								// { width: `${scanProgress.percentage}%` },
							]}
						/>
					</View>
					<Text style={styles.scanProgressSubtitle}>
						{scanProgress.documentsFound} documents found
					</Text>
				</View>
			)}

			{/* Document Grid */}
			<DocumentGrid
				onDocumentPress={handleDocumentPress}
				emptyStateComponent={renderEmptyState}
				refreshing={refreshing}
				onRefresh={handleRefresh}
			/>

			<DocumentModal
				visible={isModalVisible}
				document={selectedDocument}
				onClose={closeDocumentModal}
			/>

			<UploadModal
				visible={showUploadModal}
				onClose={() => setShowUploadModal(false)}
			/>

			{/* Search Bar */}
			<SearchBar
				value={searchQuery}
				onChangeText={handleSearch}
				placeholder="Search documents.."
			/>
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
		loadingContainer: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			backgroundColor: theme.background,
		},
		scanProgressContainer: {
			backgroundColor: theme.surfaceSecondary,
			margin: 16,
			padding: 16,
			borderRadius: 12,
		},
		scanProgressHeader: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			marginBottom: 8,
		},
		scanProgressTitle: {
			fontSize: 14,
			fontWeight: "600",
			color: theme.text,
		},
		scanProgressPercentage: {
			fontSize: 14,
			fontWeight: "bold",
			color: "#0066FF",
		},
		scanProgressSubtitle: {
			fontSize: 12,
			color: theme.textSecondary,
			marginTop: 8,
		},
		progressBar: {
			height: 4,
			backgroundColor: "#E0E0E0",
			borderRadius: 2,
			overflow: "hidden",
		},
		progressFill: {
			height: "100%",
			backgroundColor: "#0066FF",
			borderRadius: 2,
		},
		scanningContainer: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			padding: 40,
		},
		scanningTitle: {
			fontSize: 20,
			fontWeight: "bold",
			color: theme.text,
			marginTop: 20,
		},
		scanningSubtitle: {
			fontSize: 14,
			color: theme.textSecondary || "#666666",
			marginTop: 8,
			textAlign: "center",
		},
		documentsFound: {
			fontSize: 16,
			fontWeight: "600",
			color: "#0066FF",
			marginTop: 20,
		},
		emptyContainer: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			padding: 40,
		},
		emptyTitle: {
			fontSize: 18,
			fontWeight: "bold",
			color: theme.text,
			marginBottom: 8,
		},
		emptyMessage: {
			fontSize: 14,
			color: theme.textSecondary || "#666666",
			textAlign: "center",
		},
	});
