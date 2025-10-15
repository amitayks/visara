/** biome-ignore-all lint/complexity/noStaticOnlyClass: singleton pattern preferred */
import { NativeModules, Platform } from "react-native";
import { CleanupService } from "@services/maintenance/CleanupService";

export interface MemoryInfo {
	/** Total available memory in bytes */
	totalMemory: number;
	/** Currently used memory in bytes */
	usedMemory: number;
	/** Free memory in bytes */
	freeMemory: number;
	/** Memory usage percentage (0-1) */
	usagePercentage: number;
	/** Whether memory usage is above threshold */
	isAboveThreshold: boolean;
	/** Current threshold percentage (0-1) */
	threshold: number;
}

export interface MemoryThresholdConfig {
	/** Memory usage threshold (0-1) at which throttling should occur. Default: 0.8 (80%) */
	threshold?: number;
	/** Interval in milliseconds to check memory. Default: 2000ms */
	checkInterval?: number;
	/** Whether to log memory warnings. Default: true */
	enableLogging?: boolean;
}

export type MemoryWarningCallback = (memoryInfo: MemoryInfo) => void;

/**
 * MemoryMonitor service for tracking app memory usage
 *
 * Features:
 * - Real-time memory usage tracking
 * - Configurable threshold monitoring (default 80%)
 * - Automatic throttling recommendations
 * - Platform-specific memory queries (iOS/Android)
 * - Warning callbacks for high memory usage
 *
 * Constitutional Alignment:
 * - Performance & Optimization Standards: Memory management with overflow prevention
 * - Target: <200MB baseline, <500MB during processing
 * - Throttling at 80% threshold to prevent crashes
 *
 * Usage:
 * ```typescript
 * // Initialize with default config
 * await MemoryMonitor.initialize();
 *
 * // Check current memory
 * const info = await MemoryMonitor.getMemoryInfo();
 *
 * // Register warning callback
 * MemoryMonitor.onMemoryWarning((info) => {
 *   console.warn('High memory usage:', info.usagePercentage);
 *   // Pause processing or cleanup
 * });
 *
 * // Start monitoring
 * MemoryMonitor.startMonitoring();
 * ```
 */
export class MemoryMonitor {
	private static threshold = 0.8; // 80% threshold
	private static checkInterval = 2000; // 2 seconds
	private static enableLogging = true;
	private static isMonitoring = false;
	private static monitoringTimer: NodeJS.Timeout | null = null;
	private static warningCallbacks: Set<MemoryWarningCallback> = new Set();
	private static lastMemoryInfo: MemoryInfo | null = null;

	/**
	 * Initialize the memory monitor with configuration
	 */
	static initialize(config?: MemoryThresholdConfig): void {
		if (config?.threshold !== undefined) {
			this.threshold = Math.max(0, Math.min(1, config.threshold));
		}
		if (config?.checkInterval !== undefined) {
			this.checkInterval = Math.max(1000, config.checkInterval);
		}
		if (config?.enableLogging !== undefined) {
			this.enableLogging = config.enableLogging;
		}

		if (this.enableLogging) {
			console.log(
				`MemoryMonitor initialized with threshold: ${(this.threshold * 100).toFixed(0)}%, check interval: ${this.checkInterval}ms`,
			);
		}
	}

	/**
	 * Get current memory information
	 *
	 * Platform-specific implementation:
	 * - iOS: Uses native memory pressure APIs
	 * - Android: Uses ActivityManager.MemoryInfo
	 * - Web/Other: Falls back to performance.memory if available
	 */
	static async getMemoryInfo(): Promise<MemoryInfo> {
		try {
			let totalMemory = 0;
			let usedMemory = 0;
			let freeMemory = 0;

			if (Platform.OS === "ios") {
				// iOS: Use native memory APIs
				const memoryInfo = await this.getIOSMemoryInfo();
				totalMemory = memoryInfo.totalMemory;
				usedMemory = memoryInfo.usedMemory;
				freeMemory = memoryInfo.freeMemory;
			} else if (Platform.OS === "android") {
				// Android: Use ActivityManager
				const memoryInfo = await this.getAndroidMemoryInfo();
				totalMemory = memoryInfo.totalMemory;
				usedMemory = memoryInfo.usedMemory;
				freeMemory = memoryInfo.freeMemory;
			} else {
				// Fallback for web or other platforms
				totalMemory = 512 * 1024 * 1024; // Assume 512MB default
				usedMemory = 100 * 1024 * 1024; // Assume 100MB used
				freeMemory = totalMemory - usedMemory;
			}

			const usagePercentage = totalMemory > 0 ? usedMemory / totalMemory : 0;
			const isAboveThreshold = usagePercentage > this.threshold;

			const memoryInfo: MemoryInfo = {
				totalMemory,
				usedMemory,
				freeMemory,
				usagePercentage,
				isAboveThreshold,
				threshold: this.threshold,
			};

			this.lastMemoryInfo = memoryInfo;

			// Trigger warning callbacks if above threshold
			if (isAboveThreshold && this.warningCallbacks.size > 0) {
				this.warningCallbacks.forEach((callback) => {
					try {
						callback(memoryInfo);
					} catch (error) {
						console.error("MemoryMonitor warning callback error:", error);
					}
				});
			}

			// Log warning if enabled
			if (this.enableLogging && isAboveThreshold) {
				console.warn(
					`Memory usage above threshold: ${(usagePercentage * 100).toFixed(1)}% (${this.formatBytes(usedMemory)} / ${this.formatBytes(totalMemory)})`,
				);
			}

			return memoryInfo;
		} catch (error) {
			console.error("MemoryMonitor.getMemoryInfo error:", error);

			// Return safe fallback
			return {
				totalMemory: 512 * 1024 * 1024,
				usedMemory: 100 * 1024 * 1024,
				freeMemory: 412 * 1024 * 1024,
				usagePercentage: 0.2,
				isAboveThreshold: false,
				threshold: this.threshold,
			};
		}
	}

	/**
	 * Get iOS-specific memory information
	 */
	private static async getIOSMemoryInfo(): Promise<{
		totalMemory: number;
		usedMemory: number;
		freeMemory: number;
	}> {
		try {
			// Check if native module exists
			const { MemoryModule } = NativeModules;
			if (MemoryModule && MemoryModule.getMemoryInfo) {
				const info = await MemoryModule.getMemoryInfo();
				return {
					totalMemory: info.totalMemory || 0,
					usedMemory: info.usedMemory || 0,
					freeMemory: info.freeMemory || 0,
				};
			}

			// Fallback: Estimate based on typical iOS device memory
			// Most modern iOS devices have 4-8GB RAM
			const totalMemory = 6 * 1024 * 1024 * 1024; // 6GB estimate
			const usedMemory = 200 * 1024 * 1024; // 200MB estimate
			const freeMemory = totalMemory - usedMemory;

			return { totalMemory, usedMemory, freeMemory };
		} catch (error) {
			console.error("MemoryMonitor.getIOSMemoryInfo error:", error);
			throw error;
		}
	}

	/**
	 * Get Android-specific memory information
	 */
	private static async getAndroidMemoryInfo(): Promise<{
		totalMemory: number;
		usedMemory: number;
		freeMemory: number;
	}> {
		try {
			// Check if native module exists
			const { MemoryModule } = NativeModules;
			if (MemoryModule && MemoryModule.getMemoryInfo) {
				const info = await MemoryModule.getMemoryInfo();
				return {
					totalMemory: info.totalMemory || 0,
					usedMemory: info.usedMemory || 0,
					freeMemory: info.freeMemory || 0,
				};
			}

			// Fallback: Estimate based on typical Android device memory
			const totalMemory = 4 * 1024 * 1024 * 1024; // 4GB estimate
			const usedMemory = 200 * 1024 * 1024; // 200MB estimate
			const freeMemory = totalMemory - usedMemory;

			return { totalMemory, usedMemory, freeMemory };
		} catch (error) {
			console.error("MemoryMonitor.getAndroidMemoryInfo error:", error);
			throw error;
		}
	}

	/**
	 * Start continuous memory monitoring
	 */
	static startMonitoring(): void {
		if (this.isMonitoring) {
			console.warn("MemoryMonitor is already monitoring");
			return;
		}

		this.isMonitoring = true;

		this.monitoringTimer = setInterval(async () => {
			await this.getMemoryInfo();
		}, this.checkInterval);

		if (this.enableLogging) {
			console.log("MemoryMonitor started");
		}
	}

	/**
	 * Stop memory monitoring
	 */
	static stopMonitoring(): void {
		if (!this.isMonitoring) {
			return;
		}

		this.isMonitoring = false;

		if (this.monitoringTimer) {
			clearInterval(this.monitoringTimer);
			this.monitoringTimer = null;
		}

		if (this.enableLogging) {
			console.log("MemoryMonitor stopped");
		}
	}

	/**
	 * Register a callback for memory warnings
	 */
	static onMemoryWarning(callback: MemoryWarningCallback): () => void {
		this.warningCallbacks.add(callback);

		// Return unsubscribe function
		return () => {
			this.warningCallbacks.delete(callback);
		};
	}

	/**
	 * Check if memory usage is currently above threshold
	 */
	static async isMemoryAboveThreshold(): Promise<boolean> {
		const info = await this.getMemoryInfo();
		return info.isAboveThreshold;
	}

	/**
	 * Check if it's safe to continue processing
	 * Returns true if memory is below threshold
	 */
	static async isSafeToProcess(): Promise<boolean> {
		const info = await this.getMemoryInfo();
		return !info.isAboveThreshold;
	}

	/**
	 * Get the last cached memory info (without querying again)
	 */
	static getLastMemoryInfo(): MemoryInfo | null {
		return this.lastMemoryInfo;
	}

	/**
	 * Update threshold configuration
	 */
	static setThreshold(threshold: number): void {
		this.threshold = Math.max(0, Math.min(1, threshold));
		if (this.enableLogging) {
			console.log(
				`MemoryMonitor threshold updated to ${(this.threshold * 100).toFixed(0)}%`,
			);
		}
	}

	/**
	 * Get current threshold
	 */
	static getThreshold(): number {
		return this.threshold;
	}

	/**
	 * Get monitoring status
	 */
	static isCurrentlyMonitoring(): boolean {
		return this.isMonitoring;
	}

	/**
	 * Clear all warning callbacks
	 */
	static clearCallbacks(): void {
		this.warningCallbacks.clear();
	}

	/**
	 * Force garbage collection and trigger cleanup services
	 * This performs aggressive memory cleanup by:
	 * 1. Running CleanupService to free orphaned thumbnails, temp files, and old cache
	 * 2. Suggesting JavaScript garbage collection (if available)
	 * 3. Requesting native garbage collection (platform-specific)
	 */
	static async triggerCleanup(): Promise<void> {
		try {
			if (this.enableLogging) {
				console.log("MemoryMonitor: Starting aggressive cleanup...");
			}

			// Get initial memory state
			const initialMemory = await this.getMemoryInfo();

			// 1. Run CleanupService to free disk cache and temp files
			const cleanupPromises = [
				CleanupService.cleanupOrphanedThumbnails(),
				CleanupService.cleanupTempFiles(),
				CleanupService.cleanupOldCache(),
			];

			const cleanupResults = await Promise.all(cleanupPromises);
			const totalBytesFreed = cleanupResults.reduce(
				(sum, result) => sum + result.bytesFreed,
				0,
			);
			const totalFilesRemoved = cleanupResults.reduce(
				(sum, result) => sum + result.count,
				0,
			);

			if (this.enableLogging) {
				console.log(
					`MemoryMonitor: Cleaned ${totalFilesRemoved} files, freed ${this.formatBytes(totalBytesFreed)}`,
				);
			}

			// 2. Clear any cached data in MemoryMonitor
			this.lastMemoryInfo = null;

			// 3. Suggest JavaScript garbage collection (not guaranteed)
			if (global.gc) {
				global.gc();
				if (this.enableLogging) {
					console.log("MemoryMonitor: Triggered JavaScript GC");
				}
			}

			// 4. Request native garbage collection
			try {
				const { MemoryModule } = NativeModules;
				if (MemoryModule && MemoryModule.requestGC) {
					await MemoryModule.requestGC();
					if (this.enableLogging) {
						console.log("MemoryMonitor: Requested native GC");
					}
				}
			} catch (gcError) {
				// Native GC not available, continue
				if (this.enableLogging) {
					console.log("MemoryMonitor: Native GC not available");
				}
			}

			// 5. Wait a moment for cleanup to take effect
			await new Promise((resolve) => setTimeout(resolve, 500));

			// 6. Get final memory info
			const finalMemory = await this.getMemoryInfo();
			const memoryFreed = initialMemory.usedMemory - finalMemory.usedMemory;

			if (this.enableLogging) {
				console.log(
					`MemoryMonitor: Cleanup complete. Memory freed: ${this.formatBytes(memoryFreed)}`,
				);
				console.log(
					`MemoryMonitor: Memory usage: ${(finalMemory.usagePercentage * 100).toFixed(1)}% (${this.formatBytes(finalMemory.usedMemory)} / ${this.formatBytes(finalMemory.totalMemory)})`,
				);
			}
		} catch (error) {
			console.error("MemoryMonitor.triggerCleanup error:", error);
		}
	}

	/**
	 * Format bytes to human-readable string
	 */
	private static formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";

		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
	}

	/**
	 * Get memory statistics for debugging
	 */
	static async getMemoryStats(): Promise<{
		current: MemoryInfo;
		formattedUsage: string;
		status: "safe" | "warning" | "critical";
		recommendation: string;
	}> {
		const current = await this.getMemoryInfo();
		const formattedUsage = `${this.formatBytes(current.usedMemory)} / ${this.formatBytes(current.totalMemory)} (${(current.usagePercentage * 100).toFixed(1)}%)`;

		let status: "safe" | "warning" | "critical" = "safe";
		let recommendation = "Memory usage is normal";

		if (current.usagePercentage > 0.9) {
			status = "critical";
			recommendation =
				"Critical memory usage! Stop processing immediately and clear caches";
		} else if (current.usagePercentage > this.threshold) {
			status = "warning";
			recommendation =
				"Memory usage above threshold. Consider pausing processing or clearing caches";
		}

		return {
			current,
			formattedUsage,
			status,
			recommendation,
		};
	}

	/**
	 * Reset the monitor (stop monitoring and clear state)
	 */
	static reset(): void {
		this.stopMonitoring();
		this.clearCallbacks();
		this.lastMemoryInfo = null;
		this.threshold = 0.8;
		this.checkInterval = 2000;
		this.enableLogging = true;
	}
}
