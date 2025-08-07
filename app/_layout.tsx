import { createStackNavigator } from "@react-navigation/stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { Alert, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/MaterialIcons";
import { galleryScanner } from "../services/gallery/GalleryScanner";
import { initializeDatabase } from "../services/database";
import type { RootStackParamList } from "../types/navigation";
import DocumentScreen from "./document/[id]";
import HomeScreen from "./index";

// Load icon font
Icon.loadFont();

const Stack = createStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    // Initialize permissions and background scanning on app mount
    const initializeApp = async () => {
      try {
        // Initialize database first
        await initializeDatabase();
        
        // Check if we have gallery permissions
        const hasPermission = await galleryScanner.hasPermissions();
        
        if (!hasPermission) {
          // Don't request permissions automatically - let user decide
          console.log("Gallery permissions not granted yet");
          return;
        }

        // If we have permissions, check if we should start a background scan
        const progress = galleryScanner.getProgress();
        const shouldStartScan = !progress.isScanning && (
          !progress.lastScanDate || 
          Date.now() - progress.lastScanDate.getTime() > 24 * 60 * 60 * 1000 // 24 hours
        );

        if (shouldStartScan) {
          console.log("Starting background scan on app launch");
          
          // Start scan with conservative settings
          galleryScanner.startScan({
            batchSize: 10,
            smartFilterEnabled: true,
            batterySaver: true,
            wifiOnly: false,
          }).catch(error => {
            console.error("Background scan failed:", error);
          });
        }
      } catch (error) {
        console.error("App initialization error:", error);
      }
    };

    // Delay initialization to let the app fully mount
    const timer = setTimeout(initializeApp, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Stack.Navigator 
          initialRouteName="Home"
          screenOptions={{ 
            headerShown: false,
            gestureEnabled: true,
            gestureDirection: Platform.OS === "ios" ? "horizontal" : "vertical",
          }}
        >
          <Stack.Screen 
            name="Home" 
            component={HomeScreen}
            options={{
              gestureEnabled: false, // Disable swipe back on home screen
            }}
          />
          <Stack.Screen
            name="Document"
            component={DocumentScreen}
            options={{ 
              headerShown: true, 
              title: "Document",
              headerBackTitleVisible: false,
              headerTintColor: "#0066FF",
            }}
          />
        </Stack.Navigator>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}