import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { useSettings } from "@contexts/SettingsContext";
import { OnboardingNavigator } from "./OnboardingNavigator";
import { MainNavigator } from "./MainNavigator";
import { stackNavigationOptions } from "./navigationConfig";

export type RootStackParamList = {
	Onboarding: undefined;
	Main: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function RootNavigator() {
	const { state } = useSettings();

	// Check if onboarding is completed
	const isOnboardingCompleted = state.preferences.onboardingCompleted;

	return (
		<NavigationContainer>
			<Stack.Navigator
				screenOptions={{
					...stackNavigationOptions,
					gestureEnabled: false, // Disable gesture for root navigation
				}}
			>
				{!isOnboardingCompleted ? (
					<Stack.Screen name="Onboarding" component={OnboardingNavigator} />
				) : (
					<Stack.Screen name="Main" component={MainNavigator} />
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
}
