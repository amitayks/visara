import { type PageIndex, useNavigation } from "@contexts/NavigationContext";
import { useCallback, useEffect, useRef } from "react";
import { Dimensions, StyleSheet, View, type ViewStyle } from "react-native";
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

interface HorizontalPageContainerProps {
	/** Content for page 0 (Main) */
	mainPage: React.ReactNode;
	/** Content for page 1 (Albums) */
	albumsPage: React.ReactNode;
	/** Callback when swipe right from Main page is detected → Search mode */
	onMainPageSwipeRight?: () => void;
	/** Callback when swipe left from Albums page is detected → Settings drawer */
	onAlbumsPageSwipeLeft?: () => void;
	style?: ViewStyle;
	testID?: string;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const EDGE_DETECTION_ZONE = 50; // 50px from edge as per UI guide
const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_DISTANCE_THRESHOLD = 100;

// Spring configuration for smooth physics-based animations
const SPRING_CONFIG = {
	damping: 15, // Controls bounce (lower = more oscillation)
	mass: 0.5, // Affects momentum (higher = heavier feel)
	stiffness: 100, // Speed of response (higher = faster)
	overshootClamping: false, // Allow natural spring overshoot
};

export function HorizontalPageContainer({
	mainPage,
	albumsPage,
	onMainPageSwipeRight,
	onAlbumsPageSwipeLeft,
	style,
	testID,
}: HorizontalPageContainerProps) {
	const { state, dispatch } = useNavigation();
	const pagerRef = useRef<PagerView>(null);

	// NavigationContext is the single source of truth for the page. These
	// shared values exist only so gesture worklets never read stale JS
	// closures: `pageShared` mirrors context, `gestureStartX` pins the touch
	// origin so edge validity is judged from where the swipe STARTED, not
	// where the finger was released.
	const pageShared = useSharedValue<PageIndex>(state.currentPage);
	const gestureStartX = useSharedValue(-1);

	// Shared values for edge swipe animations
	const edgeSwipeTranslateX = useSharedValue(0);
	const edgeSwipeOpacity = useSharedValue(0);

	// Single sync point: context → pager + worklet mirror. setPage on the
	// already-current page is a no-op, so no local guard state is needed.
	useEffect(() => {
		pageShared.value = state.currentPage;
		pagerRef.current?.setPage(state.currentPage);
	}, [state.currentPage, pageShared]);

	// Main page swipe right gesture: Triggers search mode.
	// hitSlop confines RECOGNITION to the left edge strip — everywhere else
	// the pan never begins, so the native pager keeps horizontal scrolling
	// (under RNGH 3 an activated detector gesture blocks the pager beneath).
	const mainPageSwipeRightGesture = Gesture.Pan()
		.hitSlop({ left: 0, width: EDGE_DETECTION_ZONE })
		.activeOffsetX([10, Number.MAX_SAFE_INTEGER]) // Right swipe only
		.onBegin((event) => {
			"worklet";
			gestureStartX.value = event.x;
		})
		.onStart(() => {
			"worklet";
			if (gestureStartX.value < EDGE_DETECTION_ZONE && pageShared.value === 0) {
				edgeSwipeOpacity.value = withSpring(0.3, { duration: 200 });
			}
		})
		.onUpdate((event) => {
			"worklet";
			if (gestureStartX.value < EDGE_DETECTION_ZONE && pageShared.value === 0) {
				edgeSwipeTranslateX.value = Math.min(event.translationX, 100);
			}
		})
		.onEnd((event) => {
			"worklet";
			// Reset animation values
			edgeSwipeTranslateX.value = withSpring(0, SPRING_CONFIG);
			edgeSwipeOpacity.value = withSpring(0, SPRING_CONFIG);

			// Valid edge swipe right from Main: judged from the gesture ORIGIN
			if (
				gestureStartX.value >= 0 &&
				gestureStartX.value < EDGE_DETECTION_ZONE &&
				pageShared.value === 0 &&
				(event.velocityX > SWIPE_VELOCITY_THRESHOLD ||
					event.translationX > SWIPE_DISTANCE_THRESHOLD)
			) {
				if (onMainPageSwipeRight) {
					runOnJS(onMainPageSwipeRight)();
				}
			}
			gestureStartX.value = -1;
		});

	// Albums page swipe left gesture: Triggers settings drawer.
	// Same hitSlop confinement, mirrored to the right edge strip.
	const albumsPageSwipeLeftGesture = Gesture.Pan()
		.hitSlop({ right: 0, width: EDGE_DETECTION_ZONE })
		.activeOffsetX([Number.MIN_SAFE_INTEGER, -10]) // Left swipe only
		.onBegin((event) => {
			"worklet";
			gestureStartX.value = event.x;
		})
		.onStart(() => {
			"worklet";
			if (
				gestureStartX.value > SCREEN_WIDTH - EDGE_DETECTION_ZONE &&
				pageShared.value === 1
			) {
				edgeSwipeOpacity.value = withSpring(0.3, { duration: 200 });
			}
		})
		.onUpdate((event) => {
			"worklet";
			if (
				gestureStartX.value > SCREEN_WIDTH - EDGE_DETECTION_ZONE &&
				pageShared.value === 1
			) {
				edgeSwipeTranslateX.value = Math.max(event.translationX, -100);
			}
		})
		.onEnd((event) => {
			"worklet";
			// Reset animation values
			edgeSwipeTranslateX.value = withSpring(0, SPRING_CONFIG);
			edgeSwipeOpacity.value = withSpring(0, SPRING_CONFIG);

			// Valid edge swipe left from Albums: judged from the gesture ORIGIN
			if (
				gestureStartX.value > SCREEN_WIDTH - EDGE_DETECTION_ZONE &&
				pageShared.value === 1 &&
				(event.velocityX < -SWIPE_VELOCITY_THRESHOLD ||
					event.translationX < -SWIPE_DISTANCE_THRESHOLD)
			) {
				if (onAlbumsPageSwipeLeft) {
					runOnJS(onAlbumsPageSwipeLeft)();
				}
			}
			gestureStartX.value = -1;
		});

	// Combine both edge gestures using Race
	const composedGesture = Gesture.Race(
		mainPageSwipeRightGesture,
		albumsPageSwipeLeftGesture,
	);

	// Pager settled on a page: context is the only state to update.
	const handlePageSelected = useCallback(
		(event: PagerViewOnPageSelectedEvent) => {
			const newPage = event.nativeEvent.position as PageIndex;
			if (newPage !== state.currentPage) {
				dispatch({ type: "SET_PAGE", payload: newPage });
			}
		},
		[state.currentPage, dispatch],
	);

	// Animated style for edge swipe visual feedback
	const edgeSwipeStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: edgeSwipeTranslateX.value }],
		opacity: edgeSwipeOpacity.value,
	}));

	return (
		<GestureDetector gesture={composedGesture}>
			<View style={[styles.container, style]} testID={testID}>
				{/* Edge swipe visual feedback overlay */}
				<Animated.View
					style={[styles.edgeSwipeOverlay, edgeSwipeStyle]}
					pointerEvents="none"
				/>

				{/* Native PagerView for optimal performance */}
				<PagerView
					ref={pagerRef}
					style={styles.pagerView}
					initialPage={state.currentPage}
					onPageSelected={handlePageSelected}
					orientation="horizontal"
					overScrollMode="never"
					offscreenPageLimit={1} // Optimize memory by limiting pre-rendered pages
					pageMargin={0}
					scrollEnabled={true}
				>
					{/* Page 0: Main */}
					<View key="main" style={styles.page}>
						{mainPage}
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

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	pagerView: {
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
		backgroundColor: "rgba(255, 255, 255, 0.1)",
		zIndex: 10,
		pointerEvents: "none",
	},
});
