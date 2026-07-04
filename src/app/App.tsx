/**
 * New-tree app root (rebuild-ui-foundation, design D6): becomes the
 * registered component at cutover; until then the old src/App.tsx keeps
 * running untouched. Providers stay minimal by design — state lives in
 * zustand stores, theming in Unistyles, services behind @app/bootstrap.
 */

import { startAppServices, stopAppServices } from "@app/bootstrap";
import { DevPocLauncher } from "@features/dev";
import { startSearchController } from "@features/search/searchController";
import { useSettingsStore } from "@state/settingsStore";
import { AppToaster } from "@ui/components";
import {
	applyThemeMode,
	StyleSheet,
	syncStatusBar,
	useAppTheme,
} from "@ui/theme";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigation } from "./navigation";

export function App() {
	const { rt } = useAppTheme();

	// The whole non-React runtime boots (and tears down) in this ONE effect:
	// persisted theme mode applied, services started, search controller on.
	useEffect(() => {
		applyThemeMode(useSettingsStore.getState().theme);
		startAppServices();
		const stopSearchController = startSearchController();
		if (__DEV__) {
			void import("./devQaHooks").then((m) => m.installDevQaHooks());
		}
		return () => {
			stopSearchController();
			stopAppServices();
		};
	}, []);

	// Status bar follows the RESOLVED theme: in-app mode switches and, under
	// "system", OS scheme flips both surface here as rt.themeName changes.
	useEffect(() => {
		syncStatusBar();
	}, [rt.themeName]);

	return (
		<GestureHandlerRootView style={styles.root}>
			<SafeAreaProvider>
				<RootNavigation />
				<AppToaster />
				{/* Dev-only ExecuTorch POC entry; stripped from production builds. */}
				{__DEV__ ? <DevPocLauncher /> : null}
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

export default App;

const styles = StyleSheet.create({
	root: { flex: 1 },
});
