import DeviceInfo from "react-native-device-info";
import NetInfo from "@react-native-community/netinfo";
import { Platform, DeviceEventEmitter, NativeModules } from "react-native";

export interface NativeDeviceState {
	batteryLevel: number; // 0-1
	isCharging: boolean;
	lowPowerMode: boolean;
	availableMemory: number; // in bytes
	totalMemory: number; // in bytes
	isLowMemory: boolean;
	networkType: string;
	isWifiConnected: boolean;
	deviceModel: string;
	systemVersion: string;
}

export interface BatteryInfo {
	batteryLevel: number;
	isCharging: boolean;
	lowPowerMode: boolean;
}

export interface MemoryInfo {
	totalMemory: number;
	availableMemory: number;
	usedMemory: number;
	memoryPercentage: number;
	isLowMemory: boolean;
	isCriticalMemory: boolean;
}

export interface BackgroundTaskSettings {
	wifiOnly?: boolean;
	batterySaver?: boolean;
	batteryThreshold?: number;
	memoryThreshold?: number;
	respectLowPowerMode?: boolean;
}

export interface CanRunResult {
	canRun: boolean;
	reason?: string;
	deviceState?: NativeDeviceState;
}

type BatteryListener = (battery: BatteryInfo) => void;
type MemoryListener = (memory: MemoryInfo) => void;

class NativeDeviceInfo {
	private batteryListeners = new Set<BatteryListener>();
	private memoryListeners = new Set<MemoryListener>();
	private initialized = false;
	private batteryMonitoringEnabled = false;

	// Memory thresholds
	private readonly LOW_MEMORY_THRESHOLD = 200 * 1024 * 1024; // 200MB
	private readonly CRITICAL_MEMORY_THRESHOLD = 100 * 1024 * 1024; // 100MB
	private readonly LOW_MEMORY_PERCENTAGE = 0.15; // 15% of total memory
	private readonly CRITICAL_MEMORY_PERCENTAGE = 0.08; // 8% of total memory

	constructor() {
		this.initialize();
	}

	private async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Enable battery monitoring on iOS
			if (Platform.OS === "ios") {
				await this.enableBatteryMonitoring();
			}

			// Setup battery change listeners
			this.setupBatteryListener();

			this.initialized = true;
			console.log("[NativeDeviceInfo] Initialized successfully");
		} catch (error) {
			console.error("[NativeDeviceInfo] Initialization failed:", error);
		}
	}

	private async enableBatteryMonitoring(): Promise<void> {
		try {
			if (Platform.OS === "ios" && !this.batteryMonitoringEnabled) {
				// Try to enable battery monitoring via native module if available
				const { RNDeviceInfo } = NativeModules;
				if (RNDeviceInfo && RNDeviceInfo.enableBatteryMonitoring) {
					await RNDeviceInfo.enableBatteryMonitoring();
				}
				this.batteryMonitoringEnabled = true;
			}
		} catch (error) {
			console.warn(
				"[NativeDeviceInfo] Failed to enable battery monitoring:",
				error,
			);
		}
	}

	private setupBatteryListener(): void {
		// Listen for battery level changes (iOS)
		if (Platform.OS === "ios") {
			DeviceEventEmitter.addListener(
				"BatteryLevelDidChange",
				(level: number) => {
					this.notifyBatteryListeners();
				},
			);

			DeviceEventEmitter.addListener(
				"BatteryStateDidChange",
				(state: string) => {
					this.notifyBatteryListeners();
				},
			);

			DeviceEventEmitter.addListener(
				"PowerStateDidChange",
				(lowPowerMode: boolean) => {
					this.notifyBatteryListeners();
				},
			);
		}

		// Listen for low memory warnings
		DeviceEventEmitter.addListener("lowMemory", () => {
			this.notifyMemoryListeners();
		});
	}

	private async notifyBatteryListeners(): Promise<void> {
		if (this.batteryListeners.size === 0) return;

		try {
			const batteryInfo = await this.getBatteryInfo();
			this.batteryListeners.forEach((listener) => {
				try {
					listener(batteryInfo);
				} catch (error) {
					console.error("[NativeDeviceInfo] Battery listener error:", error);
				}
			});
		} catch (error) {
			console.error(
				"[NativeDeviceInfo] Failed to notify battery listeners:",
				error,
			);
		}
	}

	private async notifyMemoryListeners(): Promise<void> {
		if (this.memoryListeners.size === 0) return;

		try {
			const memoryInfo = await this.getMemoryInfo();
			this.memoryListeners.forEach((listener) => {
				try {
					listener(memoryInfo);
				} catch (error) {
					console.error("[NativeDeviceInfo] Memory listener error:", error);
				}
			});
		} catch (error) {
			console.error(
				"[NativeDeviceInfo] Failed to notify memory listeners:",
				error,
			);
		}
	}

	async getDeviceState(): Promise<NativeDeviceState> {
		const [battery, memory, network, deviceModel, systemVersion] =
			await Promise.all([
				this.getBatteryInfo(),
				this.getMemoryInfo(),
				this.getNetworkInfo(),
				DeviceInfo.getModel(),
				DeviceInfo.getSystemVersion(),
			]);

		return {
			batteryLevel: battery.batteryLevel,
			isCharging: battery.isCharging,
			lowPowerMode: battery.lowPowerMode,
			availableMemory: memory.availableMemory,
			totalMemory: memory.totalMemory,
			isLowMemory: memory.isLowMemory,
			networkType: network.networkType,
			isWifiConnected: network.isWifiConnected,
			deviceModel,
			systemVersion,
		};
	}

	async getBatteryInfo(): Promise<BatteryInfo> {
		try {
			const [batteryLevel, isCharging] = await Promise.all([
				DeviceInfo.getBatteryLevel(),
				DeviceInfo.isBatteryCharging(),
			]);

			// Try to get power save mode, fallback to false if not available
			let lowPowerMode = false;
			try {
				// Use proper method name that exists in react-native-device-info
				lowPowerMode = await (DeviceInfo as any).isPowerSaveMode?.() || false;
			} catch (error) {
				// Method not available on this platform or version
				lowPowerMode = false;
			}

			return {
				batteryLevel: Math.max(0, Math.min(1, batteryLevel)), // Clamp between 0-1
				isCharging: isCharging || false,
				lowPowerMode: lowPowerMode || false,
			};
		} catch (error) {
			console.error("[NativeDeviceInfo] Error getting battery info:", error);
			// Return safe defaults
			return {
				batteryLevel: 0.5,
				isCharging: false,
				lowPowerMode: false,
			};
		}
	}

	async getMemoryInfo(): Promise<MemoryInfo> {
		try {
			const [totalMemory, usedMemory] = await Promise.all([
				DeviceInfo.getTotalMemory(),
				DeviceInfo.getUsedMemory(),
			]);

			const availableMemory = Math.max(0, totalMemory - usedMemory);
			const memoryPercentage =
				totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;

			// Calculate memory thresholds
			const lowMemoryThreshold = Math.max(
				this.LOW_MEMORY_THRESHOLD,
				totalMemory * this.LOW_MEMORY_PERCENTAGE,
			);
			const criticalMemoryThreshold = Math.max(
				this.CRITICAL_MEMORY_THRESHOLD,
				totalMemory * this.CRITICAL_MEMORY_PERCENTAGE,
			);

			const isLowMemory = availableMemory < lowMemoryThreshold;
			const isCriticalMemory = availableMemory < criticalMemoryThreshold;

			return {
				totalMemory,
				availableMemory,
				usedMemory,
				memoryPercentage,
				isLowMemory,
				isCriticalMemory,
			};
		} catch (error) {
			console.error("[NativeDeviceInfo] Error getting memory info:", error);
			// Return safe defaults
			const totalMemory = 4 * 1024 * 1024 * 1024; // 4GB default
			const usedMemory = 2 * 1024 * 1024 * 1024; // 2GB used default
			const availableMemory = totalMemory - usedMemory;

			return {
				totalMemory,
				availableMemory,
				usedMemory,
				memoryPercentage: 50,
				isLowMemory: false,
				isCriticalMemory: false,
			};
		}
	}

	async getNetworkInfo(): Promise<{
		networkType: string;
		isWifiConnected: boolean;
	}> {
		try {
			const netInfo = await NetInfo.fetch();
			return {
				networkType: netInfo.type || "unknown",
				isWifiConnected:
					netInfo.type === "wifi" && netInfo.isConnected === true,
			};
		} catch (error) {
			console.error("[NativeDeviceInfo] Error getting network info:", error);
			return {
				networkType: "unknown",
				isWifiConnected: false,
			};
		}
	}

	async isBatteryLow(threshold = 0.2): Promise<boolean> {
		const { batteryLevel } = await this.getBatteryInfo();
		return batteryLevel < threshold;
	}

	async isMemoryAvailable(requiredBytes: number): Promise<boolean> {
		const { availableMemory } = await this.getMemoryInfo();
		return availableMemory >= requiredBytes;
	}

	async canRunBackgroundTask(
		settings: BackgroundTaskSettings,
	): Promise<CanRunResult> {
		const deviceState = await this.getDeviceState();

		// Check WiFi requirement
		if (settings.wifiOnly && !deviceState.isWifiConnected) {
			return {
				canRun: false,
				reason: "WiFi-only mode enabled and device is not on WiFi",
				deviceState,
			};
		}

		// Check low power mode
		if (settings.respectLowPowerMode && deviceState.lowPowerMode) {
			return {
				canRun: false,
				reason: "Device is in low power mode",
				deviceState,
			};
		}

		// Check battery saver mode
		if (settings.batterySaver) {
			const threshold = settings.batteryThreshold || 0.15; // Default 15%
			if (deviceState.batteryLevel < threshold && !deviceState.isCharging) {
				return {
					canRun: false,
					reason: `Battery too low (${Math.round(deviceState.batteryLevel * 100)}%)`,
					deviceState,
				};
			}
		}

		// Check memory availability
		if (settings.memoryThreshold) {
			if (deviceState.availableMemory < settings.memoryThreshold) {
				return {
					canRun: false,
					reason: `Insufficient memory (${Math.round(deviceState.availableMemory / 1024 / 1024)}MB available)`,
					deviceState,
				};
			}
		}

		// Check if memory is critically low
		const memoryInfo = await this.getMemoryInfo();
		if (memoryInfo.isCriticalMemory) {
			return {
				canRun: false,
				reason: "Critical memory pressure detected",
				deviceState,
			};
		}

		return { canRun: true, deviceState };
	}

	// Event listeners
	addBatteryListener(listener: BatteryListener): () => void {
		this.batteryListeners.add(listener);
		return () => {
			this.batteryListeners.delete(listener);
		};
	}

	addMemoryListener(listener: MemoryListener): () => void {
		this.memoryListeners.add(listener);
		return () => {
			this.memoryListeners.delete(listener);
		};
	}

	// Debug and testing methods
	async getDeviceDebugInfo(): Promise<{
		deviceInfo: NativeDeviceState;
		deviceSpecs: {
			brand: string;
			manufacturer: string;
			model: string;
			deviceId: string;
			systemVersion: string;
			buildNumber: string;
			isTablet: boolean;
		};
		networkDetails: {
			type: string;
			isConnected: boolean;
			isWifiEnabled: boolean;
			isInternetReachable: boolean | null;
		};
	}> {
		try {
			const [
				deviceState,
				brand,
				manufacturer,
				model,
				deviceId,
				systemVersion,
				buildNumber,
				isTablet,
				netInfo,
			] = await Promise.all([
				this.getDeviceState(),
				DeviceInfo.getBrand(),
				DeviceInfo.getManufacturer(),
				DeviceInfo.getModel(),
				DeviceInfo.getDeviceId(),
				DeviceInfo.getSystemVersion(),
				DeviceInfo.getBuildNumber(),
				DeviceInfo.isTablet(),
				NetInfo.fetch(),
			]);

			return {
				deviceInfo: deviceState,
				deviceSpecs: {
					brand,
					manufacturer,
					model,
					deviceId,
					systemVersion,
					buildNumber,
					isTablet,
				},
				networkDetails: {
					type: netInfo.type || "unknown",
					isConnected: netInfo.isConnected || false,
					isWifiEnabled: netInfo.isWifiEnabled || false,
					isInternetReachable: netInfo.isInternetReachable,
				},
			};
		} catch (error) {
			console.error("[NativeDeviceInfo] Error getting debug info:", error);
			throw error;
		}
	}

	async getFormattedMemoryInfo(): Promise<string> {
		const memory = await this.getMemoryInfo();
		const formatBytes = (bytes: number) => {
			const mb = bytes / (1024 * 1024);
			if (mb >= 1024) {
				return `${(mb / 1024).toFixed(1)}GB`;
			}
			return `${Math.round(mb)}MB`;
		};

		return `Memory: ${formatBytes(memory.usedMemory)} / ${formatBytes(memory.totalMemory)} (${memory.memoryPercentage.toFixed(1)}%) - Available: ${formatBytes(memory.availableMemory)}`;
	}

	async getFormattedBatteryInfo(): Promise<string> {
		const battery = await this.getBatteryInfo();
		const percentage = Math.round(battery.batteryLevel * 100);
		const status = battery.isCharging ? "Charging" : "Discharging";
		const powerMode = battery.lowPowerMode ? " (Low Power)" : "";
		return `Battery: ${percentage}% ${status}${powerMode}`;
	}
}

// Singleton instance
export const nativeDeviceInfo = new NativeDeviceInfo();
