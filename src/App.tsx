import { GalleryProvider } from "@contexts/GalleryContext";
import { ProcessingProvider } from "@contexts/ProcessingContext";
import { SearchProvider } from "@contexts/SearchContext";
import { SettingsProvider } from "@contexts/SettingsContext";
import { RootNavigator } from "@navigation/RootNavigator";
import React from "react";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

function App(): React.JSX.Element {
	const colorScheme = useColorScheme();

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<SettingsProvider>
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
							</SearchProvider>
						</ProcessingProvider>
					</GalleryProvider>
				</SettingsProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

export default App;
