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
import { backgroundScanner } from "../services/gallery/backgroundScanner";
import {
	galleryScanner,
	type ScanProgress,
} from "../services/gallery/GalleryScanner";
import { notificationPermissions } from "../services/permissions/notificationPermissions";
import { ScannerStorage } from "../storage/MMKVStorage";
import { useDocumentStore } from "../stores/documentStore";
import { useScannerStore } from "../stores/scannerStore";
import { AppHeader } from "./components/AppHeader";
import { type Document, DocumentGrid } from "./components/DocumentGrid";
import { DocumentModal } from "./components/DocumentModal";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { ScanProgressBar } from "./components/ScanProgressBar";
import { SearchBar } from "./components/SearchBar";
import { showToast, ToastContainer } from "./components/Toast";
import { UploadModal } from "./components/UploadModal";
import { useSearchStore } from "../stores/searchStore";

export default function HomeScreen() {
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);

	const {
		loadDocuments,
		checkExistingDocuments,
		initializeRealTimeUpdates,
		selectedDocument,
		isModalVisible,
		openDocumentModal,
		closeDocumentModal,
	} = useDocumentStore();
	const { scanProgress: backgroundScanProgress, isBackgroundScanEnabled } =
		useScannerStore();

	// Local UI state
	const [isScanning, setIsScanning] = useState(false);
	const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
	const [showUploadModal, setShowUploadModal] = useState(false);

	// Animation values
	const keyboard = useAnimatedKeyboard();

	// Real-time document updates
	useEffect(() => {
		const unsubscribe = initializeRealTimeUpdates();
		return unsubscribe;
	}, [initializeRealTimeUpdates]);

	// Optimized scan progress subscription
	useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		
		// Only subscribe if we don't have background scanning
		if (!isBackgroundScanEnabled) {
			unsubscribe = galleryScanner.subscribeToProgress((progress) => {
				// Only update if there's a significant change
				setScanProgress((prev) => {
					if (!prev || 
					    prev.isScanning !== progress.isScanning ||
					    Math.abs(prev.processedImages - progress.processedImages) >= 10 ||
					    prev.scanType !== progress.scanType) {
						return progress;
					}
					return prev;
				});
				
				// Update isScanning separately for immediate UI response
				setIsScanning(progress.isScanning);
			});
		}

		return () => unsubscribe?.();
	}, [isBackgroundScanEnabled]);

	// Simplified scanning state check - reduced logging
	useEffect(() => {
		const isBackgroundScanning =
			isBackgroundScanEnabled && backgroundScanProgress.isScanning;
		const isForegroundScanning = scanProgress?.isScanning || false;
		const overallScanning = isBackgroundScanning || isForegroundScanning;

		// Update local state to reflect the current scanning status
		setIsScanning(overallScanning);

		// Use appropriate progress data - prefer foreground scan progress when available
		if (isForegroundScanning && scanProgress) {
			// Use foreground scanner progress (from auto-scan or manual scan)
			// Don't override with backgroundScanProgress as it may be stale
		} else if (isBackgroundScanning) {
			setScanProgress(backgroundScanProgress);
		} else if (!overallScanning) {
			// No scanning active, clear progress
			setScanProgress(null);
		}
	}, [isBackgroundScanEnabled, backgroundScanProgress, scanProgress]);

	// Keyboard animation
	const searchBarStyle = useAnimatedStyle(() => {
		return {
			transform: [{ translateY: keyboard.height.value * -1 }],
		};
	});

	// Handle document press
	const handleDocumentPress = useCallback(
		(doc: Document) => {
			openDocumentModal(doc);
		},
		[openDocumentModal],
	);

	// TODO: REMOVE - This is for testing only, production apps should not have manual scan buttons
	// Production flow: User sees scan button only on first app open, then all scanning is automatic
	const handleStartBackgroundScan = useCallback(async () => {
		try {
			// Check if background scanning is already running
			const isRunning = backgroundScanner.isBackgroundServiceRunning();
			if (isRunning) {
				showToast({
					type: "info",
					message: "Background scanning is already running",
					// icon: "check",
				});
				return;
			}

			// Check gallery permissions first
			const hasGalleryPermission = await galleryScanner.hasPermissions();
			if (!hasGalleryPermission) {
				const granted = await galleryScanner.requestPermissions();
				if (!granted) {
					showToast({
						type: "error",
						message: "Gallery access required to scan documents",
					});
					return;
				}
			}

			// Check notification permissions (required for background service notifications)
			console.log("[HomeScreen] Checking notification permissions...");
			const notificationGranted =
				await notificationPermissions.ensurePermission();
			if (!notificationGranted) {
				showToast({
					type: "info",
					message:
						"Notification permission not granted. Scan will proceed without progress notifications.",
				});
			}

			// Clear the manual stop flag when starting manually
			await ScannerStorage.removeItem("manual_scan_stopped");

			// Start the background service
			console.log("[HomeScreen] Starting background scanner service...");
			await backgroundScanner.startPeriodicScan();

			showToast({
				type: "success",
				message:
					"Checking gallery for new documents... Check notifications for progress.",
			});

			// Refresh documents periodically while scanning
			const refreshInterval = setInterval(async () => {
				const status = await backgroundScanner.getBackgroundServiceStatus();
				if (!status.isRunning) {
					clearInterval(refreshInterval);
					await loadDocuments(); // Final refresh when scan completes
				} else {
					await loadDocuments(); // Periodic refresh during scan
				}
			}, 10000); // Refresh every 10 seconds
		} catch (error) {
			console.error("Background scan error:", error);
			showToast({
				type: "error",
				message: "Failed to start background scan",
			});
		}
	}, [loadDocuments]);

	// Periodically check background scanner status to keep UI in sync
	useEffect(() => {
		const interval = setInterval(async () => {
			try {
				const status = await backgroundScanner.getBackgroundServiceStatus();
				const isBackgroundRunning = status.isRunning && status.isServiceRunning;

				// Update background scan enabled state if it changed
				if (isBackgroundRunning !== isBackgroundScanEnabled) {
					console.log(
						"[HomeScreen] Background scan state changed:",
						isBackgroundRunning,
					);
				}
			} catch (error) {
				console.error("[HomeScreen] Error checking background status:", error);
			}
		}, 2000); // Check every 2 seconds

		return () => clearInterval(interval);
	}, [isBackgroundScanEnabled]);

	// Check for existing documents first (faster than loading all)
	useEffect(() => {
		checkExistingDocuments();
	}, [checkExistingDocuments]);

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
				{/* * biome-ignore lint/complexity/noUselessFragments: <explanation> */}
				<>
					<AppHeader setShowUploadModal={setShowUploadModal} />

					{isScanning && scanProgress && (
						<ScanProgressBar
							progress={scanProgress}
							animated
						/>
					)}

					<DocumentGrid
						onDocumentPress={handleDocumentPress}
						handleStartBackgroundScan={handleStartBackgroundScan}
					/>
				</>
			</TouchableWithoutFeedback>

			<Animated.View style={[styles.searchWrapper, searchBarStyle]}>
				<SearchBar
					onResultsChange={(results) => {
						// Update your document grid with search results
						console.log("Search results:", results);
					}}
					showHistory={true}
					autoFocus={false}
				/>
			</Animated.View>

			<DocumentModal
				visible={isModalVisible}
				document={selectedDocument}
				onClose={closeDocumentModal}
			/>
			<UploadModal
				visible={showUploadModal}
				onClose={() => setShowUploadModal(false)}
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
		searchWrapper: {
			position: "absolute",
			bottom: 0,
			left: 0,
			right: 0,
		},
	});
