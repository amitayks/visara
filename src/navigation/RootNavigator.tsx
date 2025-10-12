import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import { useSettings } from "@contexts/SettingsContext";
import { OnboardingNavigator } from "./OnboardingNavigator";
import { MainNavigator } from "./MainNavigator";
import { stackNavigationOptions, getPlatformTransition } from "./navigationConfig";

export type RootStackParamList = {
	Onboarding: undefined;
	Main: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function RootNavigator() {
	const { state } = useSettings();
	const platformTransition = getPlatformTransition();

	// Check if onboarding is completed
	const isOnboardingCompleted = state.preferences.onboardingCompleted;

	return (
		<NavigationContainer>
			<Stack.Navigator
				screenOptions={{
					...stackNavigationOptions,
					gestureEnabled: false, // Disable gesture for root navigation
					// Add smooth fade-in transition when moving from onboarding to main
					cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
					...platformTransition,
				}}
			>
				{!isOnboardingCompleted ? (
					<Stack.Screen name="Onboarding" component={OnboardingNavigator} />
				) : (
					<Stack.Screen
						name="Main"
						component={MainNavigator}
						options={{
							// Enhanced transition for entering main app
							cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
						}}
					/>
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
}
