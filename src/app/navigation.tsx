/**
 * Root navigation (app-navigation-shell spec, design D3): exactly ONE
 * native-stack, declared with the React Navigation 7 static API. Onboarding
 * is included only while onboarding is incomplete — completing it flips the
 * persisted flag, the `if` gate re-evaluates, and the tree swaps to Shell
 * with no imperative navigation. PhotoViewer rides a transparentModal fade
 * over the always-mounted Shell (the viewer owns its dismiss gesture);
 * Settings and AlbumDetail are standard pushes; DevPoc exists only in
 * __DEV__ builds.
 */

import { ShellScreen } from "@app/shell";
import { AlbumDetail } from "@features/albums";
import { DevPocScreen } from "@features/dev";
import { OnboardingScreen } from "@features/onboarding";
import { SettingsScreen } from "@features/settings";
import { PhotoViewerScreen } from "@features/viewer";
import {
	CommonActions,
	createNavigationContainerRef,
	createStaticNavigation,
	DarkTheme,
	DefaultTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSettingsStore } from "@state/settingsStore";
import { useAppTheme } from "@ui/theme";
import { useMemo } from "react";

/** Route params — pinned by the cross-agent contract (AlbumDetail is FINAL). */
export type RootStackParamList = {
	Onboarding: undefined;
	Shell: undefined;
	PhotoViewer: undefined;
	Settings: undefined;
	AlbumDetail: { albumId?: string; smartLabel?: string } | undefined;
	DevPoc: undefined;
};

declare global {
	namespace ReactNavigation {
		interface RootParamList extends RootStackParamList {}
	}
}

/**
 * Conditional gate for the static tree (evaluated as a hook by the
 * navigator): while false, Onboarding is not registered at all, so the
 * Shell can never pop back to it.
 */
function useIsOnboardingIncomplete(): boolean {
	return useSettingsStore((state) => !state.onboardingCompleted);
}

const RootStack = createNativeStackNavigator({
	screenOptions: { headerShown: false },
	screens: {
		// Listed first: the initial route whenever the gate includes it.
		Onboarding: {
			if: useIsOnboardingIncomplete,
			screen: OnboardingScreen,
		},
		Shell: {
			screen: ShellScreen,
		},
		PhotoViewer: {
			screen: PhotoViewerScreen,
			options: {
				presentation: "transparentModal",
				animation: "fade",
				// The viewer owns dismissal (swipe-down) — never the stack gesture.
				gestureEnabled: false,
			},
		},
		Settings: {
			screen: SettingsScreen,
			options: { headerShown: true, title: "Settings" },
		},
		AlbumDetail: {
			screen: AlbumDetail,
			// Native back affordance; the screen sets its real title (album
			// name or smart-label) via navigation.setOptions once known.
			options: { headerShown: true, title: "" },
		},
		DevPoc: {
			if: () => __DEV__,
			screen: DevPocScreen,
		},
	},
});

const Navigation = createStaticNavigation(RootStack);

/** Imperative navigation for non-component callers (edge gestures, actions). */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
	name: RouteName,
	params?: RootStackParamList[RouteName],
): void {
	if (!navigationRef.isReady()) return;
	navigationRef.dispatch(CommonActions.navigate(name, params));
}

export function RootNavigation() {
	const { theme, isDark } = useAppTheme();

	// Native chrome (headers, screen backgrounds) follows the RESOLVED app
	// theme, so an in-app mode override beats the OS scheme here too.
	const navigationTheme = useMemo(() => {
		const base = isDark ? DarkTheme : DefaultTheme;
		return {
			...base,
			dark: isDark,
			colors: {
				...base.colors,
				primary: theme.colors.accent,
				background: theme.colors.background,
				card: theme.colors.surface,
				text: theme.colors.textPrimary,
				border: theme.colors.separator,
				notification: theme.colors.danger,
			},
		};
	}, [theme, isDark]);

	return <Navigation ref={navigationRef} theme={navigationTheme} />;
}
