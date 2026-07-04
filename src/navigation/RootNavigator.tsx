import { useSettings } from "@contexts/SettingsContext";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MainNavigator } from "./MainNavigator";
import { OnboardingNavigator } from "./OnboardingNavigator";

export type RootStackParamList = {
	Onboarding: undefined;
	Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Interim root on native-stack (JS stack removed). Replaced wholesale by the
 * static-API tree in src/app at cutover.
 */
export function RootNavigator() {
	const { state } = useSettings();

	const isOnboardingCompleted = state.preferences.onboardingCompleted;

	return (
		<NavigationContainer>
			<Stack.Navigator
				screenOptions={{
					headerShown: false,
					gestureEnabled: false,
					animation: "fade",
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
