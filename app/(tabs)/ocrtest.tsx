import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import React, { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Image as RNImage,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import {
	type ImagePickerResponse,
	launchImageLibrary,
} from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { hybridDocumentProcessor } from "../../services/ai/hybridDocumentProcessor";
import type {
	HybridProcessingResult,
	QualityMetrics,
} from "../../services/ai/types/hybridTypes";
import { documentProcessor } from "../../services/ai/documentProcessor";
import { documentStorage } from "../../services/database/documentStorage";
import type { RootStackParamList } from "../../types/navigation";

const { width: screenWidth } = Dimensions.get("window");

export default function OCRTestScreen() {
	const navigation =
		useNavigation<StackNavigationProp<RootStackParamList, "Main">>();
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [hybridResult, setHybridResult] = useState<HybridProcessingResult | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);

	useEffect(() => {
		initializeProcessor();
	}, []);

	const initializeProcessor = async () => {
		setIsInitializing(true);
		try {
			await hybridDocumentProcessor.initialize();
		} catch (error) {
			console.error("Failed to initialize processor:", error);
			Alert.alert("Error", "Failed to initialize processor");
		} finally {
			setIsInitializing(false);
		}
	};

	const pickImage = async () => {
		try {
			const options = {
				mediaType: "photo" as const,
				quality: 1 as const,
			};

			const response = await launchImageLibrary(options);

			if (response.didCancel || response.errorCode) {
				return;
			}

			if (response.assets && response.assets[0]) {
				const imageUri = response.assets[0].uri;
				if (imageUri) {
					setSelectedImage(imageUri);
					setHybridResult(null);
				}
			}
		} catch (error) {
			console.error("Error picking image:", error);
			Alert.alert("Error", "Failed to pick image");
		}
	};

	const processImage = async () => {
		if (!selectedImage) {
			Alert.alert("Error", "Please select an image first");
			return;
		}

		setIsProcessing(true);
		setHybridResult(null);

		try {
			const result = await hybridDocumentProcessor.processDocument(selectedImage);
			setHybridResult(result);
		} catch (error) {
			console.error("Processing error:", error);
			Alert.alert("Error", `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setIsProcessing(false);
		}
	};

	const saveDocument = async () => {
		if (!hybridResult || !selectedImage) {
			Alert.alert("Error", "No results to save");
			return;
		}

		try {
			// Process the image to get a proper DocumentResult
			const result = await documentProcessor.processImage(selectedImage, {
				preprocessImage: false, // Already processed by hybrid processor
				extractStructuredData: false, // Already have structured data
			});
			
			// Extract metadata from hybrid result
			const structuredData = hybridResult.structuredData;
			const metadata: any = {
				confidence: hybridResult.contextualResult.confidence,
				hybridResult: hybridResult,
			};
			
			// Extract vendor
			if ('vendor' in structuredData) {
				if (typeof structuredData.vendor === 'string') {
					metadata.vendor = structuredData.vendor;
				} else if (structuredData.vendor && typeof structuredData.vendor === 'object' && 'name' in structuredData.vendor) {
					metadata.vendor = structuredData.vendor.name;
				}
			}
			
			// Extract amounts
			if ('totals' in structuredData && structuredData.totals && typeof structuredData.totals === 'object') {
				const totals = structuredData.totals as any;
				metadata.amounts = [{
					value: totals.total,
					currency: totals.currency || 'USD',
					isTotal: true
				}];
			}
			
			// Extract dates
			if ('date' in structuredData && structuredData.date) {
				metadata.dates = [{
					date: new Date(structuredData.date),
					type: 'transaction' as const
				}];
			}
			
			// Extract items
			if ('items' in structuredData && structuredData.items) {
				metadata.items = structuredData.items;
			}
			
			// Extract location
			if ('location' in structuredData && structuredData.location) {
				metadata.location = structuredData.location;
			}

			// Update the result with hybrid processing data
			result.ocrText = hybridResult.ocrResult.text;
			result.documentType = hybridResult.contextualResult.documentType;
			result.confidence = hybridResult.contextualResult.confidence;
			result.metadata = metadata;

			const doc = await documentStorage.saveDocument(result);

			Alert.alert(
				"Success",
				"Document saved successfully",
				[
					{
						text: "View",
						onPress: () => navigation.navigate("Document", { id: doc.id }),
					},
					{ text: "OK" },
				],
			);
		} catch (error) {
			console.error("Save error:", error);
			Alert.alert("Error", "Failed to save document");
		}
	};

	const renderQualityMetrics = (metrics: QualityMetrics) => {
		return (
			<View style={styles.qualityContainer}>
				<Text style={styles.sectionTitle}>Quality Assessment</Text>
				<View style={styles.metricsGrid}>
					<View style={styles.metricItem}>
						<Text style={styles.metricLabel}>OCR Quality</Text>
						<Text style={styles.metricValue}>
							{(metrics.overall.ocrQuality * 100).toFixed(1)}%
						</Text>
					</View>
					<View style={styles.metricItem}>
						<Text style={styles.metricLabel}>Completeness</Text>
						<Text style={styles.metricValue}>
							{(metrics.overall.completeness * 100).toFixed(1)}%
						</Text>
					</View>
					<View style={styles.metricItem}>
						<Text style={styles.metricLabel}>Consistency</Text>
						<Text style={styles.metricValue}>
							{(metrics.overall.consistency * 100).toFixed(1)}%
						</Text>
					</View>
					<View style={styles.metricItem}>
						<Text style={styles.metricLabel}>Total Score</Text>
						<Text style={[styles.metricValue, styles.totalScore]}>
							{(metrics.overall.totalScore * 100).toFixed(1)}%
						</Text>
					</View>
				</View>
				{metrics.overall.warnings.length > 0 && (
					<View style={styles.warningsContainer}>
						<Text style={styles.warningsTitle}>Warnings:</Text>
						{metrics.overall.warnings.map((warning, index) => (
							<Text key={index} style={styles.warningText}>• {warning}</Text>
						))}
					</View>
				)}
			</View>
		);
	};

	const renderHybridResult = () => {
		if (!hybridResult) return null;

		return (
			<ScrollView style={styles.resultsContainer}>
				<View style={styles.resultCard}>
					<View style={styles.resultHeader}>
						<Text style={styles.resultTitle}>Hybrid Processing Result</Text>
						<TouchableOpacity
							style={styles.saveButton}
							onPress={saveDocument}
						>
							<Icon name="save-outline" size={20} color="#FFFFFF" />
							<Text style={styles.saveButtonText}>Save</Text>
						</TouchableOpacity>
					</View>

					{/* Document Type */}
					<View style={styles.documentTypeContainer}>
						<Text style={styles.sectionTitle}>Document Type</Text>
						<View style={styles.documentTypeBadge}>
							<Text style={styles.documentTypeText}>
								{hybridResult.contextualResult.documentType}
							</Text>
							<Text style={styles.confidenceText}>
								({(hybridResult.contextualResult.confidence * 100).toFixed(1)}%)
							</Text>
						</View>
					</View>

					{/* OCR Text */}
					<View style={styles.textContainer}>
						<Text style={styles.sectionTitle}>Extracted Text</Text>
						<Text style={styles.ocrText} numberOfLines={10}>
							{hybridResult.ocrResult.text}
						</Text>
					</View>

					{/* Language */}
					<View style={styles.languageRow}>
						<Text style={styles.languageLabel}>Language:</Text>
						<View style={styles.languageBadge}>
							<Text style={styles.languageText}>{(hybridResult.ocrResult.language?.[0] || 'en').toUpperCase()}</Text>
						</View>
					</View>

					{/* Quality Metrics */}
					{renderQualityMetrics(hybridResult.qualityMetrics)}

					{/* Structured Data */}
					{hybridResult.structuredData && (
						<View style={styles.structuredDataContainer}>
							<Text style={styles.sectionTitle}>Extracted Information</Text>
							{(() => {
								const data = hybridResult.structuredData;
								const rows = [];
								
								if ('vendor' in data && data.vendor) {
									const vendorName = typeof data.vendor === 'string' 
										? data.vendor 
										: (data.vendor as any).name || 'Unknown';
									rows.push(
										<View key="vendor" style={styles.dataRow}>
											<Text style={styles.dataLabel}>Vendor:</Text>
											<Text style={styles.dataValue}>{vendorName}</Text>
										</View>
									);
								}
								
								// Handle total amount - could be direct or in totals object
								if ('totalAmount' in data && data.totalAmount !== undefined && 'currency' in data) {
									rows.push(
										<View key="total" style={styles.dataRow}>
											<Text style={styles.dataLabel}>Total:</Text>
											<Text style={styles.dataValue}>
												{data.currency} {data.totalAmount.toFixed(2)}
											</Text>
										</View>
									);
								} else if ('totals' in data && data.totals && typeof data.totals === 'object' && 'total' in data.totals) {
									const totals = data.totals as any;
									rows.push(
										<View key="total" style={styles.dataRow}>
											<Text style={styles.dataLabel}>Total:</Text>
											<Text style={styles.dataValue}>
												{totals.currency || 'USD'} {totals.total.toFixed(2)}
											</Text>
										</View>
									);
								}
								
								if ('date' in data && data.date) {
									rows.push(
										<View key="date" style={styles.dataRow}>
											<Text style={styles.dataLabel}>Date:</Text>
											<Text style={styles.dataValue}>
												{new Date(data.date).toLocaleDateString()}
											</Text>
										</View>
									);
								}
								
								if ('items' in data && data.items && data.items.length > 0) {
									rows.push(
										<View key="items" style={styles.dataRow}>
											<Text style={styles.dataLabel}>Items:</Text>
											<Text style={styles.dataValue}>{data.items.length} item(s)</Text>
										</View>
									);
								}
								
								return rows;
							})()}
						</View>
					)}

					{/* Processing Stats */}
					<View style={styles.statsContainer}>
						<Text style={styles.statsTitle}>Processing Stats</Text>
						<Text style={styles.statsText}>
							Total Time: {hybridResult.processingStats.totalTime}ms
						</Text>
						<Text style={styles.statsText}>
							Engines Used: {hybridResult.processingStats.ocrEngines.join(', ')}
						</Text>
					</View>
				</View>
			</ScrollView>
		);
	};

	if (isInitializing) {
		return (
			<View style={styles.centerContainer}>
				<ActivityIndicator size="large" color="#0066FF" />
				<Text style={styles.initializingText}>Initializing processor...</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<ScrollView contentContainerStyle={styles.scrollContent}>
				{!selectedImage ? (
					<TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
						<Icon name="cloud-upload-outline" size={48} color="#0066FF" />
						<Text style={styles.uploadText}>Select Image</Text>
					</TouchableOpacity>
				) : (
					<View style={styles.imageContainer}>
						<RNImage source={{ uri: selectedImage }} style={styles.image} />
						<View style={styles.imageActions}>
							<TouchableOpacity style={styles.actionButton} onPress={pickImage}>
								<Icon name="images-outline" size={20} color="#FFFFFF" />
								<Text style={styles.actionButtonText}>Change</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.actionButton, styles.processButton]}
								onPress={processImage}
								disabled={isProcessing}
							>
								{isProcessing ? (
									<ActivityIndicator size="small" color="#FFFFFF" />
								) : (
									<>
										<Icon name="scan-outline" size={20} color="#FFFFFF" />
										<Text style={styles.actionButtonText}>Process</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>
				)}

				{isProcessing && (
					<View style={styles.processingContainer}>
						<ActivityIndicator size="large" color="#0066FF" />
						<Text style={styles.processingText}>Processing image...</Text>
					</View>
				)}

				{hybridResult && renderHybridResult()}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#F5F5F5",
	},
	scrollContent: {
		flexGrow: 1,
		padding: 16,
	},
	centerContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#F5F5F5",
	},
	initializingText: {
		marginTop: 16,
		fontSize: 16,
		color: "#666666",
	},
	uploadButton: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		padding: 48,
		alignItems: "center",
		marginVertical: 24,
		borderWidth: 2,
		borderColor: "#0066FF",
		borderStyle: "dashed",
	},
	uploadText: {
		marginTop: 16,
		fontSize: 18,
		color: "#0066FF",
		fontWeight: "600",
	},
	imageContainer: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	image: {
		width: "100%",
		height: 300,
		borderRadius: 8,
		marginBottom: 16,
	},
	imageActions: {
		flexDirection: "row",
		justifyContent: "space-around",
		gap: 12,
	},
	actionButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#666666",
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		gap: 8,
	},
	processButton: {
		backgroundColor: "#0066FF",
	},
	actionButtonText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "600",
	},
	processingContainer: {
		alignItems: "center",
		padding: 32,
	},
	processingText: {
		marginTop: 16,
		fontSize: 16,
		color: "#666666",
	},
	resultsContainer: {
		flex: 1,
	},
	resultCard: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	resultHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	resultTitle: {
		fontSize: 20,
		fontWeight: "bold",
		color: "#000000",
	},
	saveButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#34C759",
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 8,
		gap: 4,
	},
	saveButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
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
	confidenceText: {
		fontSize: 14,
		color: "#666666",
		marginLeft: 8,
	},
	textContainer: {
		marginBottom: 16,
	},
	ocrText: {
		fontSize: 14,
		color: "#333333",
		lineHeight: 20,
	},
	languageRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	languageLabel: {
		fontSize: 14,
		color: "#666666",
		marginRight: 8,
	},
	languageBadge: {
		backgroundColor: "#E3F2FD",
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 4,
	},
	languageText: {
		fontSize: 12,
		fontWeight: "600",
		color: "#0066FF",
	},
	qualityContainer: {
		marginBottom: 16,
	},
	metricsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: 8,
	},
	metricItem: {
		width: "50%",
		paddingVertical: 8,
	},
	metricLabel: {
		fontSize: 12,
		color: "#666666",
		marginBottom: 4,
	},
	metricValue: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000000",
	},
	totalScore: {
		color: "#0066FF",
	},
	warningsContainer: {
		marginTop: 8,
		padding: 12,
		backgroundColor: "#FFF3CD",
		borderRadius: 8,
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