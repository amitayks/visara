import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { GalleryScreen } from "@screens/Gallery/GalleryScreen";
import { AlbumsScreen } from "@screens/Albums/AlbumsScreen";
import { SearchScreen } from "@screens/Search/SearchScreen";
import { SettingsScreen } from "@screens/Settings/SettingsScreen";
import { Icon } from "@components/atoms/Icon";
import { useTheme } from "@theme/useTheme";
import { Platform } from "react-native";
import { tabNavigationOptions } from "./navigationConfig";

export type MainTabParamList = {
	Gallery: undefined;
	Search: undefined;
	Albums: undefined;
	Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainNavigator() {
	const { colors } = useTheme();

	return (
		<Tab.Navigator
			screenOptions={{
				...tabNavigationOptions,
				tabBarStyle: {
					...(typeof tabNavigationOptions.tabBarStyle === "object"
						? tabNavigationOptions.tabBarStyle
						: {}),
					backgroundColor: colors.surface,
					// borderTopColor: colors.border,
					borderTopWidth: 0,
					elevation: 8,
					shadowColor: "#000",
					shadowOffset: { width: 0, height: -2 },
					shadowOpacity: 0.1,
					shadowRadius: 4,
					paddingBottom: Platform.OS === "ios" ? 20 : 8,
					height: Platform.OS === "ios" ? 88 : 64,
					width: "95%",
				},
				tabBarActiveTintColor: colors.buttonPrimary,
				tabBarInactiveTintColor: colors.textSecondary,
				tabBarLabelStyle: {
					fontSize: 12,
					fontWeight: "600",
				},
			}}
		>
			<Tab.Screen
				name="Search"
				component={SearchScreen}
				options={{
					tabBarIcon: ({ color, size }) => (
						<Icon name="magnify" size={size} color={color} />
					),
				}}
			/>
			<Tab.Screen
				name="Gallery"
				component={GalleryScreen}
				options={{
					tabBarIcon: ({ color, size }) => (
						<Icon name="view-grid" size={size} color={color} />
					),
				}}
			/>
			<Tab.Screen
				name="Albums"
				component={AlbumsScreen}
				options={{
					tabBarIcon: ({ color, size }) => (
						<Icon name="folder-multiple-image" size={size} color={color} />
					),
				}}
			/>
			<Tab.Screen
				name="Settings"
				component={SettingsScreen}
				options={{
					tabBarIcon: ({ color, size }) => (
						<Icon name="cog" size={size} color={color} />
					),
				}}
			/>
		</Tab.Navigator>
	);
}
