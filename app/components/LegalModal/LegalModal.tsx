import React, { useCallback, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./LegalModal.style";

interface LegalModalProps {
	visible: boolean;
	title: string;
	content: string;
	onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
	visible,
	title,
	content,
	onClose,
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	const bottomSheetRef = useRef<BottomSheet>(null);

	// Animated values for close button
	const scrollOffset = useSharedValue(0);
	const closeButtonOpacity = useSharedValue(0);
	const closeButtonTranslateY = useSharedValue(50);

	// Snap points for drawer
	const snapPoints = React.useMemo(() => ["90%"], []);

	// Format markdown content to JSX-like structure for Text component
	const formatContent = (markdownContent: string) => {
		return markdownContent
			.replace(/^# (.+)$/gm, "$1") // Remove markdown headers
			.replace(/^## (.+)$/gm, "$1")
			.replace(/^### (.+)$/gm, "$1")
			.replace(/\*\*(.+?)\*\*/g, "$1") // Remove bold markdown
			.split("\n\n"); // Split into paragraphs
	};

	const formattedParagraphs = formatContent(content);

	// Handle scroll for close button animation - using regular scroll handler for BottomSheet compatibility
	const handleScroll = useCallback(
		(event: any) => {
			const currentOffset = event.nativeEvent.contentOffset.y;
			const threshold = 100; // Show button after scrolling 100px

			if (currentOffset > threshold) {
				// Show close button - animate up
				closeButtonOpacity.value = withSpring(1, { damping: 15 });
				closeButtonTranslateY.value = withSpring(0, { damping: 15 });
			} else {
				// Hide close button - animate down
				closeButtonOpacity.value = withSpring(0, { damping: 15 });
				closeButtonTranslateY.value = withSpring(50, { damping: 15 });
			}

			scrollOffset.value = currentOffset;
		},
		[closeButtonOpacity, closeButtonTranslateY, scrollOffset],
	);

	// Animated styles for close button
	const closeButtonAnimatedStyle = useAnimatedStyle(() => ({
		opacity: closeButtonOpacity.value,
		transform: [{ translateY: closeButtonTranslateY.value }],
	}));

	const handleClose = useCallback(() => {
		// Reset animations
		closeButtonOpacity.value = 0;
		closeButtonTranslateY.value = 50;
		scrollOffset.value = 0;
		onClose();
	}, [onClose, closeButtonOpacity, closeButtonTranslateY, scrollOffset]);

	const handleBottomSheetClose = useCallback(() => {
		handleClose();
	}, [handleClose]);

	const renderParagraph = (paragraph: string, index: number) => {
		const trimmedParagraph = paragraph.trim();
		if (!trimmedParagraph) return null;

		// Check if it's a header (starts with a number followed by period)
		const isMainHeader = /^[0-9]+\./.test(trimmedParagraph);
		const isSubHeader = /^[0-9]+\.[0-9]+/.test(trimmedParagraph);
		const isList = trimmedParagraph.startsWith("- ");

		let textStyle = styles.bodyText;
		if (isMainHeader) {
			textStyle = StyleSheet.flatten([styles.bodyText, styles.mainHeader]);
		} else if (isSubHeader) {
			textStyle = StyleSheet.flatten([styles.bodyText, styles.subHeader]);
		} else if (isList) {
			textStyle = styles.listItem;
		}

		return (
			<Text key={index} style={textStyle}>
				{trimmedParagraph}
			</Text>
		);
	};

	if (!visible) return null;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={handleClose}
			statusBarTranslucent
		>
			<GestureHandlerRootView style={styles.container}>
				{/* Background overlay */}
				<Animated.View
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(100)}
					style={styles.backdrop}
				/>

				{/* Bottom drawer */}
				<BottomSheet
					ref={bottomSheetRef}
					index={0}
					snapPoints={snapPoints}
					onClose={handleBottomSheetClose}
					backgroundStyle={[
						styles.bottomSheetBackground,
						{ backgroundColor: theme.surface },
					]}
					handleIndicatorStyle={[
						styles.bottomSheetHandle,
						{ backgroundColor: theme.text },
					]}
					enablePanDownToClose={true}
					animateOnMount={true}
					enableContentPanningGesture={false}
					enableHandlePanningGesture={true}
				>
					<View style={styles.bottomSheetContent}>
						{/* Header */}
						<View style={styles.header}>
							<Text style={[styles.title, { color: theme.text }]}>{title}</Text>
						</View>

						{/* Scrollable Content */}
						<BottomSheetScrollView
							style={styles.scrollView}
							contentContainerStyle={styles.scrollContent}
							showsVerticalScrollIndicator={true}
							onScroll={handleScroll}
							bounces={true}
							keyboardShouldPersistTaps="handled"
						>
							{formattedParagraphs.map((paragraph, index) =>
								renderParagraph(paragraph, index),
							)}

							{/* Bottom padding for better scrolling */}
							<View style={styles.bottomPadding} />
						</BottomSheetScrollView>
					</View>
				</BottomSheet>

				{/* Animated close button */}
				<Animated.View
					style={[styles.floatingCloseButton, closeButtonAnimatedStyle]}
				>
					<TouchableOpacity
						onPress={handleClose}
						style={styles.closeButton}
						activeOpacity={0.8}
					>
						<Icon name="close" size={24} color={theme.text} />
					</TouchableOpacity>
				</Animated.View>
			</GestureHandlerRootView>
		</Modal>
	);
};
