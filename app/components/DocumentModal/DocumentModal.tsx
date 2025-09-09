import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Modal,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, { 
	FadeIn, 
	FadeOut, 
	useAnimatedGestureHandler, 
	useAnimatedStyle, 
	useSharedValue,
	runOnJS,
	withSpring 
} from "react-native-reanimated";
import { ImageZoom } from "@likashefqet/react-native-image-zoom";
import BottomSheet from "@gorhom/bottom-sheet";
import { GestureHandlerRootView, PanGestureHandler, State } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useDocumentStore } from "../../../stores/documentStore";
import { copyToClipboard } from "../../../utils/clipboard";
import { formatCurrency, formatDate } from "../../../utils/format";
import { ActionButton } from "../ActionButton";
import { Document } from "../DocumentGrid";
import { InfoRow } from "../InfoRow";
import { showToast } from "../Toast/Toast";
import { createStyles } from "./DocumentModal.style";

interface DocumentModalProps {
	visible: boolean;
	document: Document | null;
	onClose: () => void;
	onShare?: (doc: Document) => void;
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
	visible,
	document,
	onClose,
	onShare,
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	const [deleting, setDeleting] = useState(false);
	const bottomSheetRef = useRef<BottomSheet>(null);

	const { deleteDocument } = useDocumentStore();

	// Bottom sheet snap points
	const snapPoints = React.useMemo(() => ["20%", "60%", "90%"], []);

	// Animated values for drag-to-dismiss
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const scale = useSharedValue(1);

	// Dismiss threshold - how far to drag before dismissing
	const DISMISS_THRESHOLD = 150;

	const handleOpenInGallery = useCallback(async () => {
		if (!document?.imageUri) return;

		try {
			const canOpen = await Linking.canOpenURL(document.imageUri);
			if (canOpen) {
				await Linking.openURL(document.imageUri);
			} else {
				showToast({
					type: "error",
					message: "Cannot open this image in gallery",
					icon: "alert-circle",
				});
				onClose();
			}
		} catch (error) {
			console.error("Failed to open in gallery:", error);
			showToast({
				type: "error",
				message: "Cannot open this image in gallery",
				icon: "alert-circle",
			});
		}
	}, [document, onClose]);

	const handleDelete = async () => {
		if (!document) return;

		setDeleting(true);
		try {
			await deleteDocument(document.id);
			showToast({
				type: "success",
				message: "Document deleted successfully",
				icon: "checkmark-circle",
			});
			onClose();
		} catch (error) {
			showToast({
				type: "error",
				message: "Failed to delete document",
				icon: "alert-circle",
			});
		} finally {
			setDeleting(false);
		}
	};

	const handleShare = useCallback(async () => {
		if (!document) return;

		try {
			if (onShare) {
				onShare(document);
			} else {
				await Share.share({
					message: `Document: ${document.documentType || "Unknown"}\nDate: ${formatDate(document.createdAt)}`,
					url: document.imageUri,
				});
			}
		} catch (error) {
			showToast({
				type: "error",
				message: "Failed to share document",
				icon: "alert-circle",
			});
		}
	}, [document, onShare]);

	const handleCopyText = useCallback(async (text: string) => {
		try {
			await copyToClipboard(text);
			showToast({
				type: "success",
				message: "Copied to clipboard",
				icon: "checkmark-circle",
			});
		} catch (error) {
			showToast({
				type: "error",
				message: "Failed to copy text",
				icon: "alert-circle",
			});
		}
	}, []);

	const handleBottomSheetClose = useCallback(() => {
		onClose();
	}, [onClose]);

	const handleImageSingleTap = useCallback(() => {
		// Close on single tap
		onClose();
	}, [onClose]);

	// Animated gesture handler for drag-to-dismiss
	const panGestureHandler = useAnimatedGestureHandler({
		onStart: () => {
			// Slightly scale down when starting to drag
			scale.value = withSpring(0.95);
		},
		onActive: (event) => {
			// Follow the finger movement
			translateX.value = event.translationX;
			translateY.value = event.translationY;
		},
		onEnd: (event) => {
			const { translationX, translationY, velocityX, velocityY } = event;
			
			// Calculate distance from center
			const distance = Math.sqrt(translationX * translationX + translationY * translationY);
			const velocity = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
			
			// Dismiss if dragged far enough or with enough velocity
			if (distance > DISMISS_THRESHOLD || velocity > 1000) {
				// Animate out and close
				translateX.value = withSpring(translationX * 2, { damping: 15 });
				translateY.value = withSpring(translationY * 2, { damping: 15 });
				scale.value = withSpring(0.8, { damping: 15 });
				runOnJS(onClose)();
			} else {
				// Snap back to center
				translateX.value = withSpring(0);
				translateY.value = withSpring(0);
				scale.value = withSpring(1);
			}
		},
	});

	// Animated style for the draggable image
	const imageStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	// Reset position when document changes
	React.useEffect(() => {
		if (document) {
			// Reset to center position with spring animation
			translateX.value = withSpring(0);
			translateY.value = withSpring(0);
			scale.value = withSpring(1);
		}
	}, [document?.id]);

	if (!document) return null;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<GestureHandlerRootView style={styles.container}>
				{/* Background overlay */}
				<Animated.View
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(150)}
					style={styles.backdrop}
				/>

				{/* Full screen image with drag-to-dismiss */}
				<PanGestureHandler onGestureEvent={panGestureHandler}>
					<Animated.View style={[styles.image, imageStyle]}>
						<ImageZoom
							uri={document.imageUri}
							style={styles.image}
							onSingleTap={handleImageSingleTap}
							isPanEnabled={true}
							isPinchEnabled={true}
							minScale={0.5}
							maxScale={5}
							isDoubleTapEnabled={true}
						/>
					</Animated.View>
				</PanGestureHandler>

				{/* Close button */}
				{/* <TouchableOpacity style={styles.closeButton} onPress={onClose}>
					<Icon name="close" size={24} color={theme.surface} />
				</TouchableOpacity> */}

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
				>
					<View style={styles.bottomSheetContent}>
						{/* Action Buttons */}
						<View style={styles.actionButtons}>
							<ActionButton
								icon="images"
								// label="Gallery"
								onPress={handleOpenInGallery}
								style={styles.actionButton}
							/>

							<ActionButton
								icon="share"
								// label="Share"
								onPress={handleShare}
								style={styles.actionButton}
							/>

							<ActionButton
								icon="copy"
								// label="Copy Text"
								onPress={() => {
									if (document.metadata) {
										handleCopyText(
											typeof document.metadata === "string"
												? document.metadata
												: JSON.stringify(document.metadata),
										);
									}
								}}
								disabled={!document.metadata}
								style={styles.actionButton}
							/>

							<ActionButton
								icon="trash"
								// label="Delete"
								onPress={handleDelete}
								disabled={deleting}
								variant="destructive"
								style={styles.actionButton}
							>
								{deleting && (
									<ActivityIndicator size="small" color={theme.surface} />
								)}
							</ActionButton>
						</View>
						{/* Document Info */}
						<View>
							<Text style={[styles.documentTitle, { color: theme.text }]}>
								Document Details
							</Text>

							{document.documentType && (
								<InfoRow
									label="Type"
									value={document.documentType}
									onPress={() => handleCopyText(document.documentType!)}
								/>
							)}

							<InfoRow
								label="Date"
								value={formatDate(document.createdAt)}
								onPress={() => handleCopyText(formatDate(document.createdAt))}
							/>

							{document.vendor && (
								<InfoRow
									label="Vendor"
									value={document.vendor}
									onPress={() => handleCopyText(document.vendor!)}
								/>
							)}

							{document.totalAmount && (
								<InfoRow
									label="Amount"
									value={formatCurrency(document.totalAmount)}
									onPress={() => {
										const formattedAmount = formatCurrency(
											document.totalAmount,
										);
										if (formattedAmount) {
											handleCopyText(formattedAmount);
										}
									}}
								/>
							)}

							{/* Extracted text preview */}
							{document.metadata && (
								<View style={styles.textPreview}>
									<Text
										style={[styles.textPreviewLabel, { color: theme.text }]}
									>
										Extracted Text:
									</Text>
									<Text
										style={[styles.textPreviewContent, { color: theme.text }]}
										numberOfLines={3}
										ellipsizeMode="tail"
									>
										{typeof document.metadata === "string"
											? document.metadata
											: JSON.stringify(document.metadata)}
									</Text>
								</View>
							)}
						</View>
					</View>
				</BottomSheet>
			</GestureHandlerRootView>
		</Modal>
	);
};
