/**
 * The single Android hardware-back owner (app-navigation-shell spec).
 *
 * Registered exactly once, by ShellScreen, and only while the Shell route is
 * focused — so pushed screens (Settings, PhotoViewer) and native surfaces
 * (TrueSheet sheets, Modal dialogs) keep their own native back handling and
 * effective behavior never depends on mount or registration order.
 *
 * Priority chain: (1) selection active → clear it; (2) search mode active →
 * clear the query and exit search; (3) fall through to the system /
 * native-stack default (returns false).
 */

import { useFocusEffect } from "@react-navigation/native";
import { useNavStore } from "@state/navStore";
import { useSearchStore } from "@state/searchStore";
import { useSelectionStore } from "@state/selectionStore";
import { useCallback } from "react";
import { BackHandler } from "react-native";

function handleShellBackPress(): boolean {
	const selection = useSelectionStore.getState();
	if (selection.active) {
		selection.clear();
		return true;
	}

	const nav = useNavStore.getState();
	if (nav.searchMode) {
		useSearchStore.getState().clear();
		nav.deactivateSearch();
		return true;
	}

	return false;
}

export function useShellBackHandler(): void {
	useFocusEffect(
		useCallback(() => {
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				handleShellBackPress,
			);
			return () => subscription.remove();
		}, []),
	);
}
