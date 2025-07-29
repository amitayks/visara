import { useNavigation, useRoute } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Image,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import RNFS from "react-native-fs";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { documentStorage } from "../../services/database/documentStorage";
import type Document from "../../services/database/models/Document";
import { copyToClipboard } from "../../utils/clipboard";

const { width: screenWidth } = Dimensions.get("window");

export default function DocumentDetailScreen() {
	const route = useRoute();
	const navigation = useNavigation();
	const { id } = route.params as { id: string };
	const [document, setDocument] = useState<Document | null>(null);
	const [loading, setLoading] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [imageError, setImageError] = useState(false);
	const [editedData, setEditedData] = useState({
		vendor: "",
		totalAmount: "",
		currency: "",
	});

	useEffect(() => {
		loadDocument();
	}, [id]);

	const loadDocument = async () => {
		try {
			const doc = await documentStorage.getDocumentById(id as string);
			setDocument(doc);
			if (doc) {
				console.log("Document loaded:", {
					id: doc.id,
					imageUri: doc.imageUri,
					thumbnailUri: doc.thumbnailUri,
					documentType: doc.documentType,
				});

				// Check if the image URI exists (for handling old temporary URIs)
				try {
					const exists = await RNFS.exists(doc.imageUri);
					if (!exists) {
						console.warn("Original image not found at:", doc.imageUri);
						setImageError(true);
					}
				} catch (error) {
					console.warn("Error checking image existence:", error);
					setImageError(true);
				}

				setEditedData({
					vendor: doc.vendor || "",
					totalAmount: doc.totalAmount?.toString() || "",
					currency: doc.currency || "USD",
				});
			}
		} catch (error) {
			console.error("Error loading document:", error);
			Alert.alert("Error", "Failed to load document");
		} finally {
			setLoading(false);
		}
	};

	// copyToClipboard is now imported from utils

	const shareDocument = async () => {
		if (!document) return;

		try {
			await Share.share({
				message: `Document: ${document.vendor || "Unknown"}\n\n${document.ocrText}`,
				title: document.vendor || "Document",
			});
		} catch (error) {
			console.error("Error sharing:", error);
		}
	};

	const deleteDocument = () => {
		Alert.alert(
			"Delete Document",
			"Are you sure you want to delete this document?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							await documentStorage.deleteDocument(id);
							navigation.goBack();
						} catch (error) {
							console.error("Error deleting document:", error);
							Alert.alert("Error", "Failed to delete document");
						}
					},
				},
			],
		);
	};

	const saveEdits = async () => {
		if (!document) return;

		try {
			// Create a new document object with updated fields
			// Make sure to preserve all existing fields
			const updatedDoc = {
				...document,
				vendor: editedData.vendor || document.vendor,
				totalAmount: editedData.totalAmount
					? parseFloat(editedData.totalAmount)
					: document.totalAmount,
				currency: editedData.currency || document.currency || "USD",
			};

			// Ensure critical fields are preserved
			if (!updatedDoc.ocrText) {
				updatedDoc.ocrText = document.ocrText || "";
			}

			// Update the document in the database
			const savedDoc = await documentStorage.updateDocument(document.id, {
				vendor: editedData.vendor || undefined,
				totalAmount: editedData.totalAmount
					? parseFloat(editedData.totalAmount)
					: undefined,
				currency: editedData.currency || undefined,
			});

			// Update local state with the saved document
			setDocument(savedDoc);
			setIsEditing(false);
			Alert.alert("Success", "Document updated successfully");
		} catch (error) {
			console.error("Error saving edits:", error);
			Alert.alert("Error", "Failed to save changes");
		}
	};

	const renderTextLine = (text: string | undefined, label: string) => {
		// Handle undefined or null text
		if (!text) {
			return (
				<View style={styles.textSection}>
					<Text style={styles.sectionLabel}>{label}</Text>
					<Text style={styles.lineText}>No text available</Text>
				</View>
			);
		}

		const lines = text.split("\n").filter((line) => line.trim());

		if (lines.length === 0) {
			return (
				<View style={styles.textSection}>
					<Text style={styles.sectionLabel}>{label}</Text>
					<Text style={styles.lineText}>No text available</Text>
				</View>
			);
		}

		return (
			<View style={styles.textSection}>
				<Text style={styles.sectionLabel}>{label}</Text>
				{lines.map((line, index) => (
					<TouchableOpacity
						key={index}
						onPress={() => copyToClipboard(line, `Line ${index + 1}`)}
						style={styles.textLine}
					>
						<Text style={styles.lineText}>{line}</Text>
						<Icon name="copy-outline" size={16} color="#666666" />
					</TouchableOpacity>
				))}
			</View>
		);
	};

	if (loading) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color="#0066FF" />
				</View>
			</SafeAreaView>
		);
	}

	if (!document) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.errorContainer}>
					<Text style={styles.errorText}>Document not found</Text>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => navigation.goBack()}
					>
						<Text style={styles.backButtonText}>Go Back</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<TouchableOpacity
					onPress={() => navigation.goBack()}
					style={styles.headerButton}
				>
					<Icon name="arrow-back" size={24} color="#000000" />
				</TouchableOpacity>
				<Text style={styles.headerTitle}>Document Details</Text>
				<View style={styles.headerActions}>
					<TouchableOpacity onPress={shareDocument} style={styles.headerButton}>
						<Icon name="share-outline" size={24} color="#000000" />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={deleteDocument}
						style={styles.headerButton}
					>
						<Icon name="trash-outline" size={24} color="#FF3B30" />
					</TouchableOpacity>
				</View>
			</View>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				<View style={styles.imageContainer}>
					{!imageError ? (
						<Image
							source={{ uri: document.imageUri }}
							style={styles.documentImage}
							resizeMode="contain"
							onError={() => {
								console.log("Image URI:", document.imageUri);
								setImageError(true);
							}}
						/>
					) : (
						<View style={[styles.documentImage, styles.imagePlaceholder]}>
							<Icon name="image-outline" size={64} color="#CCCCCC" />
							<Text style={styles.imagePlaceholderText}>
								Image not available
							</Text>
							{document.thumbnailUri && (
								<TouchableOpacity
									style={styles.showThumbnailButton}
									onPress={() => setImageError(false)}
								>
									<Text style={styles.showThumbnailButtonText}>
										Try loading again
									</Text>
								</TouchableOpacity>
							)}
						</View>
					)}
					<View style={styles.confidenceBadge}>
						<Text style={styles.confidenceText}>
							{(document.confidence * 100).toFixed(0)}% confidence
						</Text>
					</View>
				</View>

				<View style={styles.metadataContainer}>
					<View style={styles.metadataHeader}>
						<Text style={styles.metadataTitle}>Document Information</Text>
						<TouchableOpacity
							onPress={() => (isEditing ? saveEdits() : setIsEditing(true))}
							style={styles.editButton}
						>
							<Icon
								name={isEditing ? "checkmark" : "pencil"}
								size={20}
								color="#0066FF"
							/>
							<Text style={styles.editButtonText}>
								{isEditing ? "Save" : "Edit"}
							</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.metadataRow}>
						<Text style={styles.metadataLabel}>Type:</Text>
						<Text style={styles.metadataValue}>{document.documentType}</Text>
					</View>

					<View style={styles.metadataRow}>
						<Text style={styles.metadataLabel}>Vendor:</Text>
						{isEditing ? (
							<TextInput
								style={styles.editInput}
								value={editedData.vendor}
								onChangeText={(text) =>
									setEditedData({ ...editedData, vendor: text })
								}
								placeholder="Enter vendor name"
							/>
						) : (
							<TouchableOpacity
								onPress={() =>
									document.vendor && copyToClipboard(document.vendor, "Vendor")
								}
							>
								<Text style={styles.metadataValue}>
									{document.vendor || "Not specified"}
								</Text>
							</TouchableOpacity>
						)}
					</View>

					{document.totalAmount !== undefined && (
						<View style={styles.metadataRow}>
							<Text style={styles.metadataLabel}>Amount:</Text>
							{isEditing ? (
								<View style={styles.amountEditContainer}>
									<TextInput
										style={[styles.editInput, styles.currencyInput]}
										value={editedData.currency}
										onChangeText={(text) =>
											setEditedData({ ...editedData, currency: text })
										}
										placeholder="USD"
									/>
									<TextInput
										style={[styles.editInput, styles.amountInput]}
										value={editedData.totalAmount}
										onChangeText={(text) =>
											setEditedData({ ...editedData, totalAmount: text })
										}
										keyboardType="numeric"
										placeholder="0.00"
									/>
								</View>
							) : (
								<TouchableOpacity
									onPress={() =>
										copyToClipboard(
											`${document.currency || "USD"} ${document.totalAmount}`,
											"Amount",
										)
									}
								>
									<Text style={styles.metadataValue}>
										{document.currency || "USD"} {document.totalAmount}
									</Text>
								</TouchableOpacity>
							)}
						</View>
					)}

					{document.date && (
						<View style={styles.metadataRow}>
							<Text style={styles.metadataLabel}>Date:</Text>
							<TouchableOpacity
								onPress={() =>
									copyToClipboard(
										new Date(document.date!).toLocaleDateString(),
										"Date",
									)
								}
							>
								<Text style={styles.metadataValue}>
									{new Date(document.date).toLocaleDateString()}
								</Text>
							</TouchableOpacity>
						</View>
					)}

					<View style={styles.metadataRow}>
						<Text style={styles.metadataLabel}>Processed:</Text>
						<Text style={styles.metadataValue}>
							{new Date(document.processedAt).toLocaleString()}
						</Text>
					</View>
				</View>

				{renderTextLine(document.ocrText, "Extracted Text")}

				<TouchableOpacity
					style={styles.fullMetadataButton}
					onPress={() =>
						copyToClipboard(
							JSON.stringify(document.metadata, null, 2),
							"Full metadata",
						)
					}
				>
					<Icon name="code-outline" size={20} color="#0066FF" />
					<Text style={styles.fullMetadataButtonText}>Copy Full Metadata</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#FAFAFA",
	},
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	errorContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	errorText: {
		fontSize: 18,
		color: "#666666",
		marginBottom: 20,
	},
	backButton: {
		backgroundColor: "#0066FF",
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 8,
	},
	backButtonText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "600",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: "#FFFFFF",
		borderBottomWidth: 1,
		borderBottomColor: "#E5E5E7",
	},
	headerButton: {
		padding: 4,
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
		flex: 1,
		textAlign: "center",
	},
	headerActions: {
		flexDirection: "row",
		gap: 12,
	},
	content: {
		flex: 1,
	},
	imageContainer: {
		position: "relative",
		backgroundColor: "#FFFFFF",
		marginBottom: 16,
	},
	documentImage: {
		width: screenWidth,
		height: screenWidth * 0.75,
		backgroundColor: "#F2F2F7",
	},
	confidenceBadge: {
		position: "absolute",
		top: 16,
		right: 16,
		backgroundColor: "rgba(0, 102, 255, 0.9)",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
	},
	confidenceText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	metadataContainer: {
		backgroundColor: "#FFFFFF",
		marginHorizontal: 16,
		padding: 16,
		borderRadius: 8,
		marginBottom: 16,
	},
	metadataHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	metadataTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
	},
	editButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	editButtonText: {
		color: "#0066FF",
		fontSize: 16,
		fontWeight: "500",
	},
	metadataRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#F2F2F7",
	},
	metadataLabel: {
		fontSize: 14,
		color: "#666666",
		flex: 1,
	},
	metadataValue: {
		fontSize: 14,
		color: "#000000",
		flex: 2,
		textAlign: "right",
	},
	editInput: {
		flex: 2,
		borderWidth: 1,
		borderColor: "#E5E5E7",
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 4,
		fontSize: 14,
		textAlign: "right",
	},
	amountEditContainer: {
		flex: 2,
		flexDirection: "row",
		gap: 8,
	},
	currencyInput: {
		flex: 0.8,
	},
	amountInput: {
		flex: 1.2,
	},
	textSection: {
		backgroundColor: "#FFFFFF",
		marginHorizontal: 16,
		padding: 16,
		borderRadius: 8,
		marginBottom: 16,
	},
	sectionLabel: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 12,
	},
	textLine: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#F2F2F7",
	},
	lineText: {
		fontSize: 14,
		color: "#333333",
		flex: 1,
		marginRight: 8,
	},
	fullMetadataButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FFFFFF",
		marginHorizontal: 16,
		marginBottom: 32,
		padding: 16,
		borderRadius: 8,
		gap: 8,
	},
	fullMetadataButtonText: {
		color: "#0066FF",
		fontSize: 16,
		fontWeight: "500",
	},
	imagePlaceholder: {
		justifyContent: "center",
		alignItems: "center",
	},
	imagePlaceholderText: {
		color: "#999999",
		fontSize: 16,
		marginTop: 8,
	},
	showThumbnailButton: {
		marginTop: 16,
		paddingHorizontal: 16,
		paddingVertical: 8,
		backgroundColor: "#0066FF",
		borderRadius: 6,
	},
	showThumbnailButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "500",
	},
});
