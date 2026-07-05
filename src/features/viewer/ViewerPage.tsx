/**
 * One page of the photo viewer: full-screen image with the preserved gesture
 * composition from the old PhotoViewerModal — pinch 1x–4x, pan-when-zoomed,
 * double-tap toggle, vertical pan for swipe-down dismiss / swipe-up info —
 * still composed via Gesture.Simultaneous (protected surface). Horizontal
 * paging is delegated to the parent FlatList: the vertical pan fails fast on
 * horizontal movement, and while zoomed the parent disables list scrolling so
 * pan moves the image instead of paging.
 */

import type { MediaRow as MediaFile } from "@backend/types";
import { motion, StyleSheet } from "@ui/theme";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

/** Old-modal parity thresholds: 100px swipe distance triggers dismiss/info. */
const DISMISS_THRESHOLD = 100;
const INFO_THRESHOLD = 100;
/** Drag distance over which the backdrop fully fades during dismissal. */
const DISMISS_FADE_DISTANCE = 300;

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2;

export interface ViewerPageProps {
	item: MediaFile;
	width: number;
	height: number;
	/** True only for the page at viewerStore.index. */
	isActive: boolean;
	/** Screen-level 0..1 dismissal progress (drives backdrop/chrome fade). */
	dismissProgress: SharedValue<number>;
	/** Zoom-state changes gate the parent FlatList's scrollEnabled. */
	onZoomChange: (zoomed: boolean) => void;
	onDismiss: () => void;
	onShowInfo: () => void;
	onToggleChrome: () => void;
}

export const ViewerPage = memo(function ViewerPage({
	item,
	width,
	height,
	isActive,
	dismissProgress,
	onZoomChange,
	onDismiss,
	onShowInfo,
	onToggleChrome,
}: ViewerPageProps) {
	const [zoomed, setZoomed] = useState(false);

	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);
	const dismissTriggered = useSharedValue(false);

	const applyZoomState = useCallback(
		(next: boolean) => {
			setZoomed(next);
			onZoomChange(next);
		},
		[onZoomChange],
	);

	// Transforms reset whenever this page stops being the displayed photo
	// (gallery-experience spec: zoom/pan reset when the displayed photo
	// changes). Instant reset — the page is off-screen.
	useEffect(() => {
		if (!isActive) {
			scale.value = 1;
			savedScale.value = 1;
			translateX.value = 0;
			translateY.value = 0;
			savedTranslateX.value = 0;
			savedTranslateY.value = 0;
			setZoomed(false);
		}
	}, [
		isActive,
		scale,
		savedScale,
		translateX,
		translateY,
		savedTranslateX,
		savedTranslateY,
	]);

	const gesture = useMemo(() => {
		const doubleTap = Gesture.Tap()
			.numberOfTaps(2)
			.onEnd(() => {
				if (scale.value > MIN_SCALE) {
					scale.value = withSpring(MIN_SCALE, motion.spring.gentle);
					translateX.value = withSpring(0, motion.spring.gentle);
					translateY.value = withSpring(0, motion.spring.gentle);
					savedScale.value = MIN_SCALE;
					savedTranslateX.value = 0;
					savedTranslateY.value = 0;
					runOnJS(applyZoomState)(false);
				} else {
					scale.value = withSpring(DOUBLE_TAP_SCALE, motion.spring.gentle);
					savedScale.value = DOUBLE_TAP_SCALE;
					runOnJS(applyZoomState)(true);
				}
			});

		const singleTap = Gesture.Tap().onEnd(() => {
			runOnJS(onToggleChrome)();
		});

		const pinch = Gesture.Pinch()
			.onStart(() => {
				// Disable list paging immediately so the pinch never fights the
				// horizontal scroller; restored on end if the scale snapped back.
				runOnJS(applyZoomState)(true);
			})
			.onUpdate((event) => {
				const next = savedScale.value * event.scale;
				scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
			})
			.onEnd(() => {
				savedScale.value = scale.value;
				if (scale.value <= MIN_SCALE) {
					translateX.value = withSpring(0, motion.spring.gentle);
					translateY.value = withSpring(0, motion.spring.gentle);
					savedTranslateX.value = 0;
					savedTranslateY.value = 0;
					runOnJS(applyZoomState)(false);
				}
			});

		// Pan while zoomed — moves the image (old-modal behavior preserved).
		const zoomPan = Gesture.Pan()
			.enabled(zoomed)
			.onUpdate((event) => {
				translateX.value = savedTranslateX.value + event.translationX;
				translateY.value = savedTranslateY.value + event.translationY;
			})
			.onEnd(() => {
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
			});

		// Vertical pan while unzoomed — swipe-down dismiss, swipe-up info.
		// Fails fast on horizontal movement so the FlatList pages instead.
		// Spring-back lives in onFinalize (not onEnd) so a mid-drag CANCEL —
		// e.g. a pinch flipping the enabled flags — never strands the image
		// offset or the backdrop half-faded.
		const dismissPan = Gesture.Pan()
			.enabled(!zoomed)
			.maxPointers(1)
			.activeOffsetY([-16, 16])
			.failOffsetX([-12, 12])
			.onBegin(() => {
				dismissTriggered.value = false;
			})
			.onUpdate((event) => {
				const ty = event.translationY;
				// Downward tracks the finger; upward gets resistance (it is an
				// intent hint for the info sheet, not a movement).
				translateY.value = ty >= 0 ? ty : ty * 0.25;
				dismissProgress.value = Math.max(
					0,
					Math.min(1, ty / DISMISS_FADE_DISTANCE),
				);
			})
			.onEnd((event) => {
				if (event.translationY > DISMISS_THRESHOLD) {
					dismissTriggered.value = true;
					runOnJS(onDismiss)();
					return;
				}
				if (event.translationY < -INFO_THRESHOLD) {
					runOnJS(onShowInfo)();
				}
			})
			.onFinalize(() => {
				if (!dismissTriggered.value) {
					translateY.value = withSpring(0, motion.spring.gentle);
					dismissProgress.value = withSpring(0, motion.spring.gentle);
				}
			});

		return Gesture.Simultaneous(
			Gesture.Exclusive(doubleTap, singleTap),
			pinch,
			zoomPan,
			dismissPan,
		);
	}, [
		zoomed,
		applyZoomState,
		onDismiss,
		onShowInfo,
		onToggleChrome,
		dismissProgress,
		dismissTriggered,
		scale,
		savedScale,
		translateX,
		translateY,
		savedTranslateX,
		savedTranslateY,
	]);

	const imageAnimatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value * (1 - dismissProgress.value * 0.12) },
		],
	}));

	return (
		<View style={styles.page(width, height)}>
			<GestureDetector gesture={gesture}>
				<Animated.View style={[styles.fill, imageAnimatedStyle]}>
					<Image
						source={{ uri: item.uri }}
						style={styles.fill}
						contentFit="contain"
						recyclingKey={item.id}
						accessibilityLabel={item.filename}
					/>
				</Animated.View>
			</GestureDetector>
		</View>
	);
});

const styles = StyleSheet.create(() => ({
	page: (width: number, height: number) => ({
		width,
		height,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		overflow: "hidden" as const,
	}),
	fill: {
		width: "100%",
		height: "100%",
	},
}));
