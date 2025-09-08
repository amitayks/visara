import { useCallback, useEffect, useState } from "react";
import {
	Button,
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
import { backgroundScanner } from "../services/gallery/backgroundScanner";
import { notificationPermissions } from "../services/permissions/notificationPermissions";
import { useDocumentStore } from "../stores/documentStore";
import { useSettingsStore } from "../stores/settingsStore";

import { AppHeader } from "./components/AppHeader";
import { type Document, DocumentGrid } from "./components/DocumentGrid";
import { DocumentModal } from "./components/DocumentModal";
import { ScanProgressBar } from "./components/ScanProgressBar";
import { SearchContainer } from "./components/SearchContainer";
import { showToast, ToastContainer } from "./components/Toast";
import { UploadModal } from "./components/UploadModal";

export default function HomeScreen() {
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);

	const { loadDocuments, initializeRealTimeUpdates } = useDocumentStore();
	const { settings } = useSettingsStore();

	// Local UI state
	const [selectedDocument, setSelectedDocument] = useState<Document | null>(
		null,
	);

	// UI state
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

	// Handle document press
	const handleDocumentPress = useCallback((doc: Document) => {
		setSelectedDocument(doc);
		setShowDocumentModal(true);
	}, []);

	const handleStartBackgroundScan = useCallback(async () => {
		try {
			// Check if background scanning is already running
			// const isRunning = backgroundScanner.isBackgroundServiceRunning();
			const isRunning = true;
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

			// Start the background service
			console.log("[HomeScreen] Starting background scanner service...");
			await backgroundScanner.startPeriodicScan();

			showToast({
				type: "success",
				message:
					"Background scanning started! Check your notifications for progress.",
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
					{/* Header */}
					<AppHeader setShowUploadModal={setShowUploadModal} />

					{/* Scanning Progress */}
					{isScanning && scanProgress && (
						<ScanProgressBar
							current={scanProgress.processedImages}
							total={scanProgress.totalImages}
							animated
						/>
					)}

					{/* Flash Document Grid - Pinterest-style masonry layout */}

					<DocumentGrid
						onDocumentPress={handleDocumentPress}
						handleStartBackgroundScan={handleStartBackgroundScan}
					/>
				</>
			</TouchableWithoutFeedback>

			{/* Search Section - Fixed at bottom */}
			<Animated.View style={[styles.searchWrapper, searchBarStyle]}>
				{!isScanning && (
					<Button
						title="Start Background Scan"
						onPress={handleStartBackgroundScan}
					/>
				)}
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
