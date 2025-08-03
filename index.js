import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";
import { permissionChangeHandler } from "./utils/permissionChangeHandler";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Initialize permission handler
permissionChangeHandler.initialize().catch(error => {
    console.error("Failed to initialize permission handler:", error);
});

// Global error handler using React Native's built-in error handler
if (!__DEV__) {
    const originalHandler = global.ErrorUtils.getGlobalHandler();
    
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        console.error("Global error caught:", error, "Fatal:", isFatal);
        
        if (isFatal && error) {
            // Save crash reason for next launch
            AsyncStorage.setItem("last_crash_reason", "permission_change").catch(() => {});
            
            // Log more details
            if (error.message && error.message.includes("permission")) {
                console.error("Crash appears to be permission-related");
            }
        }
        
        // Call original handler
        if (originalHandler) {
            originalHandler(error, isFatal);
        }
    });
}

// Log unhandled promise rejections
const originalRejectionHandler = global.Promise._unhandledRejectionFn;
global.Promise._unhandledRejectionFn = (id, error) => {
    console.warn("Unhandled Promise Rejection:", id, error);
    
    // Check if it's permission related
    if (error && error.message && error.message.includes("permission")) {
        console.error("Unhandled rejection appears to be permission-related");
        permissionChangeHandler.savePermissionCrash();
    }
    
    if (originalRejectionHandler) {
        originalRejectionHandler(id, error);
    }
};

AppRegistry.registerComponent(appName, () => App);
