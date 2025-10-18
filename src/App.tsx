import { toastConfig } from "@components/atoms/ToastNotification";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { GalleryProvider } from "@contexts/GalleryContext";
import { NavigationProvider } from "@contexts/NavigationContext";
import { ProcessingProvider } from "@contexts/ProcessingContext";
import { SearchProvider } from "@contexts/SearchContext";
import { SettingsProvider, useSettings } from "@contexts/SettingsContext";
import { ToastProvider } from "@contexts/ToastContext";
import { useDatabase } from "@hooks/useDatabase";
import { useMediaLoader } from "@hooks/useMediaLoader";
import { useProcessingOrchestrator } from "@hooks/useProcessingOrchestrator";
import { RootNavigator } from "@navigation/RootNavigator";
import React, { useEffect, useRef } from "react";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { ThumbnailService } from "@services/media/ThumbnailService";

/**
 * AppContent - Initializes hooks after providers are ready
 * Must be inside providers to access context
 */
function AppContent(): React.JSX.Element {
	const colorScheme = useColorScheme();
	const { state } = useSettings();

	const { isReady: dbReady } = useDatabase();
	const shouldInitialize = state.preferences.onboardingCompleted && dbReady;

	// Initialize ThumbnailService once on app start
	const thumbnailServiceInitializedRef = useRef(false);
	useEffect(() => {
		if (!thumbnailServiceInitializedRef.current) {
			ThumbnailService.initialize()
				.then(() => {
					console.log("✅ ThumbnailService initialized");
				})
				.catch((error) => {
					console.error("❌ Failed to initialize ThumbnailService:", error);
				});
			thumbnailServiceInitializedRef.current = true;
		}
	}, []);

	useMediaLoader(shouldInitialize);
	useProcessingOrchestrator(shouldInitialize);

	return (
		<>
			<StatusBar
				barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
				backgroundColor="transparent"
				translucent
			/>
			<RootNavigator />
			<Toast config={toastConfig} />
		</>
	);
}

function App(): React.JSX.Element {
	return (
		<ErrorBoundary>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<SafeAreaProvider>
					<ToastProvider>
						<SettingsProvider>
							<NavigationProvider>
								<GalleryProvider>
									<ProcessingProvider>
										<SearchProvider>
											<AppContent />
										</SearchProvider>
									</ProcessingProvider>
								</GalleryProvider>
							</NavigationProvider>
						</SettingsProvider>
					</ToastProvider>
				</SafeAreaProvider>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
}

export default App;
