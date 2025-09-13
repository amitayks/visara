import { createStackNavigator } from "@react-navigation/stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { AutocompleteDropdownContextProvider } from "react-native-autocomplete-dropdown"; // Commented out - package removed
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemeProvider } from "../contexts/ThemeContext";
import { backgroundScanner } from "../services/gallery/backgroundScanner";
import { initializeMemoryManagement } from "../services/memory/initializeMemoryManagement";
import { MiniSearchService } from "../services/search/MiniSearchService";
import { AppStorage, ScannerStorage } from "../storage/MMKVStorage";
import { settingsStore, useSettingsStore } from "../stores/settingsStore";
import type { RootStackParamList } from "../types/navigation";
import { permissionChangeHandler } from "../utils/permissionChangeHandler";
import HomeScreen from "./index";
import SettingsScreen from "./settings";
// Load icon font
Icon.loadFont();

const Stack = createStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

export default function RootLayout() {
	const { settings } = useSettingsStore();

	useEffect(() => {
		const initializeApp = async () => {
			try {
				console.log("[App Launch] Initializing app services...");

				// CRITICAL: Check for incomplete scan first
				const resumeState = (await ScannerStorage.getObject(
					"scan_resume_state",
				)) as any;
				if (resumeState && resumeState.lastProcessedIndex) {
					console.log("[App Launch] Found incomplete scan, will resume");

					// Set flag to resume scan
					await ScannerStorage.setObject("should_resume_scan", true);
				}

				// Check for crash recovery
				const lastCrashReason = await AppStorage.getItem("last_crash_reason");
				if (lastCrashReason) {
					console.log(`[App Launch] Recovering from crash: ${lastCrashReason}`);
					await AppStorage.removeItem("last_crash_reason");

					// Clear any stuck states
					await backgroundScanner.cleanup();
				}

				// Initialize memory management first
				await initializeMemoryManagement();
				console.log("[App Launch] Memory management initialized");

				// Initialize search service
				try {
					const searchService = MiniSearchService.getInstance();
					await searchService.initialize();
					console.log("[App Launch] Search service initialized");
				} catch (error) {
					console.error("[App Launch] Failed to initialize search:", error);
				}

				// Initialize permission handler
				permissionChangeHandler.initialize();
				console.log("[App Launch] Permission handler initialized");

				// Check auto-scan settings
				const settings = settingsStore.getState().settings;
				const manualStopped = await ScannerStorage.getItem(
					"manual_scan_stopped",
				);

				if (settings.autoScan && !manualStopped) {
					try {
						// Check if we should resume scan
						const shouldResume =
							await ScannerStorage.getObject("should_resume_scan");

						if (shouldResume) {
							console.log("[App Launch] Resuming incomplete scan...");
							await ScannerStorage.removeItem("should_resume_scan");

							// Start background scanner (it will handle resume automatically)
							await backgroundScanner.startPeriodicScan();
						} else {
							await backgroundScanner.startPeriodicScan();
						}

						console.log(
							"[App Launch] Background scanning service started successfully",
						);
					} catch (error) {
						console.error(
							"[App Launch] Failed to start background scanning:",
							error,
						);

						// Save error for diagnostics
						await AppStorage.setItem(
							"last_startup_error",
							(error as Error).toString(),
						);
					}
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
			{/* <AutocompleteDropdownContextProvider> */}
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
			{/* </AutocompleteDropdownContextProvider> */}
		</GestureHandlerRootView>
	);
}
