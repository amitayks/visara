export interface HeapStatus {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
	heapUsagePercent: number;
}

/**
 * Get current JavaScript heap status
 * Works in both browser and React Native environments
 */
export const getHeapStatus = (): HeapStatus => {
	// Check if performance.memory is available (Chrome/V8)
	if (typeof global !== "undefined" && (global as any).performance?.memory) {
		const memory = (global as any).performance.memory;
		return {
			usedJSHeapSize: memory.usedJSHeapSize,
			totalJSHeapSize: memory.totalJSHeapSize,
			jsHeapSizeLimit: memory.jsHeapSizeLimit,
			heapUsagePercent: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
		};
	}

	// Fallback for React Native/Hermes
	// Hermes doesn't expose heap info directly, so we estimate
	const estimatedHeapLimit = getEstimatedHeapLimit();
	const estimatedUsage = getEstimatedHeapUsage();

	return {
		usedJSHeapSize: estimatedUsage,
		totalJSHeapSize: estimatedUsage, // Same as used in estimation
		jsHeapSizeLimit: estimatedHeapLimit,
		heapUsagePercent: estimatedUsage / estimatedHeapLimit,
	};
};

/**
 * Estimate heap limit based on device
 */
function getEstimatedHeapLimit(): number {
	// React Native typically has these heap limits:
	// - iOS: ~1GB on newer devices, ~512MB on older
	// - Android: ~512MB default, can be higher on newer devices

	// Conservative estimate
	return 512 * 1024 * 1024; // 512MB
}

/**
 * Rough estimation of heap usage
 * This is a very rough approximation
 */
function getEstimatedHeapUsage(): number {
	// We can't accurately measure heap in Hermes
	// Return a conservative estimate
	// In production, you might want to track allocations manually
	return 100 * 1024 * 1024; // Start with 100MB estimate
}

/**
 * Format bytes to human readable string
 */
export const formatBytes = (bytes: number): string => {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Check if heap usage is high
 */
export const isHighHeapUsage = (threshold: number = 0.7): boolean => {
	const status = getHeapStatus();
	return status.heapUsagePercent > threshold;
};

/**
 * Get heap usage summary string
 */
export const getHeapSummary = (): string => {
	const status = getHeapStatus();
	return `Heap: ${formatBytes(status.usedJSHeapSize)} / ${formatBytes(status.jsHeapSizeLimit)} (${(status.heapUsagePercent * 100).toFixed(1)}%)`;
};

/**
 * Try to trigger garbage collection (if available)
 */
export const tryGarbageCollection = (): boolean => {
	if (typeof global !== "undefined" && global.gc) {
		try {
			global.gc();
			console.log("[HeapMonitor] Garbage collection triggered");
			return true;
		} catch (e) {
			console.warn("[HeapMonitor] Failed to trigger GC:", e);
		}
	}
	return false;
};
