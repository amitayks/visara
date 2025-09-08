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
import { useDocumentStore } from "../stores/documentStore";
import { useSettingsStore } from "../stores/settingsStore";

import { AppHeader } from "./components/AppHeader";
import { Document } from "./components/DocumentGrid";
import { FlashDocumentGrid } from "./components/DocumentGrid/FlashDocumentGrid";
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
			// setIsScanning(false);
			setScanProgress(null);
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

					<FlashDocumentGrid
						onDocumentPress={handleDocumentPress}
						handleStartBackgroundScan={handleStartBackgroundScan}
						contentContainerStyle={{
							paddingBottom: 100,
						}}
					/>
				</>
			</TouchableWithoutFeedback>

			{/* Search Section - Fixed at bottom */}
			<Animated.View style={[styles.searchWrapper, searchBarStyle]}>
				<Button title="start scaning" onPress={handleStartBackgroundScan} />
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
