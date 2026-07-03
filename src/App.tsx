import { OrchestratorBridge } from "@components/system/OrchestratorBridge";
import { GalleryProvider } from "@contexts/GalleryContext";
import { NavigationProvider } from "@contexts/NavigationContext";
import { ProcessingProvider } from "@contexts/ProcessingContext";
import { SearchProvider } from "@contexts/SearchContext";
import { SettingsProvider } from "@contexts/SettingsContext";
import { RootNavigator } from "@navigation/RootNavigator";
import { DevPocLauncher } from "@screens/Dev/DevPocLauncher";
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
									{/* Null-rendering pipeline wiring; reads all three contexts. */}
									<OrchestratorBridge />
									<RootNavigator />
								</SearchProvider>
							</ProcessingProvider>
						</GalleryProvider>
					</NavigationProvider>
				</SettingsProvider>
				{/* Dev-only ExecuTorch POC entry; stripped from production builds. */}
				{__DEV__ ? <DevPocLauncher /> : null}
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

export default App;
