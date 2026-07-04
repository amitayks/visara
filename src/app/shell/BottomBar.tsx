/**
 * BottomBar — the morphing bottom navigation bar (app-navigation-shell spec).
 *
 * A pure projection of navStore: buttons state ⇄ search-field state morph
 * along one ~300ms bezier(0.25, 0.1, 0.25, 1) progress, staggered — buttons
 * out over 0→0.3 (opacity, translateY, scale), search field in over 0.7→1.0.
 * Both states are absolutely positioned and overlapping so the morph never
 * changes layout; only GPU-composited props (opacity/transform) animate.
 * Interactivity is driven by pointerEvents from REACT STATE (never animated
 * styles); the whole bar is non-interactive while a morph is in flight; the
 * search input focuses only AFTER the morph completes. The bar rides the
 * keyboard via useAnimatedKeyboard and carries the processing progress
 * underline (ProgressBar + processingProgress SharedValue — zero re-renders
 * on progress change).
 */

import { navigate } from "@app/navigation";
import { PAGE, useNavStore } from "@state/navStore";
import { processingProgress, useProcessingStore } from "@state/processingStore";
import { useSearchStore } from "@state/searchStore";
import { IconButton, ProgressBar } from "@ui/components";
import { motion, StyleSheet, spacing, useAppTheme } from "@ui/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, TextInput, View } from "react-native";
import Animated, {
	Easing,
	Extrapolation,
	interpolate,
	runOnJS,
	useAnimatedKeyboard,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

const MORPH_EASING = Easing.bezier(...motion.morphBezier);

/** Buttons exit downward by this much as they fade (decision record). */
const EXIT_TRANSLATE_Y = spacing.xl;
const EXIT_SCALE = 0.95;

/** Bar pill height (metric preserved from the shipped bar). */
const BAR_HEIGHT = 64;
const INPUT_HEIGHT = BAR_HEIGHT - spacing.md * 2;

/** Resting gap kept between the bar and the keyboard while it is open. */
const KEYBOARD_GAP = spacing.sm;

export function BottomBar() {
	const { theme, rt } = useAppTheme();
	const searchMode = useNavStore((s) => s.searchMode);
	const documentMode = useNavStore((s) => s.documentMode);
	const currentPage = useNavStore((s) => s.currentPage);
	const toggleSearch = useNavStore((s) => s.toggleSearch);
	const toggleDocuments = useNavStore((s) => s.toggleDocuments);
	const query = useSearchStore((s) => s.query);
	const setQuery = useSearchStore((s) => s.setQuery);
	const isProcessing = useProcessingStore((s) => s.isProcessing);

	// Morph progress: 0 = buttons state, 1 = search-field state.
	const morph = useSharedValue(searchMode ? 1 : 0);
	const [isMorphing, setIsMorphing] = useState(false);
	const inputRef = useRef<TextInput>(null);
	const prevSearchMode = useRef(searchMode);
	const keyboard = useAnimatedKeyboard();

	// The bar's resting distance from the physical screen bottom — needed as
	// a plain number for the keyboard-lift worklet AND for the style below.
	const restingBottom = rt.insets.bottom + theme.spacing.md;

	const handleMorphComplete = useCallback((entered: boolean) => {
		setIsMorphing(false);
		if (entered) {
			// Autofocus fires only after the morph settles (spec).
			inputRef.current?.focus();
		}
	}, []);

	useEffect(() => {
		if (prevSearchMode.current === searchMode) return;
		prevSearchMode.current = searchMode;
		setIsMorphing(true);
		if (!searchMode) {
			inputRef.current?.blur();
			Keyboard.dismiss();
		}
		morph.value = withTiming(
			searchMode ? 1 : 0,
			{ duration: motion.duration.morph, easing: MORPH_EASING },
			(finished) => {
				// An interrupted morph (finished=false) hands completion duties
				// to the animation that superseded it.
				if (finished) {
					runOnJS(handleMorphComplete)(searchMode);
				}
			},
		);
	}, [searchMode, morph, handleMorphComplete]);

	// Buttons animate OUT over progress 0→0.3.
	const buttonsAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(morph.value, [0, 0.3], [1, 0], Extrapolation.CLAMP),
		transform: [
			{
				translateY: interpolate(
					morph.value,
					[0, 0.3],
					[0, EXIT_TRANSLATE_Y],
					Extrapolation.CLAMP,
				),
			},
			{
				scale: interpolate(
					morph.value,
					[0, 0.3],
					[1, EXIT_SCALE],
					Extrapolation.CLAMP,
				),
			},
		],
	}));

	// Search field animates IN over progress 0.7→1.0.
	const searchAnimatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(morph.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
		transform: [
			{
				translateY: interpolate(
					morph.value,
					[0.7, 1],
					[EXIT_TRANSLATE_Y, 0],
					Extrapolation.CLAMP,
				),
			},
			{
				scale: interpolate(
					morph.value,
					[0.7, 1],
					[EXIT_SCALE, 1],
					Extrapolation.CLAMP,
				),
			},
		],
	}));

	// Frame-synced keyboard avoidance: translate the bar so it stays fully
	// visible above the keyboard (GPU transform only).
	const keyboardLiftStyle = useAnimatedStyle(() => {
		const lift = Math.max(
			0,
			keyboard.height.value - restingBottom + KEYBOARD_GAP,
		);
		return { transform: [{ translateY: -lift }] };
	});

	const openSettings = useCallback(() => {
		navigate("Settings");
	}, []);

	const onAlbumsPress = useCallback(() => {
		const nav = useNavStore.getState();
		if (nav.currentPage === PAGE.albums) {
			nav.goToGallery();
		} else {
			nav.goToAlbums();
		}
	}, []);

	const closeSearch = useCallback(() => {
		useSearchStore.getState().clear();
		useNavStore.getState().deactivateSearch();
	}, []);

	const dismissKeyboard = useCallback(() => {
		Keyboard.dismiss();
	}, []);

	const onAlbums = currentPage === PAGE.albums;

	return (
		<Animated.View
			style={[styles.container(restingBottom), keyboardLiftStyle]}
			pointerEvents={isMorphing ? "none" : "auto"}
			testID="bottom-bar"
		>
			{/* Buttons state — absolutely positioned, overlapping the field. */}
			<Animated.View
				style={[styles.buttonsLayer, buttonsAnimatedStyle]}
				pointerEvents={searchMode ? "none" : "auto"}
				testID="bottom-bar-buttons"
			>
				<IconButton
					icon="magnify"
					onPress={toggleSearch}
					color="textSecondary"
					accessibilityLabel="Search"
					testID="bottom-bar-search"
				/>
				<IconButton
					icon="file-document-outline"
					onPress={toggleDocuments}
					color={documentMode ? "accent" : "textSecondary"}
					accessibilityLabel={
						documentMode ? "Documents filter, on" : "Documents filter, off"
					}
					testID="bottom-bar-documents"
				/>
				<IconButton
					icon="folder-multiple-image"
					onPress={onAlbumsPress}
					color={onAlbums ? "accent" : "textSecondary"}
					accessibilityLabel={onAlbums ? "Back to gallery" : "Albums"}
					testID="bottom-bar-albums"
				/>
				<IconButton
					icon="cog-outline"
					onPress={openSettings}
					color="textSecondary"
					accessibilityLabel="Settings"
					testID="bottom-bar-settings"
				/>
			</Animated.View>

			{/* Search-field state — absolutely positioned, overlapping buttons. */}
			<Animated.View
				style={[styles.searchLayer, searchAnimatedStyle]}
				pointerEvents={searchMode ? "auto" : "none"}
				testID="bottom-bar-search-field"
			>
				<IconButton
					icon="close"
					onPress={closeSearch}
					accessibilityLabel="Close search"
					testID="bottom-bar-close-search"
				/>
				<TextInput
					ref={inputRef}
					value={query}
					onChangeText={setQuery}
					placeholder="Search your photos…"
					placeholderTextColor={theme.colors.textTertiary}
					selectionColor={theme.colors.accent}
					returnKeyType="search"
					onSubmitEditing={dismissKeyboard}
					accessibilityLabel="Search your photos"
					style={styles.input}
					testID="bottom-bar-search-input"
				/>
			</Animated.View>

			{/* Subtle processing progress underline — SharedValue-driven. */}
			{isProcessing ? (
				<View style={styles.progressTrack} pointerEvents="none">
					<ProgressBar
						progress={processingProgress}
						testID="bottom-bar-progress"
					/>
				</View>
			) : null}
		</Animated.View>
	);
}

const styles = StyleSheet.create((theme) => ({
	container: (bottom: number) => ({
		position: "absolute" as const,
		left: theme.spacing.md,
		right: theme.spacing.md,
		bottom,
		height: BAR_HEIGHT,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.barBackground,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
		overflow: "hidden" as const,
	}),
	buttonsLayer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingHorizontal: theme.spacing.md,
	},
	searchLayer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.sm,
		paddingHorizontal: theme.spacing.lg,
	},
	input: {
		flex: 1,
		height: INPUT_HEIGHT,
		borderRadius: theme.radii.lg,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: 0,
		fontSize: theme.typography.body.fontSize,
		color: theme.colors.textPrimary,
		backgroundColor: theme.colors.surfacePressed,
	},
	progressTrack: {
		position: "absolute",
		left: theme.spacing.xxl,
		right: theme.spacing.xxl,
		bottom: theme.spacing.xs,
	},
}));
