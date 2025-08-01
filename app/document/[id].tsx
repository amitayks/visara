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

				{/* Hybrid Processing Results */}
				{document.metadata && (
					<View style={styles.hybridSection}>
						<Text style={styles.hybridTitle}>Hybrid Processing Results</Text>
						
						{/* Document Type */}
						{document.metadata.hybridResult && (
							<View style={styles.documentTypeContainer}>
								<Text style={styles.sectionTitle}>Document Type</Text>
								<View style={styles.documentTypeBadge}>
									<Text style={styles.documentTypeText}>
										{document.metadata.hybridResult.contextualResult.documentType}
									</Text>
									<Text style={styles.confidenceText}>
										({(document.metadata.hybridResult.contextualResult.confidence * 100).toFixed(1)}%)
									</Text>
								</View>
							</View>
						)}
						
						{/* Quality Metrics */}
						{document.metadata.hybridResult?.qualityMetrics && (
							<View style={styles.qualityContainer}>
								<Text style={styles.sectionTitle}>Quality Assessment</Text>
								<View style={styles.metricsGrid}>
									<View style={styles.metricItem}>
										<Text style={styles.metricLabel}>OCR Quality</Text>
										<Text style={styles.metricValue}>
											{(document.metadata.hybridResult.qualityMetrics.overall.ocrQuality * 100).toFixed(1)}%
										</Text>
									</View>
									<View style={styles.metricItem}>
										<Text style={styles.metricLabel}>Completeness</Text>
										<Text style={styles.metricValue}>
											{(document.metadata.hybridResult.qualityMetrics.overall.completeness * 100).toFixed(1)}%
										</Text>
									</View>
									<View style={styles.metricItem}>
										<Text style={styles.metricLabel}>Consistency</Text>
										<Text style={styles.metricValue}>
											{(document.metadata.hybridResult.qualityMetrics.overall.consistency * 100).toFixed(1)}%
										</Text>
									</View>
									<View style={styles.metricItem}>
										<Text style={styles.metricLabel}>Total Score</Text>
										<Text style={[styles.metricValue, styles.totalScore]}>
											{(document.metadata.hybridResult.qualityMetrics.overall.totalScore * 100).toFixed(1)}%
										</Text>
									</View>
								</View>
								{document.metadata.hybridResult.qualityMetrics.overall.warnings.length > 0 && (
									<View style={styles.warningsContainer}>
										<Text style={styles.warningsTitle}>Warnings:</Text>
										{document.metadata.hybridResult.qualityMetrics.overall.warnings.map((warning, index) => (
											<Text key={index} style={styles.warningText}>• {warning}</Text>
										))}
									</View>
								)}
							</View>
						)}
						
						{/* Extracted Information */}
						<View style={styles.structuredDataContainer}>
							<Text style={styles.sectionTitle}>Extracted Information</Text>
							
							{/* Vendor */}
							{document.metadata.vendor && (
								<View style={styles.dataRow}>
									<Text style={styles.dataLabel}>Vendor:</Text>
									<Text style={styles.dataValue}>{document.metadata.vendor}</Text>
								</View>
							)}
							
							{/* Total Amount */}
							{document.metadata.hybridResult?.structuredData?.totalAmount !== undefined && (
								<View style={styles.dataRow}>
									<Text style={styles.dataLabel}>Total:</Text>
									<Text style={styles.dataValue}>
										{document.metadata.hybridResult.structuredData.currency} {document.metadata.hybridResult.structuredData.totalAmount.toFixed(2)}
									</Text>
								</View>
							)}
							
							{/* Dates */}
							{document.metadata.dates && document.metadata.dates.length > 0 && (
								<>
									{document.metadata.dates.map((dateInfo, index) => (
										<View key={index} style={styles.dataRow}>
											<Text style={styles.dataLabel}>{dateInfo.type} Date:</Text>
											<Text style={styles.dataValue}>
												{new Date(dateInfo.date).toLocaleDateString()}
											</Text>
										</View>
									))}
								</>
							)}
							
							{/* Items */}
							{document.metadata.items && document.metadata.items.length > 0 && (
								<View style={styles.itemsContainer}>
									<Text style={styles.dataLabel}>Items:</Text>
									{document.metadata.items.map((item, index) => (
										<Text key={index} style={styles.itemText}>
											• {item.name} {item.price ? `- $${item.price}` : ''}
											{item.quantity ? ` x${item.quantity}` : ''}
										</Text>
									))}
								</View>
							)}
							
							{/* Location */}
							{document.metadata.location && (
								<View style={styles.dataRow}>
									<Text style={styles.dataLabel}>Location:</Text>
									<Text style={styles.dataValue}>
										{[
											document.metadata.location.address,
											document.metadata.location.city,
											document.metadata.location.country
										].filter(Boolean).join(', ')}
									</Text>
								</View>
							)}
						</View>
						
						{/* Processing Stats */}
						{document.metadata.hybridResult && (
							<View style={styles.statsContainer}>
								<Text style={styles.statsTitle}>Processing Stats</Text>
								<Text style={styles.statsText}>
									Total Time: {document.metadata.hybridResult.processingStats.totalTime}ms
								</Text>
								<Text style={styles.statsText}>
									Engines Used: {document.metadata.hybridResult.processingStats.ocrEngines.join(', ')}
								</Text>
							</View>
						)}
					</View>
				)}

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
	metadataItem: {
		marginBottom: 16,
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
	hybridSection: {
		backgroundColor: "#FFFFFF",
		marginHorizontal: 16,
		padding: 16,
		borderRadius: 8,
		marginBottom: 16,
	},
	hybridTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 16,
	},
	qualityContainer: {
		marginBottom: 16,
	},
	qualityTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#5856D6",
		marginBottom: 8,
	},
	metricsGrid: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 12,
	},
	metricItem: {
		flex: 1,
		backgroundColor: "#F8F8FF",
		padding: 8,
		borderRadius: 6,
		alignItems: "center",
	},
	metricLabel: {
		fontSize: 11,
		color: "#666666",
		marginBottom: 2,
	},
	metricValue: {
		fontSize: 13,
		fontWeight: "600",
		color: "#5856D6",
	},
	warningsContainer: {
		backgroundColor: "#FFF3CD",
		padding: 8,
		borderRadius: 6,
		borderLeftWidth: 3,
		borderLeftColor: "#FFC107",
	},
	warningsTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#856404",
		marginBottom: 4,
	},
	warningText: {
		fontSize: 12,
		color: "#856404",
		marginBottom: 2,
	},
	entitiesContainer: {
		marginBottom: 16,
	},
	entitiesTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#34C759",
		marginBottom: 8,
	},
	entitiesGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
	},
	entityBadge: {
		backgroundColor: "#E8F5E8",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 4,
		maxWidth: "48%",
	},
	entityType: {
		fontSize: 10,
		fontWeight: "600",
		color: "#2E7D32",
		textTransform: "uppercase",
	},
	entityValue: {
		fontSize: 11,
		color: "#2E7D32",
		marginTop: 2,
	},
	processingInfoContainer: {
		backgroundColor: "#F2F2F7",
		padding: 12,
		borderRadius: 6,
	},
	processingInfoTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 8,
	},
	processingInfoRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	processingInfoLabel: {
		fontSize: 12,
		color: "#666666",
	},
	processingInfoValue: {
		fontSize: 12,
		color: "#000000",
		fontWeight: "500",
	},
	documentTypeContainer: {
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000000",
		marginBottom: 8,
	},
	documentTypeBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F0F0F0",
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignSelf: "flex-start",
	},
	documentTypeText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000000",
		textTransform: "capitalize",
	},
	totalScore: {
		color: "#0066FF",
	},
	structuredDataContainer: {
		marginBottom: 16,
	},
	dataRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#F0F0F0",
	},
	dataLabel: {
		fontSize: 14,
		color: "#666666",
	},
	dataValue: {
		fontSize: 14,
		fontWeight: "600",
		color: "#000000",
		flex: 1,
		textAlign: "right",
	},
	itemsContainer: {
		marginTop: 8,
		marginBottom: 8,
	},
	itemText: {
		fontSize: 14,
		color: "#333333",
		marginTop: 4,
		marginLeft: 16,
	},
	statsContainer: {
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: "#F0F0F0",
	},
	statsTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#666666",
		marginBottom: 8,
	},
	statsText: {
		fontSize: 12,
		color: "#666666",
		marginBottom: 4,
	},
});
