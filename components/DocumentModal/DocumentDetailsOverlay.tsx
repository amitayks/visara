import Clipboard from "@react-native-clipboard/clipboard";
import React, { useEffect } from "react";
import {
	Alert,
	Dimensions,
	Linking,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import type Document from "../../services/database/models/Document";

const { width, height } = Dimensions.get("window");

interface DocumentDetailsOverlayProps {
	visible: boolean;
	document: Document | null;
	onClose: () => void;
	onDelete?: (documentId: string) => Promise<void>;
}

// Helper Components
const InfoRow = ({ label, value }: { label: string; value: string }) => (
	<View style={styles.infoRow}>
		<Text style={styles.label}>{label}:</Text>
		<Text style={styles.value}>{value}</Text>
	</View>
);

const ActionButton = ({
	icon,
	label,
	onPress,
}: {
	icon: string;
	label: string;
	onPress: () => void;
}) => (
	<TouchableOpacity style={styles.actionButton} onPress={onPress}>
		<Text style={styles.actionIcon}>{icon}</Text>
		<Text style={styles.actionLabel}>{label}</Text>
	</TouchableOpacity>
);

const formatDocumentType = (type: string) => {
	const types: Record<string, string> = {
		receipt: "Receipt",
		invoice: "Invoice",
		id: "ID Document",
		letter: "Letter",
		form: "Form",
		screenshot: "Screenshot",
	};
	return types[type] || type.charAt(0).toUpperCase() + type.slice(1);
};
// not used at the app //
export function DocumentDetailsOverlay({
	visible,
	document,
	onClose,
	onDelete,
}: DocumentDetailsOverlayProps) {
	const scale = useSharedValue(0);
	const opacity = useSharedValue(0);

	useEffect(() => {
		if (visible) {
			scale.value = withSpring(1, { damping: 15 });
			opacity.value = withTiming(1, { duration: 200 });
		} else {
			scale.value = withTiming(0, { duration: 200 });
			opacity.value = withTiming(0, { duration: 200 });
		}
	}, [visible]);

	const cardStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}));

	const backdropStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));

	if (!document) return null;

	// Extract data from the WatermelonDB document
	console.log("Document in overlay:", document);
	console.log("Document has _raw?:", !!(document as any)?._raw);

	// Access the raw data directly since WatermelonDB model properties might not be accessible
	const rawData = (document as any)?._raw || {};
	console.log("Raw data:", rawData);

	// Display ALL raw data fields for now
	const displayData = {
		// Core fields
		id: rawData.id || document.id || "Unknown ID",
		type: rawData.document_type || "Unknown",
		vendor: rawData.vendor || "Unknown Vendor",
		totalAmount: rawData.total_amount,
		currency: rawData.currency || "$",
		date: rawData.date || rawData.processed_at,
		ocrText: rawData.ocr_text || "",
		confidence: rawData.confidence,
		imageUri: rawData.image_uri || "",

		// Additional fields from raw data
		imageHash: rawData.image_hash,
		imageHeight: rawData.image_height,
		imageWidth: rawData.image_width,
		imageSize: rawData.image_size,
		imageTakenDate: rawData.image_taken_date,
		processedAt: rawData.processed_at,
		createdAt: rawData.created_at,
		updatedAt: rawData.updated_at,
		keywords: rawData.keywords,
		searchVector: rawData.search_vector,
		metadata: rawData.metadata,
		_status: rawData._status,
		_changed: rawData._changed,
	};

	console.log("All display data extracted:", displayData);

	// Parse metadata - it's stored as JSON string in raw data
	let parsedMetadata: any = {};
	let items: any[] = [];
	try {
		if (displayData.metadata) {
			parsedMetadata =
				typeof displayData.metadata === "string"
					? JSON.parse(displayData.metadata)
					: displayData.metadata;
			items = parsedMetadata.items || [];
			console.log("Parsed metadata:", parsedMetadata);
			console.log("Metadata items:", items);
		}
	} catch (e) {
		console.error("Failed to parse metadata:", e);
	}

	// Parse keywords if they're stored as JSON string
	let keywords: string[] = [];
	try {
		if (displayData.keywords) {
			keywords =
				typeof displayData.keywords === "string"
					? JSON.parse(displayData.keywords)
					: displayData.keywords;
			console.log("Parsed keywords:", keywords);
		}
	} catch (e) {
		console.error("Failed to parse keywords:", e);
	}

	// Action Handlers
	const handleCopy = async () => {
		const textParts = [
			`Type: ${formatDocumentType(displayData.type)}`,
			`Vendor: ${displayData.vendor}`,
		];

		if (displayData.totalAmount) {
			textParts.push(
				`Amount: ${displayData.currency}${displayData.totalAmount.toFixed(2)}`,
			);
		}

		if (displayData.date) {
			// Handle both Date objects and numeric timestamps
			const dateValue =
				displayData.date instanceof Date
					? displayData.date
					: new Date(displayData.date);
			textParts.push(`Date: ${dateValue.toLocaleDateString()}`);
		}

		if (displayData.ocrText) {
			textParts.push("", "Extracted Text:", displayData.ocrText);
		}

		const textToCopy = textParts.join("\n");

		try {
			await Clipboard.setString(textToCopy);
			onClose();
			setTimeout(() => {
				Alert.alert("Success", "Document information copied to clipboard");
			}, 300);
		} catch (error) {
			console.error("Failed to copy:", error);
			Alert.alert("Error", "Failed to copy to clipboard");
		}
	};

	const handleDelete = () => {
		if (!onDelete || !displayData.id) return;

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
							await onDelete(displayData.id);
							onClose();
						} catch (error) {
							console.error("Failed to delete:", error);
							Alert.alert("Error", "Failed to delete document");
						}
					},
				},
			],
		);
	};

	const handleOpenGallery = async () => {
		if (!displayData.imageUri) {
			Alert.alert("Error", "No image URI found");
			return;
		}

		try {
			const canOpen = await Linking.canOpenURL(displayData.imageUri);
			if (canOpen) {
				await Linking.openURL(displayData.imageUri);
			} else {
				Alert.alert("Error", "Cannot open image in gallery");
			}
		} catch (error) {
			console.error("Failed to open in gallery:", error);
			Alert.alert("Error", "Failed to open image in gallery");
		}
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<View style={styles.container}>
				{/* Backdrop */}
				<Animated.View style={[styles.backdrop, backdropStyle]}>
					<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				</Animated.View>

				{/* Card */}
				<Animated.View style={[styles.card, cardStyle]}>
					<ScrollView showsVerticalScrollIndicator={false}>
						{/* Header */}
						<View style={styles.header}>
							<Text style={styles.title}>Document Details</Text>
							<TouchableOpacity
								onPress={onClose}
								hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
							>
								<Text style={styles.closeButton}>✕</Text>
							</TouchableOpacity>
						</View>

						{/* Main Info */}
						<View style={styles.section}>
							<InfoRow
								label="Type"
								value={formatDocumentType(displayData.type)}
							/>
							<InfoRow label="Vendor" value={displayData.vendor} />
							{displayData.totalAmount && displayData.totalAmount > 0 && (
								<InfoRow
									label="Total Amount"
									value={`${displayData.currency}${displayData.totalAmount.toFixed(2)}`}
								/>
							)}
							<InfoRow
								label="Time Processed"
								value={
									displayData.date
										? (displayData.date instanceof Date
												? displayData.date
												: new Date(displayData.date)
											).toLocaleDateString()
										: "Unknown"
								}
							/>
							{displayData.confidence && (
								<InfoRow
									label="Confidence"
									value={`${Math.round(displayData.confidence * 100)}%`}
								/>
							)}
						</View>

						{/* DEBUG: Show ALL raw data */}
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>DEBUG: All Raw Data</Text>
							<View style={styles.textContainer}>
								<Text style={styles.ocrText}>
									{JSON.stringify(rawData, null, 2)}
								</Text>
							</View>
						</View>

						{/* Extracted Items */}
						{items.length > 0 && (
							<View style={styles.section}>
								<Text style={styles.sectionTitle}>Extracted Information</Text>
								<View style={styles.itemsContainer}>
									<Text style={styles.itemsLabel}>Items:</Text>
									{items.map((item: any, index: number) => (
										<Text key={index} style={styles.itemText}>
											{typeof item === "string"
												? item
												: `${item.name || "Item"} ${item.quantity ? `- ${item.quantity} x` : ""} ${item.price ? `$${item.price.toFixed(2)}` : ""}`}
										</Text>
									))}
								</View>
							</View>
						)}

						{/* OCR Text */}
						{displayData.ocrText && (
							<View style={styles.section}>
								<Text style={styles.sectionTitle}>Extracted Text</Text>
								<View style={styles.textContainer}>
									<Text style={styles.ocrText}>{displayData.ocrText}</Text>
								</View>
							</View>
						)}

						{/* Actions */}
						<View style={styles.actions}>
							<ActionButton
								icon="📤"
								label="Gallery"
								onPress={handleOpenGallery}
							/>
							<ActionButton icon="📋" label="Copy" onPress={handleCopy} />
							{onDelete && (
								<ActionButton icon="🗑️" label="Delete" onPress={handleDelete} />
							)}
						</View>
					</ScrollView>
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	card: {
		width: width * 0.9,
		maxHeight: height * 0.8,
		backgroundColor: "white",
		borderRadius: 16,
		padding: 20,
		elevation: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 10,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 20,
		paddingBottom: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	title: {
		fontSize: 20,
		fontWeight: "bold",
		color: "#333",
	},
	closeButton: {
		fontSize: 24,
		color: "#666",
		fontWeight: "bold",
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		marginBottom: 10,
		color: "#333",
	},
	infoRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
		alignItems: "center",
	},
	label: {
		color: "#666",
		fontSize: 14,
		flex: 1,
	},
	value: {
		fontWeight: "500",
		fontSize: 14,
		color: "#333",
		flex: 2,
		textAlign: "right",
	},
	itemsContainer: {
		backgroundColor: "#f8f8f8",
		padding: 12,
		borderRadius: 8,
	},
	itemsLabel: {
		fontWeight: "600",
		marginBottom: 6,
		color: "#333",
	},
	itemText: {
		fontSize: 13,
		marginVertical: 2,
		color: "#555",
	},
	textContainer: {
		backgroundColor: "#f8f8f8",
		padding: 12,
		borderRadius: 8,
		maxHeight: 120,
	},
	ocrText: {
		fontSize: 13,
		lineHeight: 18,
		color: "#555",
	},
	actions: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginTop: 20,
		paddingTop: 20,
		borderTopWidth: 1,
		borderTopColor: "#eee",
	},
	actionButton: {
		alignItems: "center",
		padding: 10,
		borderRadius: 8,
		minWidth: 60,
	},
	actionIcon: {
		fontSize: 24,
		marginBottom: 4,
	},
	actionLabel: {
		fontSize: 12,
		color: "#666",
		fontWeight: "500",
	},
});
