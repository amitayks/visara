import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import React, { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	FlatList,
	Image as RNImage,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import {
	type ImagePickerResponse,
	launchCamera,
	launchImageLibrary,
} from "react-native-image-picker";
import Icon from "react-native-vector-icons/Ionicons";
import { hybridDocumentProcessor } from "../../services/ai/hybridDocumentProcessor";
import { HebrewPatterns } from "../../services/ai/hebrewPatterns";
import { ocrEngineManager } from "../../services/ai/OCREngineManager";
import type {
	HybridProcessingResult,
	QualityMetrics,
} from "../../services/ai/types/hybridTypes";
import type {
	OCRComparison,
	OCREngineName,
	OCRResult,
} from "../../services/ai/ocrTypes";
import { documentStorage } from "../../services/database/documentStorage";
import type { RootStackParamList } from "../../types/navigation";

const { width: screenWidth } = Dimensions.get("window");

interface EngineSelection {
	name: OCREngineName;
	displayName: string;
	selected: boolean;
}

export default function OCRTestScreen() {
	const navigation =
		useNavigation<StackNavigationProp<RootStackParamList, "Main">>();
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [results, setResults] = useState<OCRResult[]>([]);
	const [comparison, setComparison] = useState<OCRComparison | null>(null);
	const [hybridResult, setHybridResult] = useState<HybridProcessingResult | null>(null);
	const [selectedEngines, setSelectedEngines] = useState<EngineSelection[]>([]);
	const [isInitializing, setIsInitializing] = useState(true);

	useEffect(() => {
		initializeEngines();
	}, []);

	const initializeEngines = async () => {
		setIsInitializing(true);
		try {
			await ocrEngineManager.initialize();
			await hybridDocumentProcessor.initialize();

			const engines = ocrEngineManager.getAllEngines();
			setSelectedEngines(
				engines.map((engine) => ({
					name: engine.name,
					displayName: engine.displayName,
					selected: true,
				})),
			);
		} catch (error) {
			console.error("Failed to initialize processors:", error);
			Alert.alert("Error", "Failed to initialize processors");
		} finally {
			setIsInitializing(false);
		}
	};

	const toggleEngine = (engineName: OCREngineName) => {
		setSelectedEngines((prev) =>
			prev.map((engine) =>
				engine.name === engineName
					? { ...engine, selected: !engine.selected }
					: engine,
			),
		);
	};

	const pickImage = async (useCamera: boolean = false) => {
		try {
			const options = {
				mediaType: "photo" as const,
				quality: 1 as const,
			};

			const callback = (response: ImagePickerResponse) => {
				if (response.didCancel || response.errorCode) {
					return;
				}
				if (response.assets && response.assets[0]) {
					setSelectedImage(response.assets[0].uri || "");
					setResults([]);
					setComparison(null);
					setHybridResult(null);
				}
			};

			if (useCamera) {
				launchCamera(options, callback);
			} else {
				launchImageLibrary(options, callback);
			}
		} catch (error) {
			console.error("Error picking image:", error);
			Alert.alert("Error", "Failed to pick image");
		}
	};

	const processWithSelectedEngines = async () => {
		if (!selectedImage) return;

		const activeEngines = selectedEngines.filter((e) => e.selected);
		if (activeEngines.length === 0) {
			Alert.alert(
				"No Engines Selected",
				"Please select at least one OCR engine",
			);
			return;
		}

		setIsProcessing(true);
		setResults([]);

		try {
			const engineNames = activeEngines.map((e) => e.name);
			const newResults = await ocrEngineManager.processInSequence(
				selectedImage,
				engineNames,
			);
			setResults(newResults);
		} catch (error) {
			console.error("Processing error:", error);
			Alert.alert("Error", "Failed to process image");
		} finally {
			setIsProcessing(false);
		}
	};

	const processWithHybridSystem = async () => {
		if (!selectedImage) return;

		setIsProcessing(true);
		setHybridResult(null);

		try {
			const result = await hybridDocumentProcessor.processDocument(selectedImage);
			setHybridResult(result);
		} catch (error) {
			console.error("Hybrid processing error:", error);
			Alert.alert("Error", "Failed to process with hybrid system");
		} finally {
			setIsProcessing(false);
		}
	};

	const saveToDatabase = async () => {
		if (!selectedImage || (results.length === 0 && !hybridResult)) return;

		try {
			let documentResult: any;

			if (hybridResult) {
				// Use hybrid processing result
				documentResult = {
					imageUri: selectedImage,
					imageHash: hybridResult.metadata.imageHash,
					ocrText: hybridResult.ocrResult.text, // Use ocrText field name
					confidence: hybridResult.qualityMetrics.confidence,
					documentType: hybridResult.contextualResult.documentType,
					// Extract structured data fields for direct access
					vendor: hybridResult.structuredData.metadata?.vendor || 
					        (hybridResult.structuredData as any).vendor?.name ||
					        'Unknown',
					totalAmount: hybridResult.structuredData.metadata?.total || 
					            (hybridResult.structuredData as any).totals?.total,
					currency: hybridResult.structuredData.metadata?.currency ||
					         (hybridResult.structuredData as any).totals?.currency ||
					         'USD',
					metadata: {
						...hybridResult.metadata,
						processingLayers: {
							ocr: hybridResult.ocrResult,
							context: hybridResult.contextualResult,
							structured: hybridResult.structuredData,
							quality: hybridResult.qualityMetrics
						},
						// Additional hybrid processing metadata
						detectedLanguages: hybridResult.ocrResult.detectedLanguages,
						entityCount: hybridResult.contextualResult.context.entities.length,
						relationshipCount: hybridResult.contextualResult.context.relationships.length,
						qualityWarnings: hybridResult.qualityMetrics.warnings
					},
					createdAt: new Date(),
					updatedAt: new Date()
				};
			} else {
				// Fallback to regular OCR results
				const bestResult = results.reduce((best, current) =>
					current.confidence > best.confidence ? current : best,
				);

				documentResult = {
					imageUri: selectedImage,
					ocrText: bestResult.text, // Use ocrText field name
					confidence: bestResult.confidence,
					metadata: {
						ocrEngine: bestResult.engineName,
						processingTime: bestResult.processingTime,
						languages: bestResult.languages
					},
					createdAt: new Date(),
					updatedAt: new Date()
				};
			}

			// Check if document already exists (if we have a hash)
			if (documentResult.imageHash) {
				const existingDoc = await documentStorage.checkDuplicateByHash(
					documentResult.imageHash,
				);
				if (existingDoc) {
					Alert.alert(
						"Duplicate Document",
						"This document has already been processed. Would you like to view it?",
						[
							{ text: "Cancel", style: "cancel" },
							{
								text: "View",
								onPress: () =>
									navigation.navigate("Document", { id: existingDoc.id }),
							},
						],
					);
					return;
				}
			}

			// Save to database
			const savedDoc = await documentStorage.saveDocument(documentResult);

			// Navigate to document detail view
			navigation.navigate("Document", { id: savedDoc.id });
		} catch (error) {
			console.error("Error saving document:", error);
			Alert.alert("Error", "Failed to save document");
		}
	};

	const compareAllEngines = async () => {
		if (!selectedImage) return;

		setIsProcessing(true);
		setResults([]);
		setComparison(null);

		try {
			const comparisonResult =
				await ocrEngineManager.compareAllEngines(selectedImage);
			setComparison(comparisonResult);
			setResults(comparisonResult.results);
		} catch (error) {
			console.error("Comparison error:", error);
			Alert.alert("Error", "Failed to compare engines");
		} finally {
			setIsProcessing(false);
		}
	};

	const renderHybridResult = (result: HybridProcessingResult) => {
		const textDirection = HebrewPatterns.getTextDirection(result.ocrResult.text);

		return (
			<View style={[styles.resultCard, styles.hybridResultCard]} key="hybrid">
				<View style={styles.resultHeader}>
					<Text style={styles.engineName}>HYBRID PROCESSOR</Text>
					<View style={styles.statsRow}>
						<Text style={styles.statText}>
							{(result.qualityMetrics.confidence * 100).toFixed(1)}%
						</Text>
						<Text style={styles.statText}>{result.metadata.processingTime}ms</Text>
					</View>
				</View>

				<View style={styles.documentTypeRow}>
					<Text style={styles.documentTypeLabel}>Document Type:</Text>
					<View style={styles.documentTypeBadge}>
						<Text style={styles.documentTypeText}>
							{result.contextualResult.documentType.replace('_', ' ')}
						</Text>
					</View>
				</View>

				<View style={styles.languageRow}>
					<Text style={styles.languageLabel}>Languages:</Text>
					{result.ocrResult.detectedLanguages.map((lang) => (
						<View key={lang} style={styles.languageBadge}>
							<Text style={styles.languageText}>{lang.toUpperCase()}</Text>
						</View>
					))}
				</View>

				<View style={styles.qualityMetrics}>
					<Text style={styles.sectionLabel}>Quality Metrics:</Text>
					<View style={styles.metricsGrid}>
						<View style={styles.metricItem}>
							<Text style={styles.metricLabel}>OCR Quality</Text>
							<Text style={styles.metricValue}>
								{(result.qualityMetrics.ocrQuality * 100).toFixed(1)}%
							</Text>
						</View>
						<View style={styles.metricItem}>
							<Text style={styles.metricLabel}>Completeness</Text>
							<Text style={styles.metricValue}>
								{(result.qualityMetrics.completeness * 100).toFixed(1)}%
							</Text>
						</View>
						<View style={styles.metricItem}>
							<Text style={styles.metricLabel}>Consistency</Text>
							<Text style={styles.metricValue}>
								{(result.qualityMetrics.consistency * 100).toFixed(1)}%
							</Text>
						</View>
					</View>
				</View>

				<View style={styles.textContainer}>
					<Text style={styles.sectionLabel}>Extracted Text:</Text>
					<ScrollView style={styles.textScroll}>
						<Text
							style={[
								styles.ocrText,
								textDirection === "rtl" && styles.rtlText,
							]}
						>
							{result.ocrResult.text || "No text detected"}
						</Text>
					</ScrollView>
				</View>

				{result.qualityMetrics.warnings.length > 0 && (
					<View style={styles.warningsSection}>
						<Text style={styles.sectionLabel}>Quality Warnings:</Text>
						{result.qualityMetrics.warnings.map((warning, idx) => (
							<Text key={idx} style={styles.warningText}>
								⚠ {warning}
							</Text>
						))}
					</View>
				)}

				{result.contextualResult.context.entities.length > 0 && (
					<View style={styles.entitiesSection}>
						<Text style={styles.sectionLabel}>Detected Entities:</Text>
						<View style={styles.entitiesGrid}>
							{result.contextualResult.context.entities.slice(0, 6).map((entity, idx) => (
								<View key={idx} style={styles.entityBadge}>
									<Text style={styles.entityText}>
										{entity.type}: {entity.value.substring(0, 20)}
										{entity.value.length > 20 ? '...' : ''}
									</Text>
								</View>
							))}
						</View>
					</View>
				)}
			</View>
		);
	};

	const renderEngineResult = (result: OCRResult) => {
		const hebrewMetadata = HebrewPatterns.extractHebrewMetadata(result.text);
		const textDirection = HebrewPatterns.getTextDirection(result.text);

		return (
			<View style={styles.resultCard} key={result.engineName}>
				<View style={styles.resultHeader}>
					<Text style={styles.engineName}>
						{result.engineName.toUpperCase()}
					</Text>
					<View style={styles.statsRow}>
						<Text style={styles.statText}>
							{(result.confidence * 100).toFixed(1)}%
						</Text>
						<Text style={styles.statText}>{result.processingTime}ms</Text>
						{result.memoryUsage && (
							<Text style={styles.statText}>
								{(result.memoryUsage / 1024 / 1024).toFixed(1)}MB
							</Text>
						)}
					</View>
				</View>

				<View style={styles.languageRow}>
					<Text style={styles.languageLabel}>Languages:</Text>
					{result.languages.map((lang) => (
						<View key={lang} style={styles.languageBadge}>
							<Text style={styles.languageText}>{lang.toUpperCase()}</Text>
						</View>
					))}
				</View>

				<View style={styles.textContainer}>
					<Text style={styles.sectionLabel}>Extracted Text:</Text>
					<ScrollView style={styles.textScroll}>
						<Text
							style={[
								styles.ocrText,
								textDirection === "rtl" && styles.rtlText,
							]}
						>
							{result.text || "No text detected"}
						</Text>
					</ScrollView>
				</View>

				{hebrewMetadata.currency && hebrewMetadata.currency.length > 0 && (
					<View style={styles.metadataSection}>
						<Text style={styles.sectionLabel}>Currency:</Text>
						{hebrewMetadata.currency.map((curr, idx) => (
							<Text key={idx} style={styles.metadataText}>
								{curr.symbol}
								{curr.amount}
							</Text>
						))}
					</View>
				)}

				{hebrewMetadata.phones && hebrewMetadata.phones.length > 0 && (
					<View style={styles.metadataSection}>
						<Text style={styles.sectionLabel}>Phone Numbers:</Text>
						{hebrewMetadata.phones.map((phone, idx) => (
							<Text key={idx} style={styles.metadataText}>
								{phone}
							</Text>
						))}
					</View>
				)}

				{hebrewMetadata.dates && hebrewMetadata.dates.length > 0 && (
					<View style={styles.metadataSection}>
						<Text style={styles.sectionLabel}>Dates:</Text>
						{hebrewMetadata.dates.map((date, idx) => (
							<Text key={idx} style={styles.metadataText}>
								{date.date.toLocaleDateString()} ({date.format})
							</Text>
						))}
					</View>
				)}
			</View>
		);
	};

	if (isInitializing) {
		return (
			<View style={styles.centerContainer}>
				<ActivityIndicator size="large" color="#0066FF" />
				<Text style={styles.loadingText}>Initializing OCR Engines...</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<Text style={styles.title}>OCR Engine Comparison</Text>

				<View style={styles.engineSelector}>
					<Text style={styles.sectionTitle}>Select Engines:</Text>
					<View style={styles.engineGrid}>
						{selectedEngines.map((engine) => (
							<TouchableOpacity
								key={engine.name}
								style={[
									styles.engineOption,
									engine.selected && styles.engineOptionSelected,
								]}
								onPress={() => toggleEngine(engine.name)}
							>
								<Icon
									name={engine.selected ? "checkbox" : "square-outline"}
									size={20}
									color={engine.selected ? "#0066FF" : "#666666"}
								/>
								<Text
									style={[
										styles.engineOptionText,
										engine.selected && styles.engineOptionTextSelected,
									]}
								>
									{engine.displayName}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>

				<View style={styles.buttonContainer}>
					<TouchableOpacity
						style={styles.button}
						onPress={() => pickImage(false)}
					>
						<Icon name="images-outline" size={24} color="#FFFFFF" />
						<Text style={styles.buttonText}>Gallery</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.button}
						onPress={() => pickImage(true)}
					>
						<Icon name="camera-outline" size={24} color="#FFFFFF" />
						<Text style={styles.buttonText}>Camera</Text>
					</TouchableOpacity>
				</View>

				{selectedImage && (
					<View style={styles.imageContainer}>
						<RNImage source={{ uri: selectedImage }} style={styles.image} />

						<View style={styles.actionButtons}>
							<TouchableOpacity
								style={[
									styles.actionButton,
									styles.hybridButton,
									isProcessing && styles.buttonDisabled,
								]}
								onPress={processWithHybridSystem}
								disabled={isProcessing}
							>
								{isProcessing ? (
									<ActivityIndicator color="#FFFFFF" size="small" />
								) : (
									<>
										<Icon name="analytics-outline" size={20} color="#FFFFFF" />
										<Text style={styles.actionButtonText}>
											Hybrid Process
										</Text>
									</>
								)}
							</TouchableOpacity>

							<TouchableOpacity
								style={[
									styles.actionButton,
									isProcessing && styles.buttonDisabled,
								]}
								onPress={processWithSelectedEngines}
								disabled={isProcessing}
							>
								{isProcessing ? (
									<ActivityIndicator color="#FFFFFF" size="small" />
								) : (
									<>
										<Icon name="play-outline" size={20} color="#FFFFFF" />
										<Text style={styles.actionButtonText}>
											OCR Only
										</Text>
									</>
								)}
							</TouchableOpacity>

							<TouchableOpacity
								style={[
									styles.actionButton,
									styles.compareButton,
									isProcessing && styles.buttonDisabled,
								]}
								onPress={compareAllEngines}
								disabled={isProcessing}
							>
								{isProcessing ? (
									<ActivityIndicator color="#FFFFFF" size="small" />
								) : (
									<>
										<Icon name="layers-outline" size={20} color="#FFFFFF" />
										<Text style={styles.actionButtonText}>Compare</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>
				)}

				{comparison && (
					<View style={styles.comparisonSummary}>
						<Text style={styles.sectionTitle}>Comparison Summary</Text>
						<Text style={styles.summaryText}>
							Best Engine:{" "}
							<Text style={styles.boldText}>{comparison.bestEngine}</Text>
						</Text>
						<Text style={styles.summaryText}>
							Total Processing Time:{" "}
							<Text style={styles.boldText}>
								{comparison.processingStats.totalTime}ms
							</Text>
						</Text>
					</View>
				)}

				{(results.length > 0 || hybridResult) && (
					<>
						<View style={styles.resultsContainer}>
							<Text style={styles.sectionTitle}>Results</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false}>
								<View style={styles.resultsRow}>
									{hybridResult && renderHybridResult(hybridResult)}
									{results.map((result) => renderEngineResult(result))}
								</View>
							</ScrollView>
						</View>

						<View style={styles.saveButtonContainer}>
							<TouchableOpacity
								style={styles.saveButton}
								onPress={saveToDatabase}
							>
								<Icon name="save-outline" size={20} color="#FFFFFF" />
								<Text style={styles.saveButtonText}>Save to Documents</Text>
							</TouchableOpacity>
						</View>
					</>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#FAFAFA",
	},
	centerContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#FAFAFA",
	},
	scrollContent: {
		paddingVertical: 20,
	},
	title: {
		fontSize: 24,
		fontWeight: "600",
		marginBottom: 20,
		textAlign: "center",
		paddingHorizontal: 20,
	},
	loadingText: {
		marginTop: 10,
		fontSize: 16,
		color: "#666666",
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		marginBottom: 10,
		color: "#000000",
	},
	engineSelector: {
		paddingHorizontal: 20,
		marginBottom: 20,
	},
	engineGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
	},
	engineOption: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#FFFFFF",
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#E5E5E7",
		gap: 6,
	},
	engineOptionSelected: {
		backgroundColor: "#E6F0FF",
		borderColor: "#0066FF",
	},
	engineOptionText: {
		fontSize: 14,
		color: "#666666",
	},
	engineOptionTextSelected: {
		color: "#0066FF",
		fontWeight: "500",
	},
	buttonContainer: {
		flexDirection: "row",
		paddingHorizontal: 20,
		marginBottom: 20,
		gap: 10,
	},
	button: {
		flex: 1,
		backgroundColor: "#0066FF",
		paddingVertical: 12,
		borderRadius: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	buttonText: {
		color: "#FFFFFF",
		fontWeight: "600",
	},
	imageContainer: {
		paddingHorizontal: 20,
		marginBottom: 20,
	},
	image: {
		width: "100%",
		height: 200,
		borderRadius: 8,
		marginBottom: 10,
	},
	actionButtons: {
		flexDirection: "row",
		gap: 8,
	},
	actionButton: {
		flex: 1,
		backgroundColor: "#34C759",
		paddingVertical: 10,
		borderRadius: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	hybridButton: {
		backgroundColor: "#5856D6",
	},
	compareButton: {
		backgroundColor: "#FF9500",
	},
	actionButtonText: {
		color: "#FFFFFF",
		fontWeight: "600",
		fontSize: 14,
	},
	buttonDisabled: {
		backgroundColor: "#CCCCCC",
	},
	comparisonSummary: {
		backgroundColor: "#FFFFFF",
		marginHorizontal: 20,
		padding: 16,
		borderRadius: 8,
		marginBottom: 20,
		borderWidth: 1,
		borderColor: "#E5E5E7",
	},
	summaryText: {
		fontSize: 14,
		color: "#333333",
		marginBottom: 4,
	},
	boldText: {
		fontWeight: "600",
		color: "#000000",
	},
	resultsContainer: {
		paddingLeft: 20,
		marginBottom: 20,
	},
	resultsRow: {
		flexDirection: "row",
		gap: 15,
		paddingRight: 20,
	},
	resultCard: {
		backgroundColor: "#FFFFFF",
		borderRadius: 8,
		padding: 16,
		width: screenWidth * 0.85,
		borderWidth: 1,
		borderColor: "#E5E5E7",
	},
	resultHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	engineName: {
		fontSize: 16,
		fontWeight: "600",
		color: "#0066FF",
	},
	statsRow: {
		flexDirection: "row",
		gap: 10,
	},
	statText: {
		fontSize: 12,
		color: "#666666",
		backgroundColor: "#F2F2F7",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 4,
	},
	languageRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
		gap: 8,
	},
	languageLabel: {
		fontSize: 14,
		color: "#666666",
	},
	languageBadge: {
		backgroundColor: "#E6F0FF",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 4,
	},
	languageText: {
		fontSize: 12,
		color: "#0066FF",
		fontWeight: "500",
	},
	textContainer: {
		marginBottom: 12,
	},
	sectionLabel: {
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 6,
		color: "#333333",
	},
	textScroll: {
		maxHeight: 150,
		backgroundColor: "#F2F2F7",
		borderRadius: 6,
		padding: 10,
	},
	ocrText: {
		fontSize: 13,
		color: "#333333",
		lineHeight: 20,
	},
	rtlText: {
		textAlign: "right",
		writingDirection: "rtl",
	},
	metadataSection: {
		marginTop: 8,
	},
	metadataText: {
		fontSize: 13,
		color: "#666666",
		marginLeft: 10,
		marginBottom: 2,
	},
	saveButtonContainer: {
		paddingHorizontal: 20,
		marginTop: 20,
		marginBottom: 30,
	},
	saveButton: {
		backgroundColor: "#007AFF",
		paddingVertical: 14,
		borderRadius: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	saveButtonText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "600",
	},
	hybridResultCard: {
		borderColor: "#5856D6",
		borderWidth: 2,
		backgroundColor: "#F8F8FF",
	},
	documentTypeRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
		gap: 8,
	},
	documentTypeLabel: {
		fontSize: 14,
		color: "#666666",
	},
	documentTypeBadge: {
		backgroundColor: "#5856D6",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 4,
	},
	documentTypeText: {
		fontSize: 12,
		color: "#FFFFFF",
		fontWeight: "500",
		textTransform: "capitalize",
	},
	qualityMetrics: {
		marginBottom: 12,
	},
	metricsGrid: {
		flexDirection: "row",
		gap: 8,
	},
	metricItem: {
		flex: 1,
		backgroundColor: "#FFFFFF",
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
	warningsSection: {
		marginTop: 8,
		backgroundColor: "#FFF3CD",
		padding: 8,
		borderRadius: 6,
		borderLeftWidth: 3,
		borderLeftColor: "#FFC107",
	},
	warningText: {
		fontSize: 12,
		color: "#856404",
		marginBottom: 2,
	},
	entitiesSection: {
		marginTop: 8,
	},
	entitiesGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 4,
	},
	entityBadge: {
		backgroundColor: "#E8F5E8",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		maxWidth: "45%",
	},
	entityText: {
		fontSize: 10,
		color: "#2E7D32",
	},
});
