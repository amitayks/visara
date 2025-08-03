import { NativeModules, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";

interface DeviceState {
	batteryLevel: number; // 0-1
	isCharging: boolean;
	availableMemory: number; // in MB
	isLowMemory: boolean;
	networkType: string;
	isWifiConnected: boolean;
}

class DeviceInfo {
	private batteryLevel = 1; // Default to full battery
	private isCharging = false;
	private memoryThreshold = 100; // MB - threshold for low memory

	async getDeviceState(): Promise<DeviceState> {
		const [battery, memory, network] = await Promise.all([
			this.getBatteryInfo(),
			this.getMemoryInfo(),
			this.getNetworkInfo(),
		]);

		return {
			...battery,
			...memory,
			...network,
		};
	}

	async getBatteryInfo(): Promise<{
		batteryLevel: number;
		isCharging: boolean;
	}> {
		// React Native doesn't have a built-in battery API
		// You would need to create a native module or use a third-party library
		// For now, we'll return mock values that can be replaced with actual implementation
		
		// TODO: Implement native module for battery info or use react-native-device-info
		return {
			batteryLevel: this.batteryLevel,
			isCharging: this.isCharging,
		};
	}

	async getMemoryInfo(): Promise<{
		availableMemory: number;
		isLowMemory: boolean;
	}> {
		// Similarly, memory info would require native module
		// TODO: Implement native module for memory info
		
		const availableMemory = 500; // Mock value in MB
		return {
			availableMemory,
			isLowMemory: availableMemory < this.memoryThreshold,
		};
	}

	async getNetworkInfo(): Promise<{
		networkType: string;
		isWifiConnected: boolean;
	}> {
		const netInfo = await NetInfo.fetch();
		
		return {
			networkType: netInfo.type,
			isWifiConnected: netInfo.type === "wifi" && netInfo.isConnected === true,
		};
	}

	async isBatteryLow(threshold = 0.2): Promise<boolean> {
		const { batteryLevel } = await this.getBatteryInfo();
		return batteryLevel < threshold;
	}

	async isMemoryAvailable(requiredMB = 100): Promise<boolean> {
		const { availableMemory } = await this.getMemoryInfo();
		return availableMemory >= requiredMB;
	}

	async canRunBackgroundTask(settings: {
		wifiOnly: boolean;
		batterySaver: boolean;
		batteryThreshold?: number;
		memoryThreshold?: number;
	}): Promise<{ canRun: boolean; reason?: string }> {
		const deviceState = await this.getDeviceState();

		// Check WiFi requirement
		if (settings.wifiOnly && !deviceState.isWifiConnected) {
			return {
				canRun: false,
				reason: "WiFi-only mode enabled and device is not on WiFi",
			};
		}

		// Check battery saver mode
		if (settings.batterySaver) {
			const threshold = settings.batteryThreshold || 0.2;
			if (deviceState.batteryLevel < threshold && !deviceState.isCharging) {
				return {
					canRun: false,
					reason: `Battery too low (${Math.round(deviceState.batteryLevel * 100)}%)`,
				};
			}
		}

		// Check memory availability
		const memThreshold = settings.memoryThreshold || 100;
		if (deviceState.availableMemory < memThreshold) {
			return {
				canRun: false,
				reason: `Insufficient memory (${deviceState.availableMemory}MB available)`,
			};
		}

		return { canRun: true };
	}

	// Mock methods for setting test values (remove in production)
	setMockBatteryLevel(level: number, charging: boolean) {
		this.batteryLevel = level;
		this.isCharging = charging;
	}
}

export const deviceInfo = new DeviceInfo();