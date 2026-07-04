import { OrchestratorBridge } from "@components/system/OrchestratorBridge";
import { GalleryProvider } from "@contexts/GalleryContext";
import { NavigationProvider } from "@contexts/NavigationContext";
import { ProcessingProvider } from "@contexts/ProcessingContext";
import { SearchProvider } from "@contexts/SearchContext";
import { SettingsProvider } from "@contexts/SettingsContext";
import { RootNavigator } from "@navigation/RootNavigator";
import { DevPocLauncher } from "@screens/Dev/DevPocLauncher";
import { UnistylesSpike } from "@features/dev/UnistylesSpike";
import React from "react";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Phase-0 spike gate (rebuild-ui-foundation task 1.3) — removed at cutover.
const RUN_UNISTYLES_SPIKE = true;

function App(): React.JSX.Element {
	const colorScheme = useColorScheme();

	if (__DEV__ && RUN_UNISTYLES_SPIKE) {
		return (
			<GestureHandlerRootView style={{ flex: 1 }}>
				<SafeAreaProvider>
					<UnistylesSpike />
				</SafeAreaProvider>
			</GestureHandlerRootView>
		);
	}

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
