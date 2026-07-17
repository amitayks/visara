/**
 * PagerShell — the Gallery/Albums horizontal pager plus the edge-swipe
 * gesture layer (page-navigation-core spec). This is a VERBATIM port of the
 * debugged HorizontalPageContainer worklet logic, re-anchored to navStore and
 * @app/gestureMath:
 *
 * - navStore is the single page-state authority; one store→sharedValue sync
 *   mirrors it for worklets, and the pager writes back via setPage on settle.
 * - Edge validity is judged from the gesture ORIGIN (pinned in a shared value
 *   at onBegin), never the release position.
 * - hitSlop confines RECOGNITION to the 50px edge strips — everywhere else
 *   the pan never begins, so the native pager keeps horizontal scrolling
 *   (under RNGH 3 an activated detector gesture blocks the pager beneath).
 * - Gesture.Race composes the two edge gestures over the pager.
 * - Failed swipes spring-reset the translucent edge preview.
 */

import {
	EDGE_DETECTION_ZONE,
	isEdgeOrigin,
	isSwipeTriggered,
	SWIPE_DISTANCE_THRESHOLD,
} from "@app/gestureMath";
import { PAGE, type PageIndex, useNavStore } from "@state/navStore";
import { motion, StyleSheet } from "@ui/theme";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { Dimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import PagerView, {
	type PagerViewOnPageSelectedEvent,
} from "react-native-pager-view";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

export interface PagerShellProps {
	/** Content for page 0 (Gallery). */
	galleryPage: ReactNode;
	/** Content for page 1 (Albums). */
	albumsPage: ReactNode;
	/** Valid left-edge right-swipe on Gallery → search mode. */
	onGalleryEdgeSwipe: () => void;
	/** Valid right-edge left-swipe on Albums → Settings push. */
	onAlbumsEdgeSwipe: () => void;
	testID?: string;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

/** Peak opacity of the edge preview overlay while a valid edge pan is live. */
const EDGE_PREVIEW_OPACITY = 0.3;
const EDGE_PREVIEW_IN = { duration: 200 } as const;

/** Spring for preview reset — same physics the old container shipped with. */
const PAGE_SPRING = motion.spring.page;

export function PagerShell({
	galleryPage,
	albumsPage,
	onGalleryEdgeSwipe,
	onAlbumsEdgeSwipe,
	testID,
}: PagerShellProps) {
	const currentPage = useNavStore((s) => s.currentPage);
	const pagerRef = useRef<PagerView>(null);

	// navStore is the single source of truth for the page. These shared
	// values exist only so gesture worklets never read stale JS closures:
	// `pageShared` mirrors the store, `gestureStartX` pins the touch origin so
	// edge validity is judged from where the swipe STARTED, not where the
	// finger was released.
	const pageShared = useSharedValue<PageIndex>(currentPage);
	const gestureStartX = useSharedValue(-1);

	// Shared values for edge swipe animations
	const edgeSwipeTranslateX = useSharedValue(0);
	const edgeSwipeOpacity = useSharedValue(0);

	// Single sync point: store → pager + worklet mirror. setPage on the
	// already-current page is a no-op, so no local guard state is needed.
	useEffect(() => {
		pageShared.value = currentPage;
		pagerRef.current?.setPage(currentPage);
	}, [currentPage, pageShared]);

	// Gallery left-edge swipe right gesture: triggers search mode.
	// hitSlop confines RECOGNITION to the left edge strip.
	const gallerySwipeRightGesture = Gesture.Pan()
		.hitSlop({ left: 0, width: EDGE_DETECTION_ZONE })
		.activeOffsetX([10, Number.MAX_SAFE_INTEGER]) // Right swipe only
		.onBegin((event) => {
			"worklet";
			gestureStartX.value = event.x;
		})
		.onStart(() => {
			"worklet";
			if (
				isEdgeOrigin(gestureStartX.value, SCREEN_WIDTH, "left") &&
				pageShared.value === PAGE.gallery
			) {
				edgeSwipeOpacity.value = withSpring(
					EDGE_PREVIEW_OPACITY,
					EDGE_PREVIEW_IN,
				);
			}
		})
		.onUpdate((event) => {
			"worklet";
			if (
				isEdgeOrigin(gestureStartX.value, SCREEN_WIDTH, "left") &&
				pageShared.value === PAGE.gallery
			) {
				edgeSwipeTranslateX.value = Math.min(
					event.translationX,
					SWIPE_DISTANCE_THRESHOLD,
				);
			}
		})
		.onEnd((event) => {
			"worklet";
			// Reset animation values (spring reset on failed swipe)
			edgeSwipeTranslateX.value = withSpring(0, PAGE_SPRING);
			edgeSwipeOpacity.value = withSpring(0, PAGE_SPRING);

			// Valid edge swipe right from Gallery: judged from the gesture ORIGIN
			if (
				isEdgeOrigin(gestureStartX.value, SCREEN_WIDTH, "left") &&
				pageShared.value === PAGE.gallery &&
				isSwipeTriggered({
					translation: event.translationX,
					velocity: event.velocityX,
					screenWidth: SCREEN_WIDTH,
				})
			) {
				runOnJS(onGalleryEdgeSwipe)();
			}
			gestureStartX.value = -1;
		});

	// Albums right-edge swipe left gesture: pushes Settings.
	// Same hitSlop confinement, mirrored to the right edge strip.
	const albumsSwipeLeftGesture = Gesture.Pan()
		.hitSlop({ right: 0, width: EDGE_DETECTION_ZONE })
		.activeOffsetX([Number.MIN_SAFE_INTEGER, -10]) // Left swipe only
		.onBegin((event) => {
			"worklet";
			gestureStartX.value = event.x;
		})
		.onStart(() => {
			"worklet";
			if (
				isEdgeOrigin(gestureStartX.value, SCREEN_WIDTH, "right") &&
				pageShared.value === PAGE.albums
			) {
				edgeSwipeOpacity.value = withSpring(
					EDGE_PREVIEW_OPACITY,
					EDGE_PREVIEW_IN,
				);
			}
		})
		.onUpdate((event) => {
			"worklet";
			if (
				isEdgeOrigin(gestureStartX.value, SCREEN_WIDTH, "right") &&
				pageShared.value === PAGE.albums
			) {
				edgeSwipeTranslateX.value = Math.max(
					event.translationX,
					-SWIPE_DISTANCE_THRESHOLD,
				);
			}
		})
		.onEnd((event) => {
			"worklet";
			// Reset animation values (spring reset on failed swipe)
			edgeSwipeTranslateX.value = withSpring(0, PAGE_SPRING);
			edgeSwipeOpacity.value = withSpring(0, PAGE_SPRING);

			// Valid edge swipe left from Albums: judged from the gesture ORIGIN
			if (
				isEdgeOrigin(gestureStartX.value, SCREEN_WIDTH, "right") &&
				pageShared.value === PAGE.albums &&
				isSwipeTriggered({
					translation: event.translationX,
					velocity: event.velocityX,
					screenWidth: SCREEN_WIDTH,
				})
			) {
				runOnJS(onAlbumsEdgeSwipe)();
			}
			gestureStartX.value = -1;
		});

	// Combine both edge gestures using Race
	const composedGesture = Gesture.Race(
		gallerySwipeRightGesture,
		albumsSwipeLeftGesture,
	);

	// Pager settled on a page: the store is the only state to update
	// (transitions.setPage no-ops when the page is unchanged, so settle
	// events echoing a store-driven setPage never disturb search mode).
	const handlePageSelected = useCallback(
		(event: PagerViewOnPageSelectedEvent) => {
			useNavStore.getState().setPage(event.nativeEvent.position as PageIndex);
		},
		[],
	);

	// Animated style for edge swipe visual feedback — kept as a SEPARATE
	// style-array entry from the unistyles entry (interop rule).
	const edgeSwipeStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: edgeSwipeTranslateX.value }],
		opacity: edgeSwipeOpacity.value,
	}));

	return (
		<GestureDetector gesture={composedGesture}>
			<View style={styles.container} testID={testID}>
				{/* Edge swipe visual feedback overlay */}
				<Animated.View
					style={[styles.edgeSwipeOverlay, edgeSwipeStyle]}
					pointerEvents="none"
				/>

				{/* Native PagerView for optimal performance */}
				<PagerView
					ref={pagerRef}
					style={styles.pager}
					initialPage={currentPage}
					onPageSelected={handlePageSelected}
					orientation="horizontal"
					overScrollMode="never"
					offscreenPageLimit={1}
					pageMargin={0}
					scrollEnabled={true}
				>
					{/* Page 0: Gallery */}
					<View key="gallery" style={styles.page}>
						{galleryPage}
					</View>

					{/* Page 1: Albums */}
					<View key="albums" style={styles.page}>
						{albumsPage}
					</View>
				</PagerView>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create((theme) => ({
	container: {
		flex: 1,
	},
	pager: {
		flex: 1,
	},
	page: {
		flex: 1,
	},
	edgeSwipeOverlay: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: theme.colors.edgePreview,
		zIndex: 10,
		pointerEvents: "none",
	},
}));
