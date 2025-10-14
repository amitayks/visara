import React, { useCallback, useEffect } from "react";
import { StyleSheet, BackHandler } from "react-native";
import { useNavigation } from "@contexts/NavigationContext";
import { useSearch } from "@contexts/SearchContext";
import { HorizontalPageContainer } from "@components/organisms/HorizontalPageContainer";
import { AnimatedBottomNav } from "@components/molecules/AnimatedBottomNav";
import { SettingsDrawer } from "@components/organisms/SettingsDrawer";
import { MainScreen } from "@screens/Main/MainScreen";
import { AlbumsScreen } from "@screens/Albums/AlbumsScreen";
import { useSettings, type Theme } from "@contexts/SettingsContext";
import DeviceInfo from "react-native-device-info";

/**
 * MainNavigator - The new custom navigation system
 *
 * Architecture:
 * - HorizontalPageContainer: Swipeable pages (Main ↔ Albums)
 * - AnimatedBottomNav: Bottom navigation with search mode animation
 * - SettingsDrawer: Settings overlay drawer
 *
 * Navigation flow:
 * - Main page ← swipe → Albums page
 * - Main page + swipe right (from left edge) → Search mode (integrated in MainScreen)
 * - Albums page + swipe left (from right edge) → Settings drawer
 * - Document button → Toggles filter on Main, navigates to Main from Albums
 * - Albums button → Jump to Albums page
 * - Search mode now integrated into MainScreen as a filter
 */
export function MainNavigator() {
	const {
		state: navState,
		dispatch: navDispatch,
		goToAlbums,
		toggleSearch,
		toggleDocuments,
		toggleSettings,
	} = useNavigation();
	const { state: searchState, dispatch: searchDispatch } = useSearch();
	const { state: settingsState, dispatch: settingsDispatch } = useSettings();

	// Get app version for settings
	const appVersion = DeviceInfo.getVersion();

	// Handle swipe right from Main page → Activate search mode
	const handleMainPageSwipeRight = useCallback(() => {
		navDispatch({ type: "ACTIVATE_SEARCH_MODE" });
	}, [navDispatch]);

	// Handle swipe left from Albums page → Open settings drawer
	const handleAlbumsPageSwipeLeft = useCallback(() => {
		navDispatch({ type: "OPEN_SETTINGS_DRAWER" });
	}, [navDispatch]);

	// Handle search query change
	const handleSearchQueryChange = useCallback(
		(text: string) => {
			searchDispatch({ type: "SET_SEARCH_QUERY", payload: text });
		},
		[searchDispatch],
	);

	// Handle search submit
	const handleSearchSubmit = useCallback(() => {
		// Search is automatically triggered by MainScreen when query changes
		console.log("Search submitted");
	}, []);

	// Handle search close
	const handleSearchClose = useCallback(() => {
		searchDispatch({ type: "CLEAR_SEARCH" });
		navDispatch({ type: "DEACTIVATE_SEARCH_MODE" });
	}, [searchDispatch, navDispatch]);

	// Settings handlers
	const handleSettingsClose = useCallback(() => {
		navDispatch({ type: "CLOSE_SETTINGS_DRAWER" });
	}, [navDispatch]);

	const handleBatterySaverToggle = useCallback(() => {
		settingsDispatch({ type: "TOGGLE_BATTERY_SAVER" });
	}, [settingsDispatch]);

	const handleNightProcessingToggle = useCallback(() => {
		settingsDispatch({ type: "TOGGLE_NIGHT_PROCESSING" });
	}, [settingsDispatch]);

	const handleThemeChange = useCallback(
		(theme: Theme) => {
			settingsDispatch({ type: "SET_THEME", payload: theme });
		},
		[settingsDispatch],
	);

	const handleClearCache = useCallback(async () => {
		try {
			// TODO: Implement actual cache clearing logic
			console.log("Clearing cache...");
			await new Promise((resolve) => setTimeout(resolve, 500));
			console.log("Cache cleared successfully");
		} catch (error) {
			console.error("Failed to clear cache:", error);
		}
	}, []);

	const handleDeleteAllData = useCallback(async () => {
		try {
			// TODO: Implement complete data deletion
			console.log("Deleting all data...");
			settingsDispatch({ type: "RESET_SETTINGS" });
			await new Promise((resolve) => setTimeout(resolve, 500));
			console.log("All data deleted successfully");
		} catch (error) {
			console.error("Failed to delete data:", error);
		}
	}, [settingsDispatch]);

	const handlePrivacyPolicyPress = useCallback(() => {
		console.log("Privacy Policy pressed");
	}, []);

	const handleTermsOfServicePress = useCallback(() => {
		console.log("Terms of Service pressed");
	}, []);

	const handleLicensesPress = useCallback(() => {
		console.log("Licenses pressed");
	}, []);

	// Android back button handler
	useEffect(() => {
		const backHandler = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				// Priority order: Search mode > Settings drawer
				// Child screens (MainScreen) handle their own drawers

				if (navState.searchMode) {
					// Close search mode
					handleSearchClose();
					return true; // Prevent default back behavior
				}

				if (navState.settingsDrawerOpen) {
					// Close settings drawer
					handleSettingsClose();
					return true; // Prevent default back behavior
				}

				// Let the system handle back (exit app or go to previous screen)
				return false;
			},
		);

		return () => backHandler.remove();
	}, [navState.searchMode, navState.settingsDrawerOpen, handleSearchClose, handleSettingsClose]);

	return (
		<>
			{/* Horizontal swipeable pages: Main ↔ Albums */}
			<HorizontalPageContainer
				mainPage={<MainScreen />}
				albumsPage={<AlbumsScreen />}
				onMainPageSwipeRight={handleMainPageSwipeRight}
				onAlbumsPageSwipeLeft={handleAlbumsPageSwipeLeft}
				style={styles.pageContainer}
			/>

			{/* Animated Bottom Navigation */}
			<AnimatedBottomNav
				searchMode={navState.searchMode}
				documentMode={navState.documentMode}
				currentPage={navState.currentPage}
				searchQuery={searchState.searchQuery}
				onSearchQueryChange={handleSearchQueryChange}
				onSearchSubmit={handleSearchSubmit}
				onSearchPress={toggleSearch}
				onDocumentsPress={toggleDocuments}
				onAlbumsPress={goToAlbums}
				onSettingsPress={toggleSettings}
				onSearchClose={handleSearchClose}
				style={styles.bottomNav}
				testID="main-bottom-nav"
			/>

			{/* Settings Drawer Overlay */}
			{navState.settingsDrawerOpen && (
				<SettingsDrawer
					visible={navState.settingsDrawerOpen}
					onClose={handleSettingsClose}
					batterySaverMode={settingsState.batterySaver}
					nightProcessingMode={settingsState.nightProcessing}
					onBatterySaverToggle={handleBatterySaverToggle}
					onNightProcessingToggle={handleNightProcessingToggle}
					theme={settingsState.theme}
					onThemeChange={handleThemeChange}
					onClearCache={handleClearCache}
					onDeleteAllData={handleDeleteAllData}
					appVersion={appVersion}
					onPrivacyPolicyPress={handlePrivacyPolicyPress}
					onTermsOfServicePress={handleTermsOfServicePress}
					onLicensesPress={handleLicensesPress}
					style={styles.settingsDrawer}
				/>
			)}
		</>
	);
}

const styles = StyleSheet.create({
	pageContainer: {
		flex: 1,
	},
	bottomNav: {
		// AnimatedBottomNav handles its own positioning
	},
	settingsDrawer: {
		flex: 1,
	},
});
