// components/ProgressSystemTest.tsx
// Test component to verify the new progress system works correctly

import React, { useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert,
} from "react-native";
import { galleryScanner } from "../services/gallery/GalleryScanner";
import { smartProgress } from "../services/progress/SmartProgressController";
import { notificationProgress } from "../services/notifications/NotificationProgressManager";

export const ProgressSystemTest: React.FC = () => {
	const [isScanning, setIsScanning] = useState(false);
	const [lastResult, setLastResult] = useState<string>("No test run yet");

	const runTest = async (testName: string, testFn: () => Promise<void>) => {
		console.log(`[TEST] Starting: ${testName}`);
		setIsScanning(true);
		setLastResult(`Running: ${testName}`);

		const startTime = Date.now();

		try {
			await testFn();
			const duration = ((Date.now() - startTime) / 1000).toFixed(2);
			const result = `✅ ${testName}\nCompleted in ${duration}s`;
			setLastResult(result);
			console.log(`[TEST] Success: ${testName}`);
		} catch (error) {
			const result = `❌ ${testName}\nError: ${error}`;
			setLastResult(result);
			console.error(`[TEST] Failed: ${testName}`, error);
		} finally {
			setIsScanning(false);
		}
	};

	// Test 1: Monitoring scan (should NOT show UI)
	const testMonitoringScan = async () => {
		await runTest("Monitoring Scan (No UI)", async () => {
			await galleryScanner.startScan({
				scanNewOnly: true,
				processImmediately: false,
				isMonitoring: true, // Key flag
				batchSize: 100,
			});

			// Verify no UI was shown
			if (smartProgress.shouldShowUI()) {
				throw new Error("UI was shown for monitoring scan!");
			}
		});
	};

	// Test 2: Processing scan (should show progress bar)
	const testProcessingScan = async () => {
		await runTest("Processing Scan (Show Progress Bar)", async () => {
			await galleryScanner.startScan({
				scanNewOnly: true,
				processImmediately: true,
				isMonitoring: false, // Should show UI
				batchSize: 20,
			});
		});
	};

	// Test 3: Background scan (should show notification only)
	const testBackgroundScan = async () => {
		await runTest("Background Scan (Notification Only)", async () => {
			await galleryScanner.startScan({
				scanNewOnly: true,
				processImmediately: true,
				isMonitoring: false,
				isBackground: true, // Should show notification
				batchSize: 10,
			});
		});
	};

	// Test 4: Small batch (should not show UI)
	const testSmallBatch = async () => {
		await runTest("Small Batch (< 5 images, No UI)", async () => {
			// Mock a small scan
			smartProgress.onScanStart({
				totalImages: 3, // Less than threshold
				scanType: "processing",
				isBackground: false,
				scanNewOnly: true,
			});

			await new Promise((resolve) => setTimeout(resolve, 1000));

			smartProgress.onScanComplete({
				totalProcessed: 3,
				newImages: 3,
				duration: 1000,
			});

			if (smartProgress.shouldShowUI()) {
				throw new Error("UI was shown for small batch!");
			}
		});
	};

	// Test 5: Force hide all UI
	const testForceHide = async () => {
		await runTest("Force Hide All UI", async () => {
			// Start progress
			smartProgress.onScanStart({
				totalImages: 100,
				scanType: "processing",
				isBackground: true,
				scanNewOnly: false,
			});

			await new Promise((resolve) => setTimeout(resolve, 500));

			// Force hide
			smartProgress.hideAll();

			// Verify hidden
			if (smartProgress.shouldShowUI()) {
				throw new Error("UI still showing after force hide!");
			}

			if (notificationProgress.isShowing()) {
				throw new Error("Notification still showing after force hide!");
			}
		});
	};

	// Test 6: Quick succession (simulate monitoring)
	const testQuickSuccession = async () => {
		await runTest("Quick Succession (10s monitoring simulation)", async () => {
			let uiShownCount = 0;

			for (let i = 0; i < 3; i++) {
				await galleryScanner.startScan({
					scanNewOnly: true,
					processImmediately: false,
					isMonitoring: true,
					batchSize: 100,
				});

				if (smartProgress.shouldShowUI()) {
					uiShownCount++;
				}

				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			if (uiShownCount > 0) {
				throw new Error(`UI shown ${uiShownCount} times during monitoring!`);
			}
		});
	};

	return (
		<ScrollView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Progress System Tests</Text>
				<Text style={styles.subtitle}>
					Verify notification and progress bar behavior
				</Text>
			</View>

			<View style={styles.resultBox}>
				<Text style={styles.resultTitle}>Last Test Result:</Text>
				<Text style={styles.resultText}>{lastResult}</Text>
			</View>

			<View style={styles.testSection}>
				<Text style={styles.sectionTitle}>UI Visibility Tests</Text>

				<TestButton
					title="Test Monitoring (No UI)"
					onPress={testMonitoringScan}
					disabled={isScanning}
					description="Should NOT show progress bar or notification"
				/>

				<TestButton
					title="Test Processing (Show UI)"
					onPress={testProcessingScan}
					disabled={isScanning}
					description="Should show progress bar"
					color="#4CAF50"
				/>

				<TestButton
					title="Test Background (Notification)"
					onPress={testBackgroundScan}
					disabled={isScanning}
					description="Should show notification only"
					color="#2196F3"
				/>

				<TestButton
					title="Test Small Batch (No UI)"
					onPress={testSmallBatch}
					disabled={isScanning}
					description="< 5 images should not show UI"
					color="#FF9800"
				/>
			</View>

			<View style={styles.testSection}>
				<Text style={styles.sectionTitle}>Control Tests</Text>

				<TestButton
					title="Test Force Hide"
					onPress={testForceHide}
					disabled={isScanning}
					description="Force hide all UI elements"
					color="#9C27B0"
				/>

				<TestButton
					title="Test Quick Succession"
					onPress={testQuickSuccession}
					disabled={isScanning}
					description="Simulate 10-second monitoring"
					color="#795548"
				/>
			</View>

			<View style={styles.infoBox}>
				<Text style={styles.infoTitle}>Expected Behavior:</Text>
				<Text style={styles.infoText}>
					✅ Monitoring scans: No UI{"\n"}✅ Processing scans: Progress bar
					visible{"\n"}✅ Background scans: Notification only{"\n"}✅ Small
					batches ({"<"}5): No UI{"\n"}✅ UI hides after completion{"\n"}❌ No
					progress bar every 10 seconds
				</Text>
			</View>
		</ScrollView>
	);
};

const TestButton: React.FC<{
	title: string;
	onPress: () => void;
	disabled?: boolean;
	description?: string;
	color?: string;
}> = ({ title, onPress, disabled, description, color = "#007AFF" }) => (
	<TouchableOpacity
		style={[styles.button, { backgroundColor: disabled ? "#ccc" : color }]}
		onPress={onPress}
		disabled={disabled}
	>
		<Text style={styles.buttonText}>{title}</Text>
		{description && <Text style={styles.buttonDescription}>{description}</Text>}
	</TouchableOpacity>
);

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f5f5f5",
	},
	header: {
		backgroundColor: "white",
		padding: 20,
		borderBottomWidth: 1,
		borderBottomColor: "#e0e0e0",
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: "#333",
	},
	subtitle: {
		fontSize: 14,
		color: "#666",
		marginTop: 4,
	},
	resultBox: {
		backgroundColor: "white",
		margin: 16,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#e0e0e0",
	},
	resultTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#666",
		marginBottom: 8,
	},
	resultText: {
		fontSize: 16,
		color: "#333",
		fontFamily: "monospace",
	},
	testSection: {
		backgroundColor: "white",
		marginHorizontal: 16,
		marginBottom: 16,
		padding: 16,
		borderRadius: 12,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		marginBottom: 12,
		color: "#333",
	},
	button: {
		padding: 14,
		borderRadius: 8,
		marginBottom: 10,
	},
	buttonText: {
		color: "white",
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
	},
	buttonDescription: {
		color: "rgba(255, 255, 255, 0.9)",
		fontSize: 12,
		textAlign: "center",
		marginTop: 4,
	},
	infoBox: {
		backgroundColor: "#E3F2FD",
		margin: 16,
		padding: 16,
		borderRadius: 12,
	},
	infoTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#1976D2",
		marginBottom: 8,
	},
	infoText: {
		fontSize: 14,
		lineHeight: 20,
		color: "#424242",
	},
});
