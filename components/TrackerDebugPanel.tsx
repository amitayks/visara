// // components/TrackerDebugPanel.tsx
// // Add this component to your settings or debug screen to verify the fix is working

// import React, { useState, useEffect } from "react";
// import {
// 	View,
// 	Text,
// 	TouchableOpacity,
// 	ScrollView,
// 	StyleSheet,
// 	Alert,
// } from "react-native";
// import { fixedImageTracker } from "../services/gallery/FixedImageTracker";
// import { galleryScanner } from "../services/gallery/GalleryScanner";

// export const TrackerDebugPanel: React.FC = () => {
// 	const [stats, setStats] = useState<any>(null);
// 	const [debugInfo, setDebugInfo] = useState<any>(null);
// 	const [isScanning, setIsScanning] = useState(false);

// 	useEffect(() => {
// 		loadStats();
// 	}, []);

// 	const loadStats = async () => {
// 		const trackerStats = fixedImageTracker.getStats();
// 		const trackerDebug = fixedImageTracker.getDebugInfo();
// 		setStats(trackerStats);
// 		setDebugInfo(trackerDebug);
// 	};

// 	const testInitialScan = async () => {
// 		Alert.alert(
// 			"Test Initial Scan",
// 			"This will scan ALL images as if it's the first time. Continue?",
// 			[
// 				{ text: "Cancel", style: "cancel" },
// 				{
// 					text: "Start",
// 					onPress: async () => {
// 						setIsScanning(true);
// 						try {
// 							await galleryScanner.startScan({
// 								scanNewOnly: false, // Process everything
// 								processImmediately: true,
// 								type: "full",
// 							});
// 							Alert.alert("Success", "Initial scan completed");
// 						} catch (error) {
// 							Alert.alert("Error", String(error));
// 						} finally {
// 							setIsScanning(false);
// 							loadStats();
// 						}
// 					},
// 				},
// 			],
// 		);
// 	};

// 	const testIncrementalScan = async () => {
// 		setIsScanning(true);
// 		try {
// 			const startTime = Date.now();

// 			await galleryScanner.startScan({
// 				scanNewOnly: true, // Only new images
// 				processImmediately: true,
// 				type: "incremental",
// 			});

// 			const duration = Date.now() - startTime;
// 			Alert.alert(
// 				"Incremental Scan Complete",
// 				`Duration: ${(duration / 1000).toFixed(2)}s\n` +
// 					`This should be very fast if no new images exist.`,
// 			);
// 		} catch (error) {
// 			Alert.alert("Error", String(error));
// 		} finally {
// 			setIsScanning(false);
// 			loadStats();
// 		}
// 	};

// 	const clearAllData = async () => {
// 		Alert.alert(
// 			"Clear All Tracking Data",
// 			"This will reset the tracker. All images will be considered new. Continue?",
// 			[
// 				{ text: "Cancel", style: "cancel" },
// 				{
// 					text: "Clear",
// 					style: "destructive",
// 					onPress: async () => {
// 						await fixedImageTracker.clearAll();
// 						Alert.alert("Success", "All tracking data cleared");
// 						loadStats();
// 					},
// 				},
// 			],
// 		);
// 	};

// 	const verifyPersistence = async () => {
// 		// Save current state
// 		await fixedImageTracker.forceSave();

// 		// Create new instance (simulates app restart)
// 		const newTracker = new (fixedImageTracker.constructor as any)();
// 		const newStats = newTracker.getStats();

// 		Alert.alert(
// 			"Persistence Check",
// 			`Current: ${stats?.totalImages || 0} images\n` +
// 				`After reload: ${newStats.totalImages} images\n` +
// 				`${newStats.totalImages === stats?.totalImages ? "✅ Persistence working!" : "❌ Persistence failed!"}`,
// 		);
// 	};

// 	return (
// 		<ScrollView style={styles.container}>
// 			<View style={styles.section}>
// 				<Text style={styles.title}>Image Tracker Status</Text>

// 				{stats && (
// 					<View style={styles.statsBox}>
// 						<StatRow label="Total Images" value={stats.totalImages} />
// 						<StatRow
// 							label="Processed"
// 							value={stats.processedImages}
// 							color="#4CAF50"
// 						/>
// 						<StatRow
// 							label="Pending"
// 							value={stats.pendingImages}
// 							color="#FF9800"
// 						/>
// 						<StatRow
// 							label="Failed"
// 							value={stats.failedImages}
// 							color="#F44336"
// 						/>
// 					</View>
// 				)}

// 				{debugInfo && (
// 					<View style={styles.statsBox}>
// 						<Text style={styles.subtitle}>Debug Info</Text>
// 						<StatRow label="Total Records" value={debugInfo.totalRecords} />
// 						<StatRow label="URI Mappings" value={debugInfo.totalUris} />
// 						<StatRow label="Content Hashes" value={debugInfo.totalHashes} />
// 						<StatRow
// 							label="Needs Save"
// 							value={debugInfo.isDirty ? "Yes" : "No"}
// 						/>
// 					</View>
// 				)}
// 			</View>

// 			<View style={styles.section}>
// 				<Text style={styles.title}>Test Actions</Text>

// 				<TestButton
// 					title="Test Initial Scan (Process All)"
// 					onPress={testInitialScan}
// 					disabled={isScanning}
// 					description="Simulates first-time app usage"
// 				/>

// 				<TestButton
// 					title="Test Incremental Scan (New Only)"
// 					onPress={testIncrementalScan}
// 					disabled={isScanning}
// 					description="Should be instant if no new images"
// 					color="#4CAF50"
// 				/>

// 				<TestButton
// 					title="Verify Persistence"
// 					onPress={verifyPersistence}
// 					disabled={isScanning}
// 					description="Check if data survives app restart"
// 					color="#2196F3"
// 				/>

// 				<TestButton
// 					title="Clear All Tracking Data"
// 					onPress={clearAllData}
// 					disabled={isScanning}
// 					description="Reset to fresh state"
// 					color="#F44336"
// 				/>

// 				<TestButton
// 					title="Refresh Stats"
// 					onPress={loadStats}
// 					disabled={isScanning}
// 					description="Reload current statistics"
// 					color="#9C27B0"
// 				/>
// 			</View>

// 			<View style={styles.section}>
// 				<Text style={styles.title}>Expected Behavior</Text>
// 				<Text style={styles.description}>
// 					✅ Initial scan: Processes all images (slow){"\n"}✅ Second scan: Skip
// 					all processed (fast){"\n"}✅ New image added: Only process that one
// 					{"\n"}✅ App restart: Remember processed images{"\n"}✅ URI changes:
// 					Still recognize images
// 				</Text>
// 			</View>
// 		</ScrollView>
// 	);
// };

// const StatRow: React.FC<{ label: string; value: any; color?: string }> = ({
// 	label,
// 	value,
// 	color,
// }) => (
// 	<View style={styles.statRow}>
// 		<Text style={styles.statLabel}>{label}:</Text>
// 		<Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
// 	</View>
// );

// const TestButton: React.FC<{
// 	title: string;
// 	onPress: () => void;
// 	disabled?: boolean;
// 	description?: string;
// 	color?: string;
// }> = ({ title, onPress, disabled, description, color = "#007AFF" }) => (
// 	<TouchableOpacity
// 		style={[styles.button, { backgroundColor: disabled ? "#ccc" : color }]}
// 		onPress={onPress}
// 		disabled={disabled}
// 	>
// 		<Text style={styles.buttonText}>{title}</Text>
// 		{description && <Text style={styles.buttonDescription}>{description}</Text>}
// 	</TouchableOpacity>
// );

// const styles = StyleSheet.create({
// 	container: {
// 		flex: 1,
// 		backgroundColor: "#f5f5f5",
// 	},
// 	section: {
// 		backgroundColor: "white",
// 		margin: 16,
// 		padding: 16,
// 		borderRadius: 12,
// 		shadowColor: "#000",
// 		shadowOffset: { width: 0, height: 2 },
// 		shadowOpacity: 0.1,
// 		shadowRadius: 4,
// 		elevation: 3,
// 	},
// 	title: {
// 		fontSize: 18,
// 		fontWeight: "bold",
// 		marginBottom: 12,
// 		color: "#333",
// 	},
// 	subtitle: {
// 		fontSize: 14,
// 		fontWeight: "600",
// 		marginTop: 8,
// 		marginBottom: 4,
// 		color: "#666",
// 	},
// 	statsBox: {
// 		backgroundColor: "#f9f9f9",
// 		padding: 12,
// 		borderRadius: 8,
// 		marginBottom: 8,
// 	},
// 	statRow: {
// 		flexDirection: "row",
// 		justifyContent: "space-between",
// 		paddingVertical: 4,
// 	},
// 	statLabel: {
// 		fontSize: 14,
// 		color: "#666",
// 	},
// 	statValue: {
// 		fontSize: 14,
// 		fontWeight: "600",
// 		color: "#333",
// 	},
// 	button: {
// 		padding: 12,
// 		borderRadius: 8,
// 		marginBottom: 8,
// 	},
// 	buttonText: {
// 		color: "white",
// 		fontSize: 16,
// 		fontWeight: "600",
// 		textAlign: "center",
// 	},
// 	buttonDescription: {
// 		color: "rgba(255, 255, 255, 0.8)",
// 		fontSize: 12,
// 		textAlign: "center",
// 		marginTop: 4,
// 	},
// 	description: {
// 		fontSize: 14,
// 		lineHeight: 20,
// 		color: "#666",
// 	},
// });

// // ============================================
// // Usage in your app
// // ============================================

// // Add to your settings or debug screen:
// // import { TrackerDebugPanel } from './components/TrackerDebugPanel';
// //
// // <TrackerDebugPanel />

// // Or add a simple debug button to your main screen:
// export const QuickDebugButton: React.FC = () => {
// 	const [showDebug, setShowDebug] = useState(false);

// 	if (!__DEV__) return null; // Only show in development

// 	return (
// 		<>
// 			<TouchableOpacity
// 				style={{
// 					position: "absolute",
// 					bottom: 100,
// 					right: 20,
// 					backgroundColor: "#FF6B6B",
// 					width: 50,
// 					height: 50,
// 					borderRadius: 25,
// 					justifyContent: "center",
// 					alignItems: "center",
// 					zIndex: 1000,
// 				}}
// 				onPress={() => setShowDebug(!showDebug)}
// 			>
// 				<Text style={{ color: "white", fontWeight: "bold" }}>DBG</Text>
// 			</TouchableOpacity>

// 			{showDebug && (
// 				<Modal visible={showDebug} animationType="slide">
// 					<SafeAreaView style={{ flex: 1 }}>
// 						<View
// 							style={{
// 								flexDirection: "row",
// 								justifyContent: "space-between",
// 								padding: 16,
// 							}}
// 						>
// 							<Text style={{ fontSize: 20, fontWeight: "bold" }}>
// 								Tracker Debug
// 							</Text>
// 							<TouchableOpacity onPress={() => setShowDebug(false)}>
// 								<Text style={{ color: "#007AFF", fontSize: 16 }}>Close</Text>
// 							</TouchableOpacity>
// 						</View>
// 						<TrackerDebugPanel />
// 					</SafeAreaView>
// 				</Modal>
// 			)}
// 		</>
// 	);
// };
