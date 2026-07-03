import { type PageIndex, useNavigation } from "@contexts/NavigationContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, View, type ViewStyle } from "react-native";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
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
	const [currentPageLocal, setCurrentPageLocal] = useState(state.currentPage);

	// Shared values for edge swipe animations
	const edgeSwipeTranslateX = useSharedValue(0);
	const edgeSwipeOpacity = useSharedValue(0);

	// Sync external navigation state with pager
	useEffect(() => {
		if (pagerRef.current && state.currentPage !== currentPageLocal) {
			pagerRef.current.setPage(state.currentPage);
			setCurrentPageLocal(state.currentPage);
		}
	}, [state.currentPage, currentPageLocal]);

	// Main page swipe right gesture: Triggers search mode
	const mainPageSwipeRightGesture = Gesture.Pan()
		.activeOffsetX([10, Number.MAX_SAFE_INTEGER]) // Right swipe only
		.onStart((event) => {
			"worklet";
			// Check if we're on Main page and starting from left edge
			if (event.x < EDGE_DETECTION_ZONE && currentPageLocal === 0) {
				// Start edge swipe animation
				edgeSwipeOpacity.value = withSpring(0.3, { duration: 200 });
			}
		})
		.onUpdate((event) => {
			"worklet";
			// Update edge swipe preview if within edge zone
			if (event.x < EDGE_DETECTION_ZONE && currentPageLocal === 0) {
				edgeSwipeTranslateX.value = Math.min(event.translationX, 100);
			}
		})
		.onEnd((event) => {
			"worklet";
			// Reset animation values
			edgeSwipeTranslateX.value = withSpring(0, SPRING_CONFIG);
			edgeSwipeOpacity.value = withSpring(0, SPRING_CONFIG);

			// Check if this is a valid edge swipe right from Main page
			if (
				event.x < EDGE_DETECTION_ZONE &&
				currentPageLocal === 0 &&
				(event.velocityX > SWIPE_VELOCITY_THRESHOLD ||
					event.translationX > SWIPE_DISTANCE_THRESHOLD)
			) {
				if (onMainPageSwipeRight) {
					runOnJS(onMainPageSwipeRight)();
				}
			}
		});

	// Albums page swipe left gesture: Triggers settings drawer
	const albumsPageSwipeLeftGesture = Gesture.Pan()
		.activeOffsetX([Number.MIN_SAFE_INTEGER, -10]) // Left swipe only
		.onStart((event) => {
			"worklet";
			// Check if we're on Albums page and starting from right edge
			if (
				event.x > SCREEN_WIDTH - EDGE_DETECTION_ZONE &&
				currentPageLocal === 1
			) {
				// Start edge swipe animation
				edgeSwipeOpacity.value = withSpring(0.3, { duration: 200 });
			}
		})
		.onUpdate((event) => {
			"worklet";
			// Update edge swipe preview if within edge zone
			if (
				event.x > SCREEN_WIDTH - EDGE_DETECTION_ZONE &&
				currentPageLocal === 1
			) {
				edgeSwipeTranslateX.value = Math.max(event.translationX, -100);
			}
		})
		.onEnd((event) => {
			"worklet";
			// Reset animation values
			edgeSwipeTranslateX.value = withSpring(0, SPRING_CONFIG);
			edgeSwipeOpacity.value = withSpring(0, SPRING_CONFIG);

			// Check if this is a valid edge swipe left from Albums page
			if (
				event.x > SCREEN_WIDTH - EDGE_DETECTION_ZONE &&
				currentPageLocal === 1 &&
				(event.velocityX < -SWIPE_VELOCITY_THRESHOLD ||
					event.translationX < -SWIPE_DISTANCE_THRESHOLD)
			) {
				if (onAlbumsPageSwipeLeft) {
					runOnJS(onAlbumsPageSwipeLeft)();
				}
			}
		});

	// Combine both edge gestures using Race
	const composedGesture = Gesture.Race(
		mainPageSwipeRightGesture,
		albumsPageSwipeLeftGesture,
	);

	// Handle page selection from PagerView
	const handlePageSelected = useCallback(
		(event: PagerViewOnPageSelectedEvent) => {
			const newPage = event.nativeEvent.position as PageIndex;
			setCurrentPageLocal(newPage);

			// Update navigation state if page changed
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
		<GestureHandlerRootView style={[styles.container, style]}>
			<GestureDetector gesture={composedGesture}>
				<View style={styles.gestureContainer} testID={testID}>
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
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	gestureContainer: {
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
