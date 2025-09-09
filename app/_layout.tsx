import { createStackNavigator } from "@react-navigation/stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemeProvider } from "../contexts/ThemeContext";
import { initializeDatabase } from "../services/database";
import { backgroundScanner } from "../services/gallery/backgroundScanner";
import { galleryScanner } from "../services/gallery/GalleryScanner";
import { ScannerStorage } from "../storage/MMKVStorage";
import { useSettingsStore } from "../stores/settingsStore";
import type { RootStackParamList } from "../types/navigation";
import HomeScreen from "./index";
import SettingsScreen from "./settings";

// Load icon font
Icon.loadFont();

const Stack = createStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

export default function RootLayout() {
	const { settings } = useSettingsStore();
	
	useEffect(() => {
		// Initialize permissions and background scanning on app mount
		const initializeApp = async () => {
			try {
				// Initialize database first
				await initializeDatabase();

				// Check if we have gallery permissions
				const hasPermission = await galleryScanner.hasPermissions();

				if (!hasPermission) {
					// Don't request permissions automatically - let user decide
					console.log("Gallery permissions not granted yet");
					return;
				}

				// Check if we should start automatic scanning based on user settings
				const manualStopped = await ScannerStorage.getItem("manual_scan_stopped");
				
				if (!manualStopped && settings.autoScan) {
					console.log(`[App Launch] Starting automatic scanning with frequency: ${settings.scanFrequency}`);
					
					try {
						// Always use the background scanner for automatic scanning
						// This handles both initial scans and ongoing automatic scanning
						await backgroundScanner.startPeriodicScan();
						console.log("[App Launch] Background scanning service started successfully");
					} catch (error) {
						console.error("[App Launch] Failed to start background scanning:", error);
					}
				} else if (manualStopped) {
					console.log("[App Launch] Automatic scanning disabled - user manually stopped");
				} else if (!settings.autoScan) {
					console.log("[App Launch] Automatic scanning disabled in settings");
				}
			} catch (error) {
				console.error("App initialization error:", error);
			}
		};

		// Delay initialization to let the app fully mount
		const timer = setTimeout(initializeApp, 2000);

		return () => clearTimeout(timer);
	}, []);

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<Stack.Navigator
						initialRouteName="Home"
						screenOptions={{
							headerShown: false,
							gestureEnabled: true,
							gestureDirection:
								Platform.OS === "ios" ? "horizontal" : "vertical",
						}}
					>
						<Stack.Screen
							name="Home"
							component={HomeScreen}
							options={{
								gestureEnabled: false, // Disable swipe back on home screen
							}}
						/>
						<Stack.Screen
							name="Settings"
							component={SettingsScreen}
							options={{
								headerShown: false,
								gestureEnabled: true,
							}}
						/>
					</Stack.Navigator>
				</QueryClientProvider>
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}
