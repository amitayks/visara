import DeviceInfo from "react-native-device-info";
import { Platform, DeviceEventEmitter } from "react-native";

export interface NativeHeapStatus {
	// App-specific memory
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
	heapUsagePercent: number;

	// Device memory
	totalDeviceMemory: number;
	usedDeviceMemory: number;
	availableDeviceMemory: number;
	deviceMemoryUsagePercent: number;
	appMemoryUsagePercent: number; // App memory usage as % of device total
}

export interface MemoryPressureLevel {
	level: "normal" | "moderate" | "high" | "critical";
	message: string;
	action: "none" | "cleanup" | "aggressive_cleanup" | "emergency";
	details: {
		heapPressure: boolean;
		systemPressure: boolean;
		thresholdExceeded: string[];
	};
}

export interface DetailedMemoryStats {
	heap: {
		used: number;
		total: number;
		limit: number;
		percentage: number;
		isHigh: boolean;
		isCritical: boolean;
	};
	device: {
		total: number;
		used: number;
		available: number;
		appUsage: number;
		appPercentage: number;
		systemPercentage: number;
		isLowMemory: boolean;
		isCritical: boolean;
	};
	thresholds: {
		heapWarning: number;
		heapCritical: number;
		systemWarning: number;
		systemCritical: number;
	};
}

type PressureListener = (pressure: MemoryPressureLevel) => void;

class NativeHeapMonitor {
	private pressureListeners = new Set<PressureListener>();
	private monitoringInterval: NodeJS.Timeout | null = null;
	private lastPressureLevel: MemoryPressureLevel["level"] = "normal";
	
	// Thresholds
	private readonly HEAP_WARNING_THRESHOLD = 0.7; // 70%
	private readonly HEAP_CRITICAL_THRESHOLD = 0.85; // 85%
	private readonly SYSTEM_WARNING_THRESHOLD = 0.8; // 80% of total device memory
	private readonly SYSTEM_CRITICAL_THRESHOLD = 0.9; // 90% of total device memory
	private readonly APP_MEMORY_WARNING_THRESHOLD = 0.3; // 30% of total device memory
	private readonly APP_MEMORY_CRITICAL_THRESHOLD = 0.5; // 50% of total device memory

	constructor() {
		this.setupMemoryListener();
	}

	private setupMemoryListener(): void {
		// Listen for system memory warnings
		DeviceEventEmitter.addListener("lowMemory", () => {
			this.handleLowMemoryWarning();
		});

		// Listen for iOS memory pressure warnings if available
		if (Platform.OS === "ios") {
			DeviceEventEmitter.addListener("memoryWarning", () => {
				this.handleMemoryWarning();
			});
		}
	}

	private async handleLowMemoryWarning(): Promise<void> {
		console.warn("[NativeHeapMonitor] System low memory warning received");
		const pressureLevel = await this.getMemoryPressureLevel();
		this.notifyPressureListeners(pressureLevel);
	}

	private async handleMemoryWarning(): Promise<void> {
		console.warn("[NativeHeapMonitor] Memory warning received");
		const pressureLevel = await this.getMemoryPressureLevel();
		this.notifyPressureListeners(pressureLevel);
	}

	private notifyPressureListeners(pressure: MemoryPressureLevel): void {
		this.pressureListeners.forEach((listener) => {
			try {
				listener(pressure);
			} catch (error) {
				console.error("[NativeHeapMonitor] Pressure listener error:", error);
			}
		});
	}

	async getHeapStatus(): Promise<NativeHeapStatus> {
		try {
			// Get device memory info
			const [totalDeviceMemory, usedDeviceMemory] = await Promise.all([
				DeviceInfo.getTotalMemory(),
				DeviceInfo.getUsedMemory(),
			]);

			const availableDeviceMemory = Math.max(0, totalDeviceMemory - usedDeviceMemory);
			const deviceMemoryUsagePercent = totalDeviceMemory > 0 
				? (usedDeviceMemory / totalDeviceMemory) * 100 
				: 0;

			// Get JS heap info if available
			let jsHeapInfo = {
				usedJSHeapSize: 0,
				totalJSHeapSize: 0,
				jsHeapSizeLimit: 0,
				heapUsagePercent: 0,
			};

			if (typeof global !== "undefined" && (global as any).performance?.memory) {
				const memory = (global as any).performance.memory;
				jsHeapInfo = {
					usedJSHeapSize: memory.usedJSHeapSize || 0,
					totalJSHeapSize: memory.totalJSHeapSize || 0,
					jsHeapSizeLimit: memory.jsHeapSizeLimit || 0,
					heapUsagePercent: memory.jsHeapSizeLimit > 0 
						? (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100 
						: 0,
				};
			} else {
				// Estimate JS heap usage for React Native/Hermes
				const estimatedHeapLimit = this.getEstimatedHeapLimit(totalDeviceMemory);
				const estimatedUsage = Math.min(usedDeviceMemory * 0.3, estimatedHeapLimit * 0.7); // Conservative estimate

				jsHeapInfo = {
					usedJSHeapSize: estimatedUsage,
					totalJSHeapSize: estimatedUsage,
					jsHeapSizeLimit: estimatedHeapLimit,
					heapUsagePercent: (estimatedUsage / estimatedHeapLimit) * 100,
				};
			}

			// Calculate app memory usage as percentage of total device memory
			const appMemoryUsagePercent = totalDeviceMemory > 0 
				? (jsHeapInfo.usedJSHeapSize / totalDeviceMemory) * 100 
				: 0;

			return {
				...jsHeapInfo,
				totalDeviceMemory,
				usedDeviceMemory,
				availableDeviceMemory,
				deviceMemoryUsagePercent,
				appMemoryUsagePercent,
			};
		} catch (error) {
			console.error("[NativeHeapMonitor] Error getting heap status:", error);
			
			// Return safe defaults
			const totalDeviceMemory = 4 * 1024 * 1024 * 1024; // 4GB
			const usedDeviceMemory = 2 * 1024 * 1024 * 1024; // 2GB
			const heapLimit = 512 * 1024 * 1024; // 512MB
			const heapUsed = 256 * 1024 * 1024; // 256MB

			return {
				usedJSHeapSize: heapUsed,
				totalJSHeapSize: heapUsed,
				jsHeapSizeLimit: heapLimit,
				heapUsagePercent: 50,
				totalDeviceMemory,
				usedDeviceMemory,
				availableDeviceMemory: totalDeviceMemory - usedDeviceMemory,
				deviceMemoryUsagePercent: 50,
				appMemoryUsagePercent: 12.5, // 256MB of 4GB
			};
		}
	}

	private getEstimatedHeapLimit(totalDeviceMemory: number): number {
		// Estimate JS heap limit based on device memory and platform
		if (Platform.OS === "ios") {
			// iOS typically allows more memory for apps
			if (totalDeviceMemory >= 8 * 1024 * 1024 * 1024) { // >= 8GB
				return 1.5 * 1024 * 1024 * 1024; // 1.5GB
			} else if (totalDeviceMemory >= 4 * 1024 * 1024 * 1024) { // >= 4GB
				return 1 * 1024 * 1024 * 1024; // 1GB
			} else {
				return 512 * 1024 * 1024; // 512MB
			}
		} else {
			// Android typically has more restrictive memory limits
			if (totalDeviceMemory >= 8 * 1024 * 1024 * 1024) { // >= 8GB
				return 768 * 1024 * 1024; // 768MB
			} else if (totalDeviceMemory >= 4 * 1024 * 1024 * 1024) { // >= 4GB
				return 512 * 1024 * 1024; // 512MB
			} else {
				return 256 * 1024 * 1024; // 256MB
			}
		}
	}

	async getMemoryPressureLevel(): Promise<MemoryPressureLevel> {
		const status = await this.getHeapStatus();
		
		const heapPercent = status.heapUsagePercent / 100;
		const systemPercent = status.deviceMemoryUsagePercent / 100;
		const appMemoryPercent = status.appMemoryUsagePercent / 100;

		const thresholdExceeded: string[] = [];
		let level: MemoryPressureLevel["level"] = "normal";
		let action: MemoryPressureLevel["action"] = "none";
		let message = "Memory usage is normal";

		// Check heap pressure
		const heapPressure = heapPercent > this.HEAP_WARNING_THRESHOLD;
		const heapCritical = heapPercent > this.HEAP_CRITICAL_THRESHOLD;

		// Check system pressure
		const systemPressure = systemPercent > this.SYSTEM_WARNING_THRESHOLD;
		const systemCritical = systemPercent > this.SYSTEM_CRITICAL_THRESHOLD;

		// Check app memory pressure
		const appPressure = appMemoryPercent > this.APP_MEMORY_WARNING_THRESHOLD;
		const appCritical = appMemoryPercent > this.APP_MEMORY_CRITICAL_THRESHOLD;

		if (heapCritical || systemCritical || appCritical) {
			level = "critical";
			action = "emergency";
			message = "Critical memory pressure detected - immediate cleanup required";
			
			if (heapCritical) thresholdExceeded.push(`JS Heap: ${(heapPercent * 100).toFixed(1)}%`);
			if (systemCritical) thresholdExceeded.push(`System: ${(systemPercent * 100).toFixed(1)}%`);
			if (appCritical) thresholdExceeded.push(`App Memory: ${(appMemoryPercent * 100).toFixed(1)}%`);
		} else if (heapPressure || systemPressure || appPressure) {
			if (heapPercent > 0.8 || systemPercent > 0.85 || appMemoryPercent > 0.4) {
				level = "high";
				action = "aggressive_cleanup";
				message = "High memory pressure - aggressive cleanup recommended";
			} else {
				level = "moderate";
				action = "cleanup";
				message = "Moderate memory pressure - cleanup recommended";
			}

			if (heapPressure) thresholdExceeded.push(`JS Heap: ${(heapPercent * 100).toFixed(1)}%`);
			if (systemPressure) thresholdExceeded.push(`System: ${(systemPercent * 100).toFixed(1)}%`);
			if (appPressure) thresholdExceeded.push(`App Memory: ${(appMemoryPercent * 100).toFixed(1)}%`);
		}

		return {
			level,
			message,
			action,
			details: {
				heapPressure: heapPressure || heapCritical,
				systemPressure: systemPressure || systemCritical,
				thresholdExceeded,
			},
		};
	}

	async getDetailedMemoryStats(): Promise<DetailedMemoryStats> {
		const status = await this.getHeapStatus();

		return {
			heap: {
				used: status.usedJSHeapSize,
				total: status.totalJSHeapSize,
				limit: status.jsHeapSizeLimit,
				percentage: status.heapUsagePercent,
				isHigh: status.heapUsagePercent > this.HEAP_WARNING_THRESHOLD * 100,
				isCritical: status.heapUsagePercent > this.HEAP_CRITICAL_THRESHOLD * 100,
			},
			device: {
				total: status.totalDeviceMemory,
				used: status.usedDeviceMemory,
				available: status.availableDeviceMemory,
				appUsage: status.usedJSHeapSize,
				appPercentage: status.appMemoryUsagePercent,
				systemPercentage: status.deviceMemoryUsagePercent,
				isLowMemory: status.availableDeviceMemory < 200 * 1024 * 1024, // < 200MB
				isCritical: status.availableDeviceMemory < 100 * 1024 * 1024, // < 100MB
			},
			thresholds: {
				heapWarning: this.HEAP_WARNING_THRESHOLD * 100,
				heapCritical: this.HEAP_CRITICAL_THRESHOLD * 100,
				systemWarning: this.SYSTEM_WARNING_THRESHOLD * 100,
				systemCritical: this.SYSTEM_CRITICAL_THRESHOLD * 100,
			},
		};
	}

	// Monitoring
	startMonitoring(intervalMs: number = 5000): void {
		if (this.monitoringInterval) {
			console.warn("[NativeHeapMonitor] Monitoring already started");
			return;
		}

		console.log("[NativeHeapMonitor] Starting memory monitoring");

		this.monitoringInterval = setInterval(async () => {
			try {
				const pressure = await this.getMemoryPressureLevel();
				
				// Only notify if pressure level changed
				if (pressure.level !== this.lastPressureLevel) {
					console.log(`[NativeHeapMonitor] Memory pressure level changed: ${this.lastPressureLevel} -> ${pressure.level}`);
					this.lastPressureLevel = pressure.level;
					this.notifyPressureListeners(pressure);
				}
			} catch (error) {
				console.error("[NativeHeapMonitor] Monitoring error:", error);
			}
		}, intervalMs);
	}

	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = null;
			console.log("[NativeHeapMonitor] Stopped memory monitoring");
		}
	}

	// Event listeners
	addPressureListener(listener: PressureListener): () => void {
		this.pressureListeners.add(listener);
		return () => {
			this.pressureListeners.delete(listener);
		};
	}

	// Utility methods
	async tryGarbageCollection(): Promise<boolean> {
		try {
			if (typeof global !== "undefined" && global.gc) {
				global.gc();
				console.log("[NativeHeapMonitor] Garbage collection triggered");
				return true;
			}
		} catch (error) {
			console.warn("[NativeHeapMonitor] Failed to trigger GC:", error);
		}
		return false;
	}

	formatBytes(bytes: number): string {
		if (bytes === 0) return "0 Bytes";

		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return parseFloat((bytes / k ** i).toFixed(2)) + " " + sizes[i];
	}

	async getMemorySummary(): Promise<string> {
		const stats = await this.getDetailedMemoryStats();
		const pressure = await this.getMemoryPressureLevel();

		return `Memory Summary:
JS Heap: ${this.formatBytes(stats.heap.used)} / ${this.formatBytes(stats.heap.limit)} (${stats.heap.percentage.toFixed(1)}%)
Device: ${this.formatBytes(stats.device.used)} / ${this.formatBytes(stats.device.total)} (${stats.device.systemPercentage.toFixed(1)}%)
App Usage: ${this.formatBytes(stats.device.appUsage)} (${stats.device.appPercentage.toFixed(1)}% of device total)
Available: ${this.formatBytes(stats.device.available)}
Pressure Level: ${pressure.level} - ${pressure.message}`;
	}
}

// Singleton instance
export const nativeHeapMonitor = new NativeHeapMonitor();