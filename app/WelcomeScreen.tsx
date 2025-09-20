// app/WelcomeScreen.tsx
// One-time welcome screen for new users

import React, { useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
	Dimensions,
	Platform,
	Alert,
	Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { MMKV } from "react-native-mmkv";
import { useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";
import {
	requestMultiple,
	PERMISSIONS,
	RESULTS,
} from "react-native-permissions";

const storage = new MMKV();
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const WelcomeScreen: React.FC = () => {
	const navigation = useNavigation();
	const [currentStep, setCurrentStep] = useState(0);
	const [isLoading, setIsLoading] = useState(false);

	const steps = [
		{
			title: "Welcome to Visara",
			subtitle: "Transform your photos into searchable documents",
			description:
				"Visara automatically detects documents in your gallery and extracts text using advanced AI.",
			icon: "document-text",
			color: "#0066FF",
		},
		{
			title: "Real-Time Detection",
			subtitle: "Instant processing, no waiting",
			description:
				"New photos are detected instantly. Documents are automatically processed in real-time.",
			icon: "camera",
			color: "#00C853",
		},
		{
			title: "Smart Search",
			subtitle: "Find any document in seconds",
			description:
				"Search through all your documents by text content, dates, amounts, or keywords.",
			icon: "search",
			color: "#FF6B35",
		},
		{
			title: "Permission Required",
			subtitle: "Access to your photo gallery",
			description:
				"Visara needs access to your photos to detect and process documents. Your photos stay on your device.",
			icon: "shield-checkmark",
			color: "#7C4DFF",
		},
	];

	const handleNext = () => {
		if (currentStep < steps.length - 1) {
			setCurrentStep(currentStep + 1);
		} else {
			handleGetStarted();
		}
	};

	const handleGetStarted = async () => {
		setIsLoading(true);

		try {
			// Request permissions
			const granted = await requestPermissions();

			if (!granted) {
				Alert.alert(
					"Permission Required",
					"Visara needs access to your photo gallery to function. Please grant permission in Settings.",
					[
						{ text: "Cancel", style: "cancel" },
						{
							text: "Open Settings",
							onPress: () => {
								// Open app settings
								if (Platform.OS === "ios") {
									Linking.openURL("app-settings:");
								} else {
									Linking.openSettings();
								}
							},
						},
					],
				);
				setIsLoading(false);
				return;
			}

			// Mark welcome as completed using MMKV
			storage.set("welcome_completed", true);

			// Navigate to home screen
			navigation.reset({
				index: 0,
				routes: [{ name: "Home" } as never],
			});
		} catch (error) {
			console.error("[WelcomeScreen] Error:", error);
			Alert.alert("Error", "Something went wrong. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const requestPermissions = async (): Promise<boolean> => {
		try {
			if (Platform.OS === "ios") {
				const result = await requestMultiple([PERMISSIONS.IOS.PHOTO_LIBRARY]);

				return result[PERMISSIONS.IOS.PHOTO_LIBRARY] === RESULTS.GRANTED;
			} else {
				// Android permissions based on API level
				const androidVersion =
					typeof Platform.Version === "number"
						? Platform.Version
						: parseInt(Platform.Version.toString(), 10);

				if (androidVersion >= 33) {
					// Android 13+
					const result = await requestMultiple([
						PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
					]);

					return (
						result[PERMISSIONS.ANDROID.READ_MEDIA_IMAGES] === RESULTS.GRANTED
					);
				} else {
					// Android 12 and below
					const result = await requestMultiple([
						PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
					]);

					return (
						result[PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE] ===
						RESULTS.GRANTED
					);
				}
			}
		} catch (error) {
			console.error("[WelcomeScreen] Permission error:", error);
			return false;
		}
	};

	const currentStepData = steps[currentStep];
	const isLastStep = currentStep === steps.length - 1;

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				{/* Skip Button */}
				{!isLastStep && (
					<TouchableOpacity
						style={styles.skipButton}
						onPress={handleGetStarted}
					>
						<Text style={styles.skipText}>Skip</Text>
					</TouchableOpacity>
				)}

				{/* Icon */}
				<View
					style={[
						styles.iconContainer,
						{ backgroundColor: currentStepData.color + "20" },
					]}
				>
					<Icon
						name={currentStepData.icon}
						size={80}
						color={currentStepData.color}
					/>
				</View>

				{/* Content */}
				<View style={styles.content}>
					<Text style={styles.title}>{currentStepData.title}</Text>
					<Text style={[styles.subtitle, { color: currentStepData.color }]}>
						{currentStepData.subtitle}
					</Text>
					<Text style={styles.description}>{currentStepData.description}</Text>
				</View>

				{/* Progress Indicators */}
				<View style={styles.indicators}>
					{steps.map((_, index) => (
						<View
							key={index}
							style={[
								styles.indicator,
								index === currentStep && [
									styles.activeIndicator,
									{ backgroundColor: currentStepData.color },
								],
							]}
						/>
					))}
				</View>

				{/* Action Button */}
				<TouchableOpacity
					style={[styles.button, { backgroundColor: currentStepData.color }]}
					onPress={handleNext}
					disabled={isLoading}
				>
					<Text style={styles.buttonText}>
						{isLoading ? "Setting up..." : isLastStep ? "Let's Start" : "Next"}
					</Text>
					{!isLoading && (
						<Icon
							name="arrow-forward"
							size={20}
							color="#FFFFFF"
							style={styles.buttonIcon}
						/>
					)}
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#FFFFFF",
	},
	scrollContent: {
		flexGrow: 1,
		paddingHorizontal: 24,
		paddingBottom: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	skipButton: {
		position: "absolute",
		top: 20,
		right: 24,
		padding: 8,
	},
	skipText: {
		fontSize: 16,
		color: "#666666",
	},
	iconContainer: {
		width: 160,
		height: 160,
		borderRadius: 80,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 40,
	},
	content: {
		alignItems: "center",
		marginBottom: 40,
	},
	title: {
		fontSize: 28,
		fontWeight: "bold",
		color: "#000000",
		marginBottom: 12,
		textAlign: "center",
	},
	subtitle: {
		fontSize: 18,
		fontWeight: "600",
		marginBottom: 16,
		textAlign: "center",
	},
	description: {
		fontSize: 16,
		color: "#666666",
		textAlign: "center",
		lineHeight: 24,
		paddingHorizontal: 20,
	},
	indicators: {
		flexDirection: "row",
		marginBottom: 40,
	},
	indicator: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#E0E0E0",
		marginHorizontal: 4,
	},
	activeIndicator: {
		width: 24,
		height: 8,
	},
	button: {
		flexDirection: "row",
		paddingHorizontal: 32,
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		minWidth: 200,
	},
	buttonText: {
		fontSize: 18,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	buttonIcon: {
		marginLeft: 8,
	},
});

export default WelcomeScreen;
