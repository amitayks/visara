// app/screens/WelcomeScreen.tsx (if you have this file)
// Updated to use MMKV instead of AsyncStorage

import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Linking,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { MMKV } from "react-native-mmkv";
import {
	PERMISSIONS,
	RESULTS,
	check,
	requestMultiple,
} from "react-native-permissions";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { steps } from "../constants/welcomeScreen";
import { useTheme } from "../contexts/ThemeContext";
import { createStyles } from "./WelcomeScreen.style";

const storage = new MMKV();

export const WelcomeScreen: React.FC = () => {
	const navigation = useNavigation();
	const [currentStep, setCurrentStep] = useState(0);

	const [isLoading, setIsLoading] = useState(false);
	const { theme } = useTheme();
	const styles = createStyles(theme);

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
				setIsLoading(false);
				Alert.alert(
					"Permission Required",
					"Visara needs access to your photo gallery to function. Please grant permission in Settings.",
					[
						{
							text: "Cancel",
							style: "cancel",
							onPress: () => setIsLoading(false),
						},
						{
							text: "Open Settings",
							onPress: async () => {
								setIsLoading(false);
								if (Platform.OS === "ios") {
									Linking.openURL("app-settings:");
								} else {
									Linking.openSettings();
								}
							},
						},
					],
				);
				return;
			}

			// Mark welcome as completed using MMKV
			console.log("[WelcomeScreen] Setting welcome_completed to true");
			storage.set("welcome_completed", true);

			// Verify it was saved
			const saved = storage.getBoolean("welcome_completed");
			console.log("[WelcomeScreen] Verified welcome_completed:", saved);

			// Navigate to home screen
			console.log("[WelcomeScreen] Navigating to Home");
			navigation.reset({
				index: 0,
				routes: [{ name: "Home" as never }],
			});
		} catch (error) {
			console.error("[WelcomeScreen] Error:", error);
			setIsLoading(false);
			Alert.alert("Error", "Something went wrong. Please try again.");
		}
	};

	const requestPermissions = async (): Promise<boolean> => {
		try {
			if (Platform.OS === "ios") {
				const currentStatus = await check(PERMISSIONS.IOS.PHOTO_LIBRARY);

				if (currentStatus === RESULTS.GRANTED) {
					return true;
				}

				if (
					currentStatus === RESULTS.BLOCKED ||
					currentStatus === RESULTS.UNAVAILABLE
				) {
					return false;
				}

				const result = await requestMultiple([PERMISSIONS.IOS.PHOTO_LIBRARY]);
				return result[PERMISSIONS.IOS.PHOTO_LIBRARY] === RESULTS.GRANTED;
			} else {
				const androidVersion = Platform.Version;

				// need attantion here
				if (androidVersion >= "33") {
					const currentStatus = await check(
						PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
					);

					if (currentStatus === RESULTS.GRANTED) {
						return true;
					}

					if (
						currentStatus === RESULTS.BLOCKED ||
						currentStatus === RESULTS.UNAVAILABLE
					) {
						return false;
					}

					const result = await requestMultiple([
						PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
					]);
					return (
						result[PERMISSIONS.ANDROID.READ_MEDIA_IMAGES] === RESULTS.GRANTED
					);
				} else {
					const currentStatus = await check(
						PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
					);

					if (currentStatus === RESULTS.GRANTED) {
						return true;
					}

					if (
						currentStatus === RESULTS.BLOCKED ||
						currentStatus === RESULTS.UNAVAILABLE
					) {
						return false;
					}

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

	const handleSkip = () => {
		setCurrentStep(steps.length - 1);
	};

	const currentStepData = steps[currentStep];
	const isLastStep = currentStep === steps.length - 1;

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.wrappContent}>
				{!isLastStep && (
					<TouchableOpacity
						style={styles.skipButton}
						onPress={handleSkip}
						disabled={isLoading}
					>
						<Text style={styles.skipText}>Skip</Text>
					</TouchableOpacity>
				)}

				<View style={styles.content}>
					<View style={{ alignItems: "center" }}>
						<View style={styles.iconContainer}>
							<Icon
								name={currentStepData.icon}
								size={80}
								color={theme.accent}
							/>
						</View>
						<Text style={styles.title}>{currentStepData.title}</Text>
					</View>

					<View>
						<Text style={[styles.subtitle]}>{currentStepData.subtitle}</Text>
						<Text style={styles.description}>
							{currentStepData.description}
						</Text>
					</View>

					<View style={styles.indicatoresAndButton}>
						<View style={styles.indicators}>
							{steps.map((_, index) => (
								<View
									key={index}
									style={[
										styles.indicator,
										index === currentStep && [styles.activeIndicator],
									]}
								/>
							))}
						</View>

						<TouchableOpacity
							style={[styles.button, isLoading && styles.buttonDisabled]}
							onPress={handleNext}
							disabled={isLoading}
						>
							{isLoading && (
								<ActivityIndicator size="small" color={theme.text} />
							)}
							{!isLoading && (
								<>
									<Text style={styles.buttonText}>
										{currentStepData.buttonText}
									</Text>
									<Icon
										name="arrow-forward"
										size={20}
										color={theme.text}
										style={styles.buttonIcon}
									/>
								</>
							)}
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</SafeAreaView>
	);
};

// const styles = StyleSheet.create({
// 	container: {
// 		flex: 1,
// 		backgroundColor: "#FFFFFF",
// 	},
// 	scrollContent: {
// 		flexGrow: 1,
// 		paddingHorizontal: 24,
// 		paddingBottom: 40,
// 		alignItems: "center",
// 		justifyContent: "center",
// 	},
// 	skipButton: {
// 		position: "absolute",
// 		top: 20,
// 		right: 24,
// 		padding: 8,
// 		zIndex: 1,
// 	},
// 	skipText: {
// 		fontSize: 16,
// 		color: "#666666",
// 	},
// 	iconContainer: {
// 		width: 160,
// 		height: 160,
// 		borderRadius: 80,
// 		alignItems: "center",
// 		justifyContent: "center",
// 		marginBottom: 40,
// 	},
// 	content: {
// 		alignItems: "center",
// 		marginBottom: 40,
// 	},
// 	title: {
// 		fontSize: 28,
// 		fontWeight: "bold",
// 		color: "#000000",
// 		marginBottom: 12,
// 		textAlign: "center",
// 	},
// 	subtitle: {
// 		fontSize: 18,
// 		fontWeight: "600",
// 		marginBottom: 16,
// 		textAlign: "center",
// 	},
// 	description: {
// 		fontSize: 16,
// 		color: "#666666",
// 		textAlign: "center",
// 		lineHeight: 24,
// 		paddingHorizontal: 20,
// 	},
// 	indicators: {
// 		flexDirection: "row",
// 		marginBottom: 40,
// 	},
// 	indicator: {
// 		width: 8,
// 		height: 8,
// 		borderRadius: 4,
// 		backgroundColor: "#E0E0E0",
// 		marginHorizontal: 4,
// 	},
// 	activeIndicator: {
// 		width: 24,
// 		height: 8,
// 	},
// 	button: {
// 		flexDirection: "row",
// 		paddingHorizontal: 32,
// 		paddingVertical: 16,
// 		borderRadius: 12,
// 		alignItems: "center",
// 		justifyContent: "center",
// 		minWidth: 200,
// 	},
// 	buttonDisabled: {
// 		opacity: 0.7,
// 	},
// 	buttonText: {
// 		fontSize: 18,
// 		fontWeight: "600",
// 		color: "#FFFFFF",
// 	},
// 	buttonIcon: {
// 		marginLeft: 8,
// 	},
// });

// Also export as default for compatibility
export default WelcomeScreen;
