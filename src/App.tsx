import { GalleryProvider } from "@contexts/GalleryContext";
import { NavigationProvider } from "@contexts/NavigationContext";
import { ProcessingProvider } from "@contexts/ProcessingContext";
import { SearchProvider } from "@contexts/SearchContext";
import { SettingsProvider } from "@contexts/SettingsContext";
import { ToastProvider } from "@contexts/ToastContext";
import { RootNavigator } from "@navigation/RootNavigator";
import React from "react";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { toastConfig } from "@components/atoms/ToastNotification";

function App(): React.JSX.Element {
	const colorScheme = useColorScheme();

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
											<StatusBar
												barStyle={
													colorScheme === "dark" ? "light-content" : "dark-content"
												}
												backgroundColor="transparent"
												translucent
											/>
											<RootNavigator />
											<Toast config={toastConfig} />
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
