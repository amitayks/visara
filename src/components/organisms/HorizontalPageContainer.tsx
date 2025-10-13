import { useNavigation, type PageIndex } from "@contexts/NavigationContext";
import { useCallback, useRef, useState } from "react";
import { Dimensions, StyleSheet, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	runOnJS,
} from "react-native-reanimated";

interface HorizontalPageContainerProps {
	/** Content for page 0 (Main) */
	mainPage: React.ReactNode;
	/** Content for page 1 (Albums) */
	albumsPage: React.ReactNode;
	/** Callback when edge swipe left is detected (Main page → Search mode) */
	onEdgeSwipeLeft?: () => void;
	/** Callback when edge swipe right is detected (Albums page → Settings drawer) */
	onEdgeSwipeRight?: () => void;
	style?: ViewStyle;
	testID?: string;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const EDGE_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3; // 30% of screen width
const SPRING_CONFIG = {
	damping: 20,
	stiffness: 90,
	mass: 0.2,
};

export function HorizontalPageContainer({
	mainPage,
	albumsPage,
	onEdgeSwipeLeft,
	onEdgeSwipeRight,
	style,
	testID,
}: HorizontalPageContainerProps) {
	const { state, dispatch } = useNavigation();
	const translateX = useSharedValue(0);
	const [isDragging, setIsDragging] = useState(false);
	const contextRef = useRef({ startX: 0 });

	// Update translateX when currentPage changes externally (e.g., from Albums button)
	const updateTranslateX = useCallback(
		(page: PageIndex) => {
			translateX.value = withSpring(-page * SCREEN_WIDTH, SPRING_CONFIG);
		},
		[translateX],
	);

	// Sync with navigation state
	if (translateX.value !== -state.currentPage * SCREEN_WIDTH && !isDragging) {
		updateTranslateX(state.currentPage);
	}

	const panGesture = Gesture.Pan()
		.onStart(() => {
			runOnJS(setIsDragging)(true);
			contextRef.current = { startX: translateX.value };
		})
		.onUpdate((event) => {
			// Calculate new position
			const newTranslateX = contextRef.current.startX + event.translationX;

			// Constrain to valid range: 0 (Main) to -SCREEN_WIDTH (Albums)
			const constrainedX = Math.max(-SCREEN_WIDTH, Math.min(0, newTranslateX));

			translateX.value = constrainedX;
		})
		.onEnd((event) => {
			runOnJS(setIsDragging)(false);

			const velocity = event.velocityX;
			const currentPage = state.currentPage;

			// Determine target page based on swipe direction and velocity
			let targetPage: PageIndex = currentPage;

			// Check for edge swipes first
			if (currentPage === 0 && event.translationX > EDGE_SWIPE_THRESHOLD) {
				// Main page, swipe right beyond threshold → Search mode
				if (onEdgeSwipeLeft) {
					runOnJS(onEdgeSwipeLeft)();
				}
				// Spring back to current page
				translateX.value = withSpring(0, SPRING_CONFIG);
				return;
			}

			if (currentPage === 1 && event.translationX < -EDGE_SWIPE_THRESHOLD) {
				// Albums page, swipe left beyond threshold → Settings drawer
				if (onEdgeSwipeRight) {
					runOnJS(onEdgeSwipeRight)();
				}
				// Spring back to current page
				translateX.value = withSpring(-SCREEN_WIDTH, SPRING_CONFIG);
				return;
			}

			// Normal page navigation swipes
			if (velocity > 500) {
				// Fast swipe right → go to previous page (Main)
				targetPage = 0;
			} else if (velocity < -500) {
				// Fast swipe left → go to next page (Albums)
				targetPage = 1;
			} else {
				// Slow swipe → determine based on position
				const threshold = -SCREEN_WIDTH / 2;
				targetPage = translateX.value < threshold ? 1 : 0;
			}

			// Animate to target page
			translateX.value = withSpring(-targetPage * SCREEN_WIDTH, SPRING_CONFIG);

			// Update navigation state if page changed
			if (targetPage !== currentPage) {
				runOnJS(dispatch)({ type: "SET_PAGE", payload: targetPage });
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	return (
		<GestureDetector gesture={panGesture}>
			<View style={[styles.container, style]} testID={testID}>
				<Animated.View style={[styles.pagesContainer, animatedStyle]}>
					{/* Page 0: Main */}
					<View style={styles.page}>{mainPage}</View>

					{/* Page 1: Albums */}
					<View style={styles.page}>{albumsPage}</View>
				</Animated.View>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		overflow: "hidden",
	},
	pagesContainer: {
		flexDirection: "row",
		height: "100%",
	},
	page: {
		width: SCREEN_WIDTH,
		height: "100%",
	},
});
