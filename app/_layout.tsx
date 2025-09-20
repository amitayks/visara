import { createStackNavigator } from "@react-navigation/stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemeProvider } from "../contexts/ThemeContext";
import { MiniSearchService } from "../services/search/MiniSearchService";
import type { RootStackParamList } from "../types/navigation";
import { ErrorBoundary } from "./components/ErrorBoundary";
import HomeScreen from "./index";
import SettingsScreen from "./settings";
import WelcomeScreen from "./WelcomeScreen";

const Stack = createStackNavigator<RootStackParamList>();
// Load icon font
Icon.loadFont();

const queryClient = new QueryClient();

export default function RootLayout() {
	useEffect(() => {
		const initializeApp = async () => {
			try {
				console.log("[App] Initializing services...");

				// Initialize search service
				try {
					const searchService = MiniSearchService.getInstance();
					await searchService.initialize();
					console.log("[App] Search service initialized");
				} catch (error) {
					console.error("[App] Failed to initialize search:", error);
				}
			} catch (error) {
				console.error("[App] Initialization error:", error);
			}
		};

		// Initialize services
		initializeApp();
	}, []);

	return (
		<ErrorBoundary>
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
								gestureEnabled: false,
							}}
						/>
						<Stack.Screen
							name="Welcome"
							component={WelcomeScreen}
							options={{
								gestureEnabled: false,
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
		</ErrorBoundary>
	);
}
