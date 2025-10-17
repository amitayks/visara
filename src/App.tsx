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
import React from "react";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

/**
 * AppContent - Initializes hooks after providers are ready
 * Must be inside providers to access context
 */
function AppContent(): React.JSX.Element {
	const colorScheme = useColorScheme();
	const { state } = useSettings();

	const { isReady: dbReady } = useDatabase();
	const shouldInitialize = state.preferences.onboardingCompleted && dbReady;

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
