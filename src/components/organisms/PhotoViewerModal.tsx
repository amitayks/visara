import type { MediaFile } from "@models/MediaFile";
import { SpringConfigs } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useEffect, useState } from "react";
import {
	Modal,
	Pressable,
	StyleSheet,
	View,
	type ViewStyle,
} from "react-native";
import FastImage from "react-native-fast-image";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

interface PhotoViewerModalProps {
	visible: boolean;
	media: MediaFile | null;
	allMedia: MediaFile[];
	onClose: () => void;
	onSwipeUp?: () => void;
	onMediaChange?: (media: MediaFile) => void;
	style?: ViewStyle;
	testID?: string;
}

export function PhotoViewerModal({
	visible,
	media,
	allMedia,
	onClose,
	onSwipeUp,
	onMediaChange,
	testID,
}: PhotoViewerModalProps) {
	const { colors } = useTheme();

	const [currentIndex, setCurrentIndex] = useState(0);
	const scale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedScale = useSharedValue(1);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);

	// Update current index when media changes
	useEffect(() => {
		if (media) {
			const index = allMedia.findIndex((m) => m.id === media.id);
			if (index !== -1) {
				setCurrentIndex(index);
			}
		}
	}, [media, allMedia]);

	const resetTransform = useCallback(() => {
		scale.value = withSpring(1, SpringConfigs.gentle);
		translateX.value = withSpring(0, SpringConfigs.gentle);
		translateY.value = withSpring(0, SpringConfigs.gentle);
		savedScale.value = 1;
		savedTranslateX.value = 0;
		savedTranslateY.value = 0;
	}, [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY]);

	const handleClose = useCallback(() => {
		resetTransform();
		onClose();
	}, [onClose, resetTransform]);

	const navigateToNext = useCallback(() => {
		if (currentIndex < allMedia.length - 1) {
			const nextMedia = allMedia[currentIndex + 1];
			setCurrentIndex(currentIndex + 1);
			resetTransform();
			if (onMediaChange) {
				onMediaChange(nextMedia);
			}
		}
	}, [currentIndex, allMedia, resetTransform, onMediaChange]);

	const navigateToPrevious = useCallback(() => {
		if (currentIndex > 0) {
			const prevMedia = allMedia[currentIndex - 1];
			setCurrentIndex(currentIndex - 1);
			resetTransform();
			if (onMediaChange) {
				onMediaChange(prevMedia);
			}
		}
	}, [currentIndex, allMedia, resetTransform, onMediaChange]);

	// Double-tap gesture for 2x zoom
	const doubleTap = Gesture.Tap()
		.numberOfTaps(2)
		.onEnd(() => {
			if (scale.value > 1) {
				scale.value = withSpring(1, SpringConfigs.gentle);
				translateX.value = withSpring(0, SpringConfigs.gentle);
				translateY.value = withSpring(0, SpringConfigs.gentle);
				savedScale.value = 1;
			} else {
				scale.value = withSpring(2, SpringConfigs.gentle);
				savedScale.value = 2;
			}
		});

	// Pinch gesture for zoom (1x-4x)
	const pinch = Gesture.Pinch()
		.onUpdate((event) => {
			const newScale = savedScale.value * event.scale;
			scale.value = Math.max(1, Math.min(4, newScale));
		})
		.onEnd(() => {
			savedScale.value = scale.value;
		});

	// Pan gesture for navigation and panning when zoomed
	const pan = Gesture.Pan()
		.onUpdate((event) => {
			if (scale.value > 1) {
				// Pan when zoomed
				translateX.value = savedTranslateX.value + event.translationX;
				translateY.value = savedTranslateY.value + event.translationY;
			} else {
				// Horizontal swipe for navigation
				translateX.value = event.translationX;
			}
		})
		.onEnd((event) => {
			if (scale.value > 1) {
				// Save pan position
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
			} else {
				// Handle swipe navigation
				if (Math.abs(event.translationX) > 100) {
					if (event.translationX > 0) {
						// Swipe right - previous
						runOnJS(navigateToPrevious)();
					} else {
						// Swipe left - next
						runOnJS(navigateToNext)();
					}
				} else if (event.translationY > 100) {
					// Swipe down - close
					runOnJS(handleClose)();
				} else if (event.translationY < -100 && onSwipeUp) {
					// Swipe up - open info drawer
					runOnJS(onSwipeUp)();
				}

				// Reset position
				translateX.value = withSpring(0, SpringConfigs.gentle);
				translateY.value = withSpring(0, SpringConfigs.gentle);
			}
		});

	const composed = Gesture.Simultaneous(doubleTap, pinch, pan);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	if (!visible || !media) {
		return null;
	}

	const currentMedia = allMedia[currentIndex];

	return (
		<Modal
			visible={visible}
			transparent={true}
			animationType="fade"
			onRequestClose={handleClose}
			testID={testID}
		>
			<GestureHandlerRootView style={styles.modalContainer}>
				{/* Backdrop */}
				<Pressable
					style={[styles.backdrop, { backgroundColor: colors.overlay }]}
					onPress={handleClose}
				/>

				{/* Image Container */}
				<View style={styles.imageContainer} pointerEvents="box-none">
					<GestureDetector gesture={composed}>
						<Animated.View style={[styles.imageWrapper, animatedStyle]}>
							<FastImage
								source={{ uri: currentMedia.uri }}
								style={styles.image}
								resizeMode={FastImage.resizeMode.contain}
							/>
						</Animated.View>
					</GestureDetector>
				</View>
			</GestureHandlerRootView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	modalContainer: {
		flex: 1,
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
	},
	imageContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	imageWrapper: {
		width: "90%",
		height: "90%",
	},
	image: {
		width: "100%",
		height: "100%",
	},
});
