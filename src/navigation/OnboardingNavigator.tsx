import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { OnboardingScreen1 } from "@screens/Onboarding/OnboardingScreen1";
import { OnboardingScreen2 } from "@screens/Onboarding/OnboardingScreen2";
import { OnboardingScreen3 } from "@screens/Onboarding/OnboardingScreen3";
import { OnboardingScreen4 } from "@screens/Onboarding/OnboardingScreen4";
import { View, StyleSheet } from "react-native";
import { Button } from "@components/atoms/Button";
import { useSettings } from "@contexts/SettingsContext";
import { useTheme } from "@theme/useTheme";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useNavigation } from "@react-navigation/native";
import { stackNavigationOptions, getPlatformTransition } from "./navigationConfig";

export type OnboardingStackParamList = {
	OnboardingScreen1: undefined;
	OnboardingScreen2: undefined;
	OnboardingScreen3: undefined;
	OnboardingScreen4: undefined;
};

const Stack = createStackNavigator<OnboardingStackParamList>();

type OnboardingScreenProps = {
	children: React.ReactNode;
	isLastScreen?: boolean;
};

function OnboardingScreenWrapper({ children, isLastScreen = false }: OnboardingScreenProps) {
	const { colors } = useTheme();
	const { dispatch } = useSettings();
	const navigation = useNavigation<StackNavigationProp<OnboardingStackParamList>>();

	const handleNext = () => {
		if (isLastScreen) {
			// Complete onboarding and navigate to main
			dispatch({ type: "SET_ONBOARDING_COMPLETED", payload: true });
		} else {
			// Navigate to next screen
			const currentRoute = navigation.getState().routes[navigation.getState().index];
			const currentScreenNumber = parseInt(currentRoute.name.slice(-1));
			const nextScreen = `OnboardingScreen${currentScreenNumber + 1}` as keyof OnboardingStackParamList;
			navigation.navigate(nextScreen);
		}
	};

	const handleSkip = () => {
		// Complete onboarding and skip to main
		dispatch({ type: "SET_ONBOARDING_COMPLETED", payload: true });
	};

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<View style={styles.content}>
				{children}
			</View>
			<View style={styles.footer}>
				{!isLastScreen && (
					<Button
						variant="ghost"
						onPress={handleSkip}
						style={styles.skipButton}
					>
						Skip
					</Button>
				)}
				<Button
					variant="primary"
					onPress={handleNext}
					style={styles.nextButton}
				>
					{isLastScreen ? "Get Started" : "Next"}
				</Button>
			</View>
		</View>
	);
}

export function OnboardingNavigator() {
	const platformTransition = getPlatformTransition();

	return (
		<Stack.Navigator
			screenOptions={{
				...stackNavigationOptions,
				cardStyle: { backgroundColor: "transparent" },
				...platformTransition,
			}}
		>
			<Stack.Screen name="OnboardingScreen1">
				{() => (
					<OnboardingScreenWrapper>
						<OnboardingScreen1 />
					</OnboardingScreenWrapper>
				)}
			</Stack.Screen>
			<Stack.Screen name="OnboardingScreen2">
				{() => (
					<OnboardingScreenWrapper>
						<OnboardingScreen2 />
					</OnboardingScreenWrapper>
				)}
			</Stack.Screen>
			<Stack.Screen name="OnboardingScreen3">
				{() => (
					<OnboardingScreenWrapper>
						<OnboardingScreen3 />
					</OnboardingScreenWrapper>
				)}
			</Stack.Screen>
			<Stack.Screen name="OnboardingScreen4">
				{() => (
					<OnboardingScreenWrapper isLastScreen>
						<OnboardingScreen4 />
					</OnboardingScreenWrapper>
				)}
			</Stack.Screen>
		</Stack.Navigator>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flex: 1,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 24,
		paddingBottom: 40,
		gap: 16,
	},
	skipButton: {
		flex: 1,
	},
	nextButton: {
		flex: 2,
	},
});
