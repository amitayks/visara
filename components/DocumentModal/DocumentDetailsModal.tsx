import Clipboard from "@react-native-clipboard/clipboard";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Linking,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { PanGestureHandler } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedGestureHandler,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";
import { documentStorage } from "../../services/database/documentStorage";
import type Document from "../../services/database/models/Document";
import { Toast } from "../ui/Toast";

interface DocumentDetailsModalProps {
	isVisible: boolean;
	document: Document | null;
	onClose: () => void;
	onDocumentDeleted?: (documentId: string) => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;
const SWIPE_THRESHOLD = 100;

// not used at the app //
export function DocumentDetailsModal({
	isVisible,
	document,
	onClose,
	onDocumentDeleted,
}: DocumentDetailsModalProps) {
	const [isDeleting, setIsDeleting] = useState(false);
	const [toastVisible, setToastVisible] = useState(false);
	const [toastMessage, setToastMessage] = useState("");
	const translateY = useSharedValue(MODAL_HEIGHT);
	const opacity = useSharedValue(0);
	const backdropOpacity = useSharedValue(0);
	const contentScale = useSharedValue(0.9);

	// Debug logs for WatermelonDB model
	useEffect(() => {
		if (isVisible && document) {
			console.log("Document model:", document);
			console.log("Document ID:", document.id);
			console.log("Document type value:", document.documentType);
			console.log("Document vendor value:", document.vendor);
			console.log("Document totalAmount value:", document.totalAmount);
			console.log("Document currency value:", document.currency);
			console.log("Document date value:", document.date);
			console.log("Document processedAt value:", document.processedAt);
			console.log("Document ocrText:", document.ocrText);
			console.log("Document metadata:", document.metadata);
			console.log("Document confidence:", document.confidence);
		}
	}, [isVisible, document]);

	// Helper function to show toast
	const showToast = useCallback((message: string) => {
		setToastMessage(message);
		setToastVisible(true);
	}, []);

	const hideToast = useCallback(() => {
		setToastVisible(false);
	}, []);

	// Format document type for display
	const formatDocumentType = useCallback((documentType?: string) => {
		console.log("Formatting document type:", documentType);
		if (!documentType || documentType === "") return "Unknown";
		const formatted = documentType.replace(/_/g, " ");
		return formatted.charAt(0).toUpperCase() + formatted.slice(1);
	}, []);

	// Animate modal open/close
	useEffect(() => {
		if (isVisible) {
			// Opening animation
			backdropOpacity.value = withTiming(0.6, { duration: 300 });
			translateY.value = withSpring(0, {
				damping: 20,
				stiffness: 300,
			});
			contentScale.value = withSpring(1, {
				damping: 15,
				stiffness: 300,
			});
			opacity.value = withTiming(1, { duration: 300 });
		} else {
			// Closing animation
			backdropOpacity.value = withTiming(0, { duration: 250 });
			translateY.value = withTiming(MODAL_HEIGHT, { duration: 300 });
			contentScale.value = withTiming(0.9, { duration: 300 });
			opacity.value = withTiming(0, { duration: 250 });
		}
	}, [isVisible, translateY, opacity, backdropOpacity, contentScale]);

	// Gesture handler for swipe to dismiss
	const gestureHandler = useAnimatedGestureHandler({
		onStart: (_, context: any) => {
			context.startY = translateY.value;
		},
		onActive: (event, context) => {
			const newTranslateY = context.startY + event.translationY;
			// Only allow downward swipes
			if (newTranslateY >= 0) {
				translateY.value = newTranslateY;
				// Reduce opacity as user swipes down
				opacity.value = Math.max(
					0.3,
					1 - newTranslateY / (SCREEN_HEIGHT * 0.5),
				);
			}
		},
		onEnd: (event) => {
			const shouldDismiss =
				event.translationY > SWIPE_THRESHOLD || event.velocityY > 500;

			if (shouldDismiss) {
				translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
				opacity.value = withTiming(0, { duration: 300 }, () => {
					runOnJS(onClose)();
				});
			} else {
				translateY.value = withSpring(0);
				opacity.value = withSpring(1);
			}
		},
	});

	const backdropAnimatedStyle = useAnimatedStyle(() => ({
		opacity: backdropOpacity.value,
	}));

	const modalAnimatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateY: translateY.value },
			{ scale: contentScale.value },
		],
		opacity: opacity.value,
	}));

	// Action handlers
	const handleOpenInGallery = useCallback(async () => {
		if (!document?.imageUri) return;

		try {
			const canOpen = await Linking.canOpenURL(document.imageUri);
			if (canOpen) {
				await Linking.openURL(document.imageUri);
			} else {
				Alert.alert("Error", "Cannot open this image in gallery");
			}
		} catch (error) {
			console.error("Failed to open in gallery:", error);
			Alert.alert("Error", "Failed to open image in gallery");
		}
	}, [document]);

	const handleShare = useCallback(async () => {
		if (!document) return;

		try {
			const shareContent = {
				title: `Document: ${formatDocumentType(document.documentType)}`,
				message: `Document Details:\n\nType: ${formatDocumentType(document.documentType)}\n${
					document.vendor ? `Vendor: ${document.vendor}\n` : ""
				}${
					document.totalAmount
						? `Amount: ${document.currency || "$"}${document.totalAmount.toFixed(2)}\n`
						: ""
				}${
					document.date
						? `Date: ${new Date(document.date).toLocaleDateString()}\n`
						: ""
				}\nText Content:\n${document.ocrText || ""}`,
				url: document.imageUri,
			};

			await Share.share(shareContent);
		} catch (error) {
			console.error("Failed to share:", error);
			Alert.alert("Error", "Failed to share document");
		}
	}, [document, formatDocumentType]);

	const handleCopyText = useCallback(async () => {
		if (!document) return;

		try {
			// Build text array and filter out empty strings
			const textToCopy = [
				`Type: ${formatDocumentType(document.documentType)}`,
				document.vendor ? `Vendor: ${document.vendor}` : "",
				document.totalAmount !== null &&
				document.totalAmount !== undefined &&
				document.totalAmount > 0
					? `Amount: ${document.currency || "$"}${document.totalAmount.toFixed(2)}`
					: "",
				`Date: ${
					document.date
						? new Date(document.date).toLocaleDateString()
						: document.processedAt
							? new Date(document.processedAt).toLocaleDateString()
							: "Unknown"
				}`,
				"",
				"Extracted Text:",
				document.ocrText || "No text extracted",
			]
				.filter(Boolean)
				.join("\n");

			await Clipboard.setString(textToCopy);
			showToast("info copy successfully");
		} catch (error) {
			console.error("Failed to copy text:", error);
			Alert.alert("Error", "Failed to copy text");
		}
	}, [document, showToast, formatDocumentType]);

	const handleDelete = useCallback(() => {
		if (!document) return;

		console.log("Attempting to delete document model:", document);
		console.log("Document ID for deletion:", document.id);
		console.log("Document ID type:", typeof document.id);

		// Check if WatermelonDB document has an ID
		if (!document.id) {
			console.error("Document missing ID");
			Alert.alert("Error", "Cannot delete document: No ID found");
			return;
		}

		Alert.alert(
			"Delete Document",
			"Are you sure you want to delete this document? This action cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							setIsDeleting(true);
							console.log("Deleting document with ID:", document.id);

							await documentStorage.deleteDocument(document.id);

							console.log("Document deleted successfully");
							onDocumentDeleted?.(document.id);
							onClose();
						} catch (error) {
							console.error("Failed to delete document:", error);
							Alert.alert(
								"Error",
								"Failed to delete document: " +
									(error instanceof Error ? error.message : String(error)),
							);
						} finally {
							setIsDeleting(false);
						}
					},
				},
			],
		);
	}, [document, onDocumentDeleted, onClose]);

	// Format date for display
	const formatDate = useCallback((timestamp: number) => {
		return new Date(timestamp).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	}, []);

	// Extract items from metadata or OCR text
	const extractItems = useCallback((document: Document) => {
		// Try to get items from metadata first
		if (document.metadata && document.metadata.items) {
			console.log("Using items from metadata:", document.metadata.items);
			return document.metadata.items;
		}

		// Fallback to OCR text parsing
		if (document.ocrText) {
			console.log("Parsing items from OCR text");
			const lines = document.ocrText
				.split("\n")
				.filter((line) => line.trim().length > 3);
			return lines.slice(0, 10); // Limit to first 10 lines
		}

		return [];
	}, []);

	if (!document) return null;

	const items = extractItems(document);

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="slide"
			onRequestClose={onClose}
			statusBarTranslucent={true}
		>
			<View style={styles.modalOverlay}>
				<Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
					<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				</Animated.View>

				<PanGestureHandler onGestureEvent={gestureHandler}>
					<Animated.View style={[styles.modalContent, modalAnimatedStyle]}>
						{/* Handle bar for swipe indication */}
						<View style={styles.handleBar} />

						{/* Header */}
						<View style={styles.header}>
							<Text style={styles.modalTitle}>Document Details</Text>
							<TouchableOpacity
								style={styles.closeButton}
								onPress={onClose}
								hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
							>
								<Icon name="close" size={24} color="#666666" />
							</TouchableOpacity>
						</View>

						{/* Content */}
						<ScrollView
							style={styles.scrollContent}
							showsVerticalScrollIndicator={false}
							bounces={true}
						>
							{/* Document Details Section */}
							<View style={styles.detailsSection}>
								<View style={styles.detailRow}>
									<Text style={styles.detailLabel}>Type:</Text>
									<Text style={styles.detailValue}>
										{formatDocumentType(document.documentType)}
									</Text>
								</View>

								<View style={styles.detailRow}>
									<Text style={styles.detailLabel}>Vendor:</Text>
									<Text style={styles.detailValue}>
										{document.vendor || "Unknown Vendor"}
									</Text>
								</View>

								{document.totalAmount !== null &&
									document.totalAmount !== undefined &&
									document.totalAmount > 0 && (
										<View style={styles.detailRow}>
											<Text style={styles.detailLabel}>Total Amount:</Text>
											<Text style={styles.detailValue}>
												{document.currency || "$"}
												{document.totalAmount.toFixed(2)}
											</Text>
										</View>
									)}

								<View style={styles.detailRow}>
									<Text style={styles.detailLabel}>Time Processed:</Text>
									<Text style={styles.detailValue}>
										{document.processedAt
											? new Date(document.processedAt).toLocaleDateString()
											: document.date
												? new Date(document.date).toLocaleDateString()
												: "Unknown"}
									</Text>
								</View>
							</View>

							{/* Extracted Information Section */}
							{items.length > 0 && (
								<View style={styles.extractedSection}>
									<Text style={styles.sectionTitle}>Extracted Information</Text>
									<View style={styles.itemsList}>
										<Text style={styles.itemsLabel}>Items:</Text>
										{items.map((item, index) => (
											<Text key={index} style={styles.itemText}>
												{typeof item === "string"
													? item
													: typeof item === "object" && item.name
														? `${item.name}${item.price ? ` - $${item.price.toFixed(2)}` : ""}${item.quantity ? ` (x${item.quantity})` : ""}`
														: JSON.stringify(item)}
											</Text>
										))}
									</View>
								</View>
							)}

							{/* Open in Gallery Button */}
							<TouchableOpacity
								style={styles.galleryButton}
								onPress={handleOpenInGallery}
							>
								<Text style={styles.galleryButtonText}>
									open image in gallery
								</Text>
							</TouchableOpacity>
						</ScrollView>

						{/* Action Buttons */}
						<View style={styles.actionButtons}>
							<TouchableOpacity
								style={styles.actionButton}
								onPress={handleDelete}
								disabled={isDeleting}
							>
								{isDeleting ? (
									<ActivityIndicator size="small" color="#333333" />
								) : (
									<Icon name="trash-outline" size={24} color="#333333" />
								)}
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.actionButton}
								onPress={handleShare}
							>
								<Icon name="share-outline" size={24} color="#333333" />
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.actionButton}
								onPress={handleCopyText}
							>
								<Icon name="copy-outline" size={24} color="#333333" />
							</TouchableOpacity>
						</View>
					</Animated.View>
				</PanGestureHandler>

				{/* Toast Notifications */}
				<Toast
					visible={toastVisible}
					message={toastMessage}
					onHide={hideToast}
					duration={2000}
				/>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		justifyContent: "flex-end",
	},
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
	},
	modalContent: {
		backgroundColor: "#FFFFFF",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		maxHeight: MODAL_HEIGHT,
		paddingBottom: Platform.OS === "ios" ? 34 : 20, // Account for home indicator
	},
	handleBar: {
		width: 40,
		height: 4,
		backgroundColor: "#CCCCCC",
		borderRadius: 2,
		alignSelf: "center",
		marginTop: 8,
		marginBottom: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingBottom: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#F0F0F0",
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#333333",
	},
	closeButton: {
		padding: 4,
	},
	scrollContent: {
		flex: 1,
	},
	detailsSection: {
		paddingHorizontal: 20,
		paddingVertical: 20,
	},
	detailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
	},
	detailLabel: {
		fontSize: 16,
		color: "#666666",
	},
	detailValue: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333333",
	},
	extractedSection: {
		paddingHorizontal: 20,
		paddingVertical: 20,
		borderTopWidth: 1,
		borderTopColor: "#F0F0F0",
	},
	itemsLabel: {
		fontSize: 14,
		color: "#666666",
		marginBottom: 8,
	},
	galleryButton: {
		marginHorizontal: 20,
		marginVertical: 16,
		paddingVertical: 12,
		backgroundColor: "#F2F2F7",
		borderRadius: 8,
		alignItems: "center",
	},
	galleryButtonText: {
		fontSize: 16,
		color: "#333333",
	},
	metadataSection: {
		paddingHorizontal: 20,
		paddingVertical: 16,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#333333",
		marginBottom: 16,
	},
	metadataRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#F8F8F8",
	},
	metadataContent: {
		flex: 1,
		marginLeft: 12,
	},
	metadataLabel: {
		fontSize: 14,
		color: "#666666",
		marginBottom: 2,
	},
	metadataValue: {
		fontSize: 16,
		fontWeight: "500",
		color: "#333333",
	},
	itemsSection: {
		paddingHorizontal: 20,
		paddingVertical: 16,
		borderTopWidth: 1,
		borderTopColor: "#F0F0F0",
	},
	itemsList: {
		backgroundColor: "#FAFAFA",
		borderRadius: 8,
		padding: 12,
	},
	itemRow: {
		paddingVertical: 4,
	},
	itemText: {
		fontSize: 14,
		color: "#555555",
		lineHeight: 20,
	},
	ocrSection: {
		paddingHorizontal: 20,
		paddingVertical: 16,
		borderTopWidth: 1,
		borderTopColor: "#F0F0F0",
	},
	ocrContainer: {
		backgroundColor: "#FAFAFA",
		borderRadius: 8,
		padding: 16,
		maxHeight: 150,
	},
	ocrText: {
		fontSize: 14,
		color: "#555555",
		lineHeight: 20,
	},
	actionButtons: {
		flexDirection: "row",
		justifyContent: "space-around",
		paddingHorizontal: 20,
		paddingVertical: 16,
		borderTopWidth: 1,
		borderTopColor: "#F0F0F0",
	},
	actionButton: {
		padding: 12,
	},
	loadingContainer: {
		// Placeholder for loading state
	},
});
