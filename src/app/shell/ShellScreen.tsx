/**
 * ShellScreen — the single native-stack entry that hosts the Gallery/Albums
 * pager (outside navigation — page swipes create no history) and the
 * morphing BottomBar overlay, and registers the one Android back handler
 * (app-navigation-shell spec).
 *
 * Edge-gesture wiring (page-navigation-core spec): a valid left-edge
 * right-swipe on Gallery activates search mode; a valid right-edge
 * left-swipe on Albums pushes the Settings screen (same gesture as the old
 * drawer, new destination).
 */

import { navigate } from "@app/navigation";
import { AlbumsPage } from "@features/albums";
import { GalleryPage } from "@features/gallery";
import { useNavStore } from "@state/navStore";
import { StyleSheet } from "@ui/theme";
import { useCallback } from "react";
import { View } from "react-native";
import { BottomBar } from "./BottomBar";
import { PagerShell } from "./PagerShell";
import { useShellBackHandler } from "./useShellBackHandler";

export function ShellScreen() {
	useShellBackHandler();

	const activateSearch = useNavStore((s) => s.activateSearch);
	const openSettings = useCallback(() => {
		navigate("Settings");
	}, []);

	return (
		<View style={styles.root} testID="shell-screen">
			<PagerShell
				galleryPage={<GalleryPage />}
				albumsPage={<AlbumsPage />}
				onGalleryEdgeSwipe={activateSearch}
				onAlbumsEdgeSwipe={openSettings}
				testID="pager-shell"
			/>
			<BottomBar />
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));
