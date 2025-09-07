import { nativeDeviceInfo } from "./nativeDeviceInfo";
import { nativeHeapMonitor } from "./nativeHeapMonitor";
import { nativeMemoryManager } from "../services/memory/nativeMemoryManager";

/**
 * Test function to verify native device info implementations
 * Call this from your app to see real device data vs mock data
 */
export async function testNativeDeviceInfo(): Promise<void> {
	console.log("🔍 [DeviceInfoTest] Starting native device info test...");

	try {
		// Test basic device info
		console.log("📱 [DeviceInfoTest] Testing device state...");
		const deviceState = await nativeDeviceInfo.getDeviceState();
		console.log("📱 [DeviceInfoTest] Device State:", {
			batteryLevel: `${Math.round(deviceState.batteryLevel * 100)}%`,
			isCharging: deviceState.isCharging,
			lowPowerMode: deviceState.lowPowerMode,
			availableMemory: `${Math.round(deviceState.availableMemory / 1024 / 1024)}MB`,
			totalMemory: `${Math.round(deviceState.totalMemory / 1024 / 1024)}MB`,
			isLowMemory: deviceState.isLowMemory,
			networkType: deviceState.networkType,
			isWifiConnected: deviceState.isWifiConnected,
			deviceModel: deviceState.deviceModel,
			systemVersion: deviceState.systemVersion,
		});

		// Test heap monitoring
		console.log("🧠 [DeviceInfoTest] Testing heap monitor...");
		const heapStatus = await nativeHeapMonitor.getHeapStatus();
		console.log("🧠 [DeviceInfoTest] Heap Status:", {
			jsHeapUsage: `${Math.round(heapStatus.usedJSHeapSize / 1024 / 1024)}MB`,
			jsHeapLimit: `${Math.round(heapStatus.jsHeapSizeLimit / 1024 / 1024)}MB`,
			heapUsagePercent: `${heapStatus.heapUsagePercent.toFixed(1)}%`,
			deviceMemoryUsagePercent: `${heapStatus.deviceMemoryUsagePercent.toFixed(1)}%`,
			appMemoryUsagePercent: `${heapStatus.appMemoryUsagePercent.toFixed(1)}%`,
		});

		// Test memory pressure detection
		console.log("⚠️ [DeviceInfoTest] Testing memory pressure detection...");
		const pressureLevel = await nativeHeapMonitor.getMemoryPressureLevel();
		console.log("⚠️ [DeviceInfoTest] Memory Pressure:", {
			level: pressureLevel.level,
			message: pressureLevel.message,
			action: pressureLevel.action,
			thresholds: pressureLevel.details.thresholdExceeded,
		});

		// Test memory manager
		console.log("🔧 [DeviceInfoTest] Testing memory manager...");
		const memoryStatus = await nativeMemoryManager.getMemoryStatus();
		console.log("🔧 [DeviceInfoTest] Memory Manager Status:", {
			totalDeviceMemory: `${Math.round(memoryStatus.totalDeviceMemory / 1024 / 1024)}MB`,
			availableDeviceMemory: `${Math.round(memoryStatus.availableDeviceMemory / 1024 / 1024)}MB`,
			appMemoryUsage: `${Math.round(memoryStatus.appMemoryUsage / 1024 / 1024)}MB`,
			appMemoryUsagePercent: `${memoryStatus.appMemoryUsagePercent.toFixed(1)}%`,
			isLowMemory: memoryStatus.isLowMemory,
			isCriticalMemory: memoryStatus.isCriticalMemory,
			memoryPressureLevel: memoryStatus.memoryPressureLevel,
			tempFileCount: memoryStatus.tempFileCount,
			tempFileSize: `${Math.round(memoryStatus.tempFileSize / 1024)}KB`,
		});

		// Test background task capability
		console.log("⚙️ [DeviceInfoTest] Testing background task capability...");
		const canRunResult = await nativeDeviceInfo.canRunBackgroundTask({
			wifiOnly: false,
			batterySaver: true,
			batteryThreshold: 0.15,
			memoryThreshold: 200 * 1024 * 1024,
			respectLowPowerMode: true,
		});
		console.log("⚙️ [DeviceInfoTest] Can Run Background Task:", {
			canRun: canRunResult.canRun,
			reason: canRunResult.reason || "All conditions met",
		});

		// Test memory report
		console.log("📊 [DeviceInfoTest] Generating memory report...");
		const memoryReport = await nativeMemoryManager.getMemoryReport();
		console.log("📊 [DeviceInfoTest] Memory Report:", {
			deviceModel: memoryReport.deviceInfo.model,
			totalMemory: memoryReport.deviceInfo.totalMemory,
			availableMemory: memoryReport.deviceInfo.availableMemory,
			memoryPressure: memoryReport.deviceInfo.memoryPressure,
			heapUsage: memoryReport.appMemory.jsHeapUsage,
			heapPercent: memoryReport.appMemory.heapUsagePercent,
			tempFileCount: memoryReport.tempFiles.count,
			tempFileSize: memoryReport.tempFiles.totalSize,
			recommendations: memoryReport.recommendations,
		});

		console.log(
			"✅ [DeviceInfoTest] Native device info test completed successfully!",
		);
		console.log(
			"🎉 [DeviceInfoTest] You now have REAL device data instead of mock values!",
		);
	} catch (error) {
		console.error("❌ [DeviceInfoTest] Test failed:", error);
		console.log(
			"💡 [DeviceInfoTest] This may be normal on simulators - try on a real device",
		);
	}
}
