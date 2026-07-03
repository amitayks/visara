import type { MediaFile } from "@models/MediaFile";
import { createStackNavigator } from "@react-navigation/stack";
import { Text, View } from "react-native";
import { modalNavigationOptions } from "./navigationConfig";

export type ModalStackParamList = {
	PhotoViewer: {
		media: MediaFile;
		allMedia: MediaFile[];
		initialIndex: number;
	};
};

const Stack = createStackNavigator<ModalStackParamList>();

// Placeholder component for PhotoViewer modal
function PhotoViewerPlaceholder() {
	return (
		<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
			<Text>Photo Viewer Modal</Text>
		</View>
	);
}

/**
 * ModalNavigator for future modal-based navigation
 * Currently, PhotoViewerModal is used directly in screens as a modal component
 * This navigator is prepared for future use when modal navigation is needed
 */
export function ModalNavigator() {
	return (
		<Stack.Navigator screenOptions={modalNavigationOptions}>
			<Stack.Screen
				name="PhotoViewer"
				component={PhotoViewerPlaceholder}
				options={{
					gestureDirection: "vertical",
				}}
			/>
		</Stack.Navigator>
	);
}
