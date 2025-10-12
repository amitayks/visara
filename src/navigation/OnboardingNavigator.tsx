import React from "react";
import { OnboardingScreen } from "@screens/Onboarding/OnboardingScreen";

export type OnboardingStackParamList = {
	Onboarding: undefined;
};

/**
 * OnboardingNavigator - Displays the onboarding flow for first-time users
 *
 * Now uses a single screen with OnboardingTemplate that supports:
 * - Horizontal swipe between screens
 * - Swipe back to previous screens
 * - Skip button to jump to last screen
 * - Permission requests on completion
 * - Smooth animation to main app
 */
export function OnboardingNavigator() {
	return <OnboardingScreen />;
}
