import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/MaterialIcons";

// Load icon font
Icon.loadFont();

import DocumentsScreen from "./app/(tabs)/documents";
// Import your screens
import ChatScreen from "./app/(tabs)/index";
import OCRTestScreen from "./app/(tabs)/ocrtest";
import SettingsScreen from "./app/(tabs)/settings";
import DocumentScreen from "./app/document/[id]";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const queryClient = new QueryClient();

function TabNavigator() {
	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				tabBarIcon: ({ focused, color, size }) => {
					let iconName: string = "home";

					if (route.name === "Chat") {
						iconName = "chat";
					} else if (route.name === "Documents") {
						iconName = "folder";
					} else if (route.name === "Settings") {
						iconName = "settings";
					} else if (route.name === "Test") {
						iconName = "science";
					} else if (route.name === "OCRTest") {
						iconName = "compare";
					}

					return <Icon name={iconName} size={size} color={color} />;
				},
				tabBarActiveTintColor: "#0066FF",
				tabBarInactiveTintColor: "gray",
				headerShown: false,
			})}
		>
			<Tab.Screen name="Chat" component={ChatScreen} />
			<Tab.Screen name="Documents" component={DocumentsScreen} />
			<Tab.Screen name="Settings" component={SettingsScreen} />
			<Tab.Screen name="OCRTest" component={OCRTestScreen} />
		</Tab.Navigator>
	);
}

export default function App() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<QueryClientProvider client={queryClient}>
				<NavigationContainer>
					<Stack.Navigator screenOptions={{ headerShown: false }}>
						<Stack.Screen name="Main" component={TabNavigator} />
						<Stack.Screen
							name="Document"
							component={DocumentScreen}
							options={{ headerShown: true, title: "Document" }}
						/>
					</Stack.Navigator>
				</NavigationContainer>
			</QueryClientProvider>
		</GestureHandlerRootView>
	);
}
