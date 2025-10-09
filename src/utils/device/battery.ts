import DeviceInfo from "react-native-device-info";

export interface BatteryStatus {
	level: number; // 0-1 (0% to 100%)
	isCharging: boolean;
}

/**
 * Get current battery status
 */
export async function getBatteryStatus(): Promise<BatteryStatus> {
	try {
		const [level, isCharging] = await Promise.all([
			DeviceInfo.getBatteryLevel(),
			DeviceInfo.isBatteryCharging(),
		]);

		return {
			level,
			isCharging,
		};
	} catch (error) {
		console.error("Failed to get battery status:", error);
		// Return safe defaults if battery info is unavailable
		return {
			level: 1.0, // Assume full battery
			isCharging: true, // Assume charging to allow processing
		};
	}
}

/**
 * Check if battery level is low (below threshold)
 */
export async function isBatteryLow(threshold = 0.2): Promise<boolean> {
	try {
		const level = await DeviceInfo.getBatteryLevel();
		return level < threshold;
	} catch (error) {
		console.error("Failed to check battery level:", error);
		return false; // Assume not low if unavailable
	}
}

/**
 * Check if device is currently charging
 */
export async function isDeviceCharging(): Promise<boolean> {
	try {
		return await DeviceInfo.isBatteryCharging();
	} catch (error) {
		console.error("Failed to check charging status:", error);
		return true; // Assume charging if unavailable
	}
}

/**
 * Check if processing should be allowed based on battery status
 * Used for Battery Saver Mode
 */
export async function shouldAllowProcessing(
	batterySaverEnabled: boolean,
): Promise<boolean> {
	if (!batterySaverEnabled) {
		return true; // Battery saver disabled, always allow
	}

	try {
		const isCharging = await isDeviceCharging();
		// Only allow processing if device is charging when battery saver is enabled
		return isCharging;
	} catch (error) {
		console.error("Failed to check battery status for processing:", error);
		// On error, allow processing to continue
		return true;
	}
}

/**
 * Get battery level as percentage (0-100)
 */
export async function getBatteryPercentage(): Promise<number> {
	try {
		const level = await DeviceInfo.getBatteryLevel();
		return Math.round(level * 100);
	} catch (error) {
		console.error("Failed to get battery percentage:", error);
		return 100; // Assume full battery
	}
}
