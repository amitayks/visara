/**
 * Debug helpers for troubleshooting the Settings page crash
 */

export const debugLog = (component: string, message: string, data?: any) => {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] [${component}] ${message}`);
	if (data) {
		console.log(`[${timestamp}] [${component}] Data:`, data);
	}
};

export const safeAsyncCall = async <T>(
	fn: () => Promise<T>,
	fallback: T,
	errorMessage: string,
): Promise<T> => {
	try {
		return await fn();
	} catch (error) {
		console.error(errorMessage, error);
		return fallback;
	}
};

// Crash reporter for debugging
export const reportCrash = (error: Error, componentName: string) => {
	console.error(`
========================================
CRASH REPORT - ${componentName}
========================================
Error: ${error.message}
Stack: ${error.stack}
Time: ${new Date().toISOString()}
========================================
	`);
};

// Safe state update wrapper
export const safeSetState = <T>(
	setter: (value: T) => void,
	value: T,
	componentName: string,
) => {
	try {
		setter(value);
	} catch (error) {
		console.error(`[${componentName}] Failed to update state:`, error);
	}
};

// Permission check with detailed logging
export const debugPermissionCheck = async (source: string) => {
	try {
		debugLog(source, "Starting permission check");
		
		// Import dynamically to avoid circular dependencies
		const { galleryPermissions } = await import("../services/permissions/galleryPermissions");
		
		const result = await galleryPermissions.checkPermission();
		debugLog(source, "Permission check result", result);
		
		return result;
	} catch (error) {
		debugLog(source, "Permission check failed", error);
		throw error;
	}
};

// Background service status checker
export const debugBackgroundService = async () => {
	try {
		// Import dynamically
		const { backgroundScanner } = await import("../services/gallery/backgroundScanner");
		
		const status = await backgroundScanner.getBackgroundServiceStatus();
		console.log("Background Service Status:", status);
		
		return status;
	} catch (error) {
		console.error("Failed to get background service status:", error);
		return null;
	}
};