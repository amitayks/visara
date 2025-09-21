// app/index.tsx
// Fixed version with proper welcome check and persistent progress bar

import React, { useEffect, useState, useCallback, useRef } from "react";
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
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
} from "react-native-reanimated";

const storage = new MMKV();

export default function HomeScreen() {
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);
	const navigation = useNavigation();

	const {
		documents,
		getFilteredDocuments,
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
	const [welcomeChecked, setWelcomeChecked] = useState(false);

	// Refs to prevent multiple operations
	const hasInitialized = useRef(false);
	const scanProgressSubscription = useRef<any>(null);
	const databaseUnsubscribe = useRef<(() => void) | null>(null);

	// Initialize app on mount (welcome check handled by navigation)
	useEffect(() => {
		console.log("[HomeScreen] Mounting, starting initialization...");
		setWelcomeChecked(true); // No welcome check needed here
		initializeApp();
	}, []);

	const initializeApp = async () => {
		// Prevent multiple initializations
		if (hasInitialized.current) {
			console.log("[HomeScreen] Already initialized, skipping");
			return;
		}
		hasInitialized.current = true;

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

			// Setup real-time updates from database (but don't let it cause re-renders during scan)
			if (scanCompleted === true) {
				console.log("[HomeScreen] Setting up real-time updates...");
				databaseUnsubscribe.current = initializeRealTimeUpdates();
			}

			// Hide loading before starting scans
			setIsLoading(false);

			if (scanCompleted !== true) {
				// Start initial scan
				console.log("[HomeScreen] Starting initial scan...");
				await startInitialScan(); // Wait for it to complete
			} else {
				// Just start real-time monitoring
				console.log("[HomeScreen] Starting real-time monitoring...");
				await startRealTimeMonitoring();
			}

			console.log("[HomeScreen] App initialization complete!");
		} catch (error) {
			console.error("[HomeScreen] Initialization error:", error);
			showToast({
				type: "error",
				message: "Failed to initialize app",
			});
			setIsLoading(false);
		}
	};

	const startInitialScan = async () => {
		console.log("[HomeScreen] Starting initial scan...");
		setIsInitialScan(true);

		try {
			// Subscribe to progress updates
			scanProgressSubscription.current = initialScanner
				.observeProgress()
				.subscribe((progress) => {
					setScanProgress(progress);

					// Only update documents when scan completes or significant progress
					if (
						progress.phase === "completed" ||
						(progress.documentsFound > 0 && progress.documentsFound % 10 === 0)
					) {
						loadDocuments();
					}
				});

			// Perform initial scan
			await initialScanner.performInitialScan();

			// Mark as completed
			storage.set("initial_scan_completed", true);

			// Final document load
			await loadDocuments();

			// NOW setup database observer after scan is complete
			if (!databaseUnsubscribe.current) {
				console.log("[HomeScreen] Setting up real-time updates after scan...");
				databaseUnsubscribe.current = initializeRealTimeUpdates();
			}

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
			// Don't clear scan progress immediately - let it fade out
			setTimeout(() => {
				setScanProgress(null);
			}, 2000);

			// Cleanup subscription
			if (scanProgressSubscription.current) {
				scanProgressSubscription.current.unsubscribe();
				scanProgressSubscription.current = null;
			}
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

	const keyboard = useAnimatedKeyboard();
	const searchBarStyle = useAnimatedStyle(() => {
		return {
			transform: [{ translateY: keyboard.height.value * -1 }],
		};
	});

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

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (databaseUnsubscribe.current) {
				databaseUnsubscribe.current();
				databaseUnsubscribe.current = null;
			}
			if (scanProgressSubscription.current) {
				scanProgressSubscription.current.unsubscribe();
				scanProgressSubscription.current = null;
			}
		};
	}, []);

	// Don't render until welcome check is complete
	if (!welcomeChecked) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color="#0066FF" />
			</View>
		);
	}

	if (isLoading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color="#0066FF" />
				<Text style={styles.loadingText}>Loading documents...</Text>
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

			{/* Progress Bar - Always visible during initial scan */}
			{isInitialScan && scanProgress && (
				<View style={styles.scanProgressContainer}>
					<View style={styles.scanProgressHeader}>
						<Text style={styles.scanProgressTitle}>
							{scanProgress.phase === "scanning"
								? "Discovering images..."
								: scanProgress.phase === "processing"
									? "Processing documents..."
									: "Completing scan..."}
						</Text>
						<Text style={styles.scanProgressPercentage}>
							{scanProgress.percentage}%
						</Text>
					</View>
					<View style={styles.progressBar}>
						<View
							style={[
								styles.progressFill,
								{ width: `${scanProgress.percentage}%` },
							]}
						/>
					</View>
					<Text style={styles.scanProgressSubtitle}>
						{scanProgress.documentsFound} documents found •{" "}
						{scanProgress.processedImages}/{scanProgress.totalImages} images
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

			{/* Document Modal */}
			{isModalVisible && selectedDocument && (
				<DocumentModal
					visible={isModalVisible}
					document={selectedDocument}
					onClose={closeDocumentModal}
				/>
			)}

			{/* Upload Modal */}
			{showUploadModal && (
				<UploadModal
					visible={showUploadModal}
					onClose={() => setShowUploadModal(false)}
				/>
			)}

			{/* Search Bar */}
			<Animated.View style={[styles.searchWrapper, searchBarStyle]}>
				<SearchBar
					value={searchQuery}
					onChangeText={handleSearch}
					placeholder="Search documents..."
				/>
			</Animated.View>

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
		loadingContainer: {
			flex: 1,
			justifyContent: "center",
			alignItems: "center",
			backgroundColor: theme.background,
		},
		loadingText: {
			marginTop: 12,
			fontSize: 16,
			color: theme.textSecondary,
		},
		scanProgressContainer: {
			backgroundColor: theme.backgroundAccent,
			marginHorizontal: 2,
			marginBottom: 10,
			padding: 16,
			borderRadius: theme.borderRadius,
			elevation: 2,
			shadowColor: "#000",
			shadowOffset: { width: 0, height: 2 },
			shadowOpacity: 0.5,
			shadowRadius: 4,
		},
		scanProgressHeader: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			marginBottom: 10,
		},
		scanProgressTitle: {
			fontSize: 14,
			fontWeight: "600",
			color: theme.text,
		},
		scanProgressPercentage: {
			fontSize: 14,
			fontWeight: "bold",
			color: theme.text,
		},
		scanProgressSubtitle: {
			fontSize: 12,
			color: theme.text,
			marginTop: 8,
		},
		progressBar: {
			height: 6,
			backgroundColor: theme.background,
			borderRadius: 3,
			overflow: "hidden",
		},
		progressFill: {
			height: "100%",
			backgroundColor: theme.accent,
			borderRadius: 3,
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
			color: theme.textSecondary,
			marginTop: 8,
			textAlign: "center",
		},
		documentsFound: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
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
			fontWeight: "600",
			color: theme.text,
			marginBottom: 8,
		},
		emptyMessage: {
			fontSize: 14,
			color: theme.textSecondary,
			textAlign: "center",
		},
	});
