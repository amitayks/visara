import { DeviceEventEmitter } from "react-native";
import RNFS from "react-native-fs";
import { nativeDeviceInfo } from "../../utils/nativeDeviceInfo";
import { nativeHeapMonitor, type MemoryPressureLevel } from "../../utils/nativeHeapMonitor";

export interface NativeMemoryStatus {
	// Device memory
	totalDeviceMemory: number;
	usedDeviceMemory: number;
	availableDeviceMemory: number;
	deviceMemoryUsagePercent: number;

	// App memory
	appMemoryUsage: number;
	appMemoryUsagePercent: number; // As % of device total
	jsHeapUsage: number;
	jsHeapUsagePercent: number;
	jsHeapLimit: number;

	// Status flags
	isLowMemory: boolean;
	isCriticalMemory: boolean;
	memoryPressureLevel: MemoryPressureLevel["level"];

	// Temp file info
	tempFileCount: number;
	tempFileSize: number;
}

export interface TempFileInfo {
	path: string;
	size: number;
	createdAt: number;
	source: string;
	lastAccessed?: number;
}

export interface MemoryReport {
	timestamp: Date;
	deviceInfo: {
		model: string;
		totalMemory: string;
		availableMemory: string;
		usedMemory: string;
		memoryPressure: string;
	};
	appMemory: {
		jsHeapUsage: string;
		jsHeapLimit: string;
		heapUsagePercent: string;
		appMemoryPercent: string;
	};
	tempFiles: {
		count: number;
		totalSize: string;
		oldestFile: string;
		sources: string[];
	};
	recommendations: string[];
}

export interface IntensiveOperationCheck {
	canProceed: boolean;
	reason?: string;
	recommendations?: string[];
	memoryStatus: NativeMemoryStatus;
}

type MemoryPressureCallback = (status: NativeMemoryStatus) => Promise<void>;

class NativeMemoryManager {
	private static instance: NativeMemoryManager;

	private tempFiles = new Map<string, TempFileInfo>();
	private memoryPressureCallbacks = new Set<MemoryPressureCallback>();
	private monitoringInterval: NodeJS.Timeout | null = null;
	private isCleaningUp = false;
	private lastCleanupTime = 0;
	private readonly cleanupCooldown = 3000; // 3 seconds between cleanups
	
	// Enhanced memory thresholds
	private readonly LOW_MEMORY_THRESHOLD_MB = 200; // 200MB available
	private readonly CRITICAL_MEMORY_THRESHOLD_MB = 100; // 100MB available
	private readonly LOW_MEMORY_PERCENTAGE = 0.15; // 15% available
	private readonly CRITICAL_MEMORY_PERCENTAGE = 0.08; // 8% available
	
	// App memory thresholds (as % of total device memory)
	private readonly APP_MEMORY_WARNING_PERCENTAGE = 0.3; // 30%
	private readonly APP_MEMORY_CRITICAL_PERCENTAGE = 0.5; // 50%
	
	// JS Heap thresholds
	private readonly JS_HEAP_WARNING_PERCENTAGE = 0.7; // 70%
	private readonly JS_HEAP_CRITICAL_PERCENTAGE = 0.85; // 85%

	private constructor() {
		this.setupMemoryListeners();
		this.initialize().catch((err) =>
			console.error("[NativeMemoryManager] Initialization error:", err)
		);
	}

	static getInstance(): NativeMemoryManager {
		if (!NativeMemoryManager.instance) {
			NativeMemoryManager.instance = new NativeMemoryManager();
		}
		return NativeMemoryManager.instance;
	}

	private setupMemoryListeners(): void {
		// Listen for system low memory warnings
		DeviceEventEmitter.addListener("lowMemory", () => {
			console.warn("[NativeMemoryManager] System low memory warning received");
			this.handleSystemLowMemory();
		});

		// Listen for memory pressure changes from heap monitor
		nativeHeapMonitor.addPressureListener((pressure) => {
			this.handleMemoryPressure(pressure);
		});
	}

	private async handleSystemLowMemory(): Promise<void> {
		const status = await this.getMemoryStatus();
		console.warn("[NativeMemoryManager] System low memory - triggering emergency cleanup");
		await this.emergencyCleanup();
		this.notifyCallbacks(status);
	}

	private async handleMemoryPressure(pressure: MemoryPressureLevel): Promise<void> {
		const status = await this.getMemoryStatus();
		
		if (pressure.action === "emergency" || pressure.action === "aggressive_cleanup") {
			console.warn(`[NativeMemoryManager] Memory pressure: ${pressure.level} - ${pressure.message}`);
			if (pressure.action === "emergency") {
				await this.emergencyCleanup();
			} else {
				await this.aggressiveCleanup();
			}
			this.notifyCallbacks(status);
		} else if (pressure.action === "cleanup") {
			console.log(`[NativeMemoryManager] Memory pressure: ${pressure.level} - performing cleanup`);
			await this.normalCleanup();
		}
	}

	private notifyCallbacks(status: NativeMemoryStatus): void {
		this.memoryPressureCallbacks.forEach((callback) => {
			callback(status).catch((error) =>
				console.error("[NativeMemoryManager] Callback error:", error)
			);
		});
	}

	async getMemoryStatus(): Promise<NativeMemoryStatus> {
		try {
			const [heapStatus, deviceMemory] = await Promise.all([
				nativeHeapMonitor.getHeapStatus(),
				nativeDeviceInfo.getMemoryInfo(),
			]);

			const pressureLevel = await nativeHeapMonitor.getMemoryPressureLevel();

			// Calculate thresholds
			const lowMemoryThreshold = Math.max(
				this.LOW_MEMORY_THRESHOLD_MB * 1024 * 1024,
				deviceMemory.totalMemory * this.LOW_MEMORY_PERCENTAGE
			);

			const criticalMemoryThreshold = Math.max(
				this.CRITICAL_MEMORY_THRESHOLD_MB * 1024 * 1024,
				deviceMemory.totalMemory * this.CRITICAL_MEMORY_PERCENTAGE
			);

			const isLowMemory = deviceMemory.availableMemory < lowMemoryThreshold;
			const isCriticalMemory = deviceMemory.availableMemory < criticalMemoryThreshold;

			// Calculate temp file stats
			let tempFileSize = 0;
			for (const info of this.tempFiles.values()) {
				tempFileSize += info.size;
			}

			return {
				totalDeviceMemory: heapStatus.totalDeviceMemory,
				usedDeviceMemory: heapStatus.usedDeviceMemory,
				availableDeviceMemory: heapStatus.availableDeviceMemory,
				deviceMemoryUsagePercent: heapStatus.deviceMemoryUsagePercent,
				appMemoryUsage: heapStatus.usedJSHeapSize,
				appMemoryUsagePercent: heapStatus.appMemoryUsagePercent,
				jsHeapUsage: heapStatus.usedJSHeapSize,
				jsHeapUsagePercent: heapStatus.heapUsagePercent,
				jsHeapLimit: heapStatus.jsHeapSizeLimit,
				isLowMemory,
				isCriticalMemory,
				memoryPressureLevel: pressureLevel.level,
				tempFileCount: this.tempFiles.size,
				tempFileSize,
			};
		} catch (error) {
			console.error("[NativeMemoryManager] Error getting memory status:", error);
			
			// Return safe defaults
			return {
				totalDeviceMemory: 4 * 1024 * 1024 * 1024,
				usedDeviceMemory: 2 * 1024 * 1024 * 1024,
				availableDeviceMemory: 2 * 1024 * 1024 * 1024,
				deviceMemoryUsagePercent: 50,
				appMemoryUsage: 256 * 1024 * 1024,
				appMemoryUsagePercent: 6.25,
				jsHeapUsage: 256 * 1024 * 1024,
				jsHeapUsagePercent: 50,
				jsHeapLimit: 512 * 1024 * 1024,
				isLowMemory: false,
				isCriticalMemory: false,
				memoryPressureLevel: "normal",
				tempFileCount: this.tempFiles.size,
				tempFileSize: 0,
			};
		}
	}

	async canHandleIntensiveOperation(
		expectedMemoryUsage: number = 50 * 1024 * 1024 // 50MB default
	): Promise<IntensiveOperationCheck> {
		const status = await this.getMemoryStatus();
		const recommendations: string[] = [];

		// Check if we're already in critical state
		if (status.isCriticalMemory) {
			return {
				canProceed: false,
				reason: "Critical memory state - cannot perform intensive operations",
				recommendations: ["Wait for memory to be freed", "Close other apps"],
				memoryStatus: status,
			};
		}

		// Check if intensive operation would push us into critical state
		const memoryAfterOperation = status.availableDeviceMemory - expectedMemoryUsage;
		const criticalThreshold = Math.max(
			this.CRITICAL_MEMORY_THRESHOLD_MB * 1024 * 1024,
			status.totalDeviceMemory * this.CRITICAL_MEMORY_PERCENTAGE
		);

		if (memoryAfterOperation < criticalThreshold) {
			recommendations.push("Consider reducing operation scope");
			recommendations.push("Perform cleanup before operation");
			
			if (status.tempFileCount > 0) {
				recommendations.push(`Clean ${status.tempFileCount} temp files first`);
			}

			return {
				canProceed: false,
				reason: `Operation would consume too much memory (${nativeHeapMonitor.formatBytes(expectedMemoryUsage)} needed, ${nativeHeapMonitor.formatBytes(memoryAfterOperation)} would remain)`,
				recommendations,
				memoryStatus: status,
			};
		}

		// Check heap pressure
		if (status.jsHeapUsagePercent > this.JS_HEAP_WARNING_PERCENTAGE * 100) {
			recommendations.push("High JS heap usage - consider triggering GC");
		}

		// Check app memory usage
		if (status.appMemoryUsagePercent > this.APP_MEMORY_WARNING_PERCENTAGE * 100) {
			recommendations.push("High app memory usage - monitor closely");
		}

		// Provide recommendations even if we can proceed
		if (status.isLowMemory) {
			recommendations.push("Low memory detected - monitor operation closely");
		}

		return {
			canProceed: true,
			recommendations: recommendations.length > 0 ? recommendations : undefined,
			memoryStatus: status,
		};
	}

	async getMemoryReport(): Promise<MemoryReport> {
		const status = await this.getMemoryStatus();
		const deviceInfo = await nativeDeviceInfo.getDeviceState();
		
		// Get temp file stats
		const tempStats = this.getTempFileStats();
		const sources = Array.from(new Set(Array.from(this.tempFiles.values()).map(f => f.source)));
		
		// Generate recommendations
		const recommendations: string[] = [];
		
		if (status.isCriticalMemory) {
			recommendations.push("CRITICAL: Immediately free memory - close apps, clear caches");
		} else if (status.isLowMemory) {
			recommendations.push("Low memory: Consider cleaning temp files and caches");
		}
		
		if (status.jsHeapUsagePercent > this.JS_HEAP_WARNING_PERCENTAGE * 100) {
			recommendations.push("High JS heap usage: Trigger garbage collection");
		}
		
		if (status.tempFileCount > 50) {
			recommendations.push(`Many temp files (${status.tempFileCount}): Clean old files`);
		}
		
		if (status.appMemoryUsagePercent > this.APP_MEMORY_WARNING_PERCENTAGE * 100) {
			recommendations.push("High app memory usage: Review memory-intensive operations");
		}

		return {
			timestamp: new Date(),
			deviceInfo: {
				model: deviceInfo.deviceModel,
				totalMemory: nativeHeapMonitor.formatBytes(status.totalDeviceMemory),
				availableMemory: nativeHeapMonitor.formatBytes(status.availableDeviceMemory),
				usedMemory: nativeHeapMonitor.formatBytes(status.usedDeviceMemory),
				memoryPressure: status.memoryPressureLevel,
			},
			appMemory: {
				jsHeapUsage: nativeHeapMonitor.formatBytes(status.jsHeapUsage),
				jsHeapLimit: nativeHeapMonitor.formatBytes(status.jsHeapLimit),
				heapUsagePercent: `${status.jsHeapUsagePercent.toFixed(1)}%`,
				appMemoryPercent: `${status.appMemoryUsagePercent.toFixed(1)}%`,
			},
			tempFiles: {
				count: tempStats.count,
				totalSize: nativeHeapMonitor.formatBytes(tempStats.totalSize),
				oldestFile: tempStats.oldestAge > 0 ? `${Math.round(tempStats.oldestAge / 1000 / 60)} minutes` : "N/A",
				sources,
			},
			recommendations,
		};
	}

	// Temp file management
	registerTempFile(
		path: string,
		source: string = "unknown",
		size: number = 0
	): void {
		if (!path) return;

		this.tempFiles.set(path, {
			path,
			size,
			createdAt: Date.now(),
			source,
			lastAccessed: Date.now(),
		});

		console.log(`[NativeMemoryManager] Registered temp file: ${path} (${nativeHeapMonitor.formatBytes(size)}) from ${source}`);
	}

	async cleanTempFile(path: string): Promise<void> {
		if (!path || !this.tempFiles.has(path)) return;

		try {
			const info = this.tempFiles.get(path);
			const exists = await RNFS.exists(path);
			if (exists) {
				const stat = await RNFS.stat(path);
				await RNFS.unlink(path);
				console.log(`[NativeMemoryManager] Deleted temp file: ${path} (${nativeHeapMonitor.formatBytes(stat.size)})`);
			}
		} catch (error) {
			console.warn(`[NativeMemoryManager] Failed to delete temp file ${path}:`, error);
		} finally {
			this.tempFiles.delete(path);
		}
	}

	async cleanOldTempFiles(maxAgeMs: number = 60000): Promise<number> {
		const now = Date.now();
		const toDelete: string[] = [];

		for (const [path, info] of this.tempFiles.entries()) {
			if (now - info.createdAt > maxAgeMs) {
				toDelete.push(path);
			}
		}

		for (const path of toDelete) {
			await this.cleanTempFile(path);
		}

		return toDelete.length;
	}

	// Cleanup methods
	async normalCleanup(): Promise<void> {
		if (this.isCleaningUp) return;
		
		const now = Date.now();
		if (now - this.lastCleanupTime < this.cleanupCooldown) {
			console.log("[NativeMemoryManager] Cleanup cooldown active");
			return;
		}

		this.isCleaningUp = true;
		this.lastCleanupTime = now;

		try {
			console.log("[NativeMemoryManager] Starting normal cleanup");
			
			// Clean files older than 2 minutes
			const cleaned = await this.cleanOldTempFiles(2 * 60 * 1000);
			if (cleaned > 0) {
				console.log(`[NativeMemoryManager] Cleaned ${cleaned} old temp files`);
			}

			// Try to trigger GC
			await nativeHeapMonitor.tryGarbageCollection();

		} catch (error) {
			console.error("[NativeMemoryManager] Normal cleanup error:", error);
		} finally {
			this.isCleaningUp = false;
		}
	}

	async aggressiveCleanup(): Promise<void> {
		if (this.isCleaningUp) return;

		this.isCleaningUp = true;
		this.lastCleanupTime = Date.now();

		try {
			console.warn("[NativeMemoryManager] Starting aggressive cleanup");
			
			// Clean files older than 30 seconds
			const cleaned = await this.cleanOldTempFiles(30 * 1000);
			console.log(`[NativeMemoryManager] Aggressively cleaned ${cleaned} temp files`);

			// Clean temp directories
			await this.cleanTempDirectories(5 * 60 * 1000); // 5 minutes

			// Trigger all registered cleanup callbacks
			const callbacks = Array.from(this.memoryPressureCallbacks);
			const memoryStatus = await this.getMemoryStatus();
			await Promise.all(
				callbacks.map((callback) =>
					callback(memoryStatus).catch((err) =>
						console.error("[NativeMemoryManager] Aggressive cleanup callback error:", err)
					)
				)
			);

			// Force GC
			await nativeHeapMonitor.tryGarbageCollection();

		} catch (error) {
			console.error("[NativeMemoryManager] Aggressive cleanup error:", error);
		} finally {
			this.isCleaningUp = false;
		}
	}

	async emergencyCleanup(): Promise<void> {
		// Emergency cleanup bypasses cooldown
		this.isCleaningUp = true;
		this.lastCleanupTime = Date.now();

		try {
			console.error("[NativeMemoryManager] Starting emergency cleanup");

			// Clean ALL temp files immediately
			const allPaths = Array.from(this.tempFiles.keys());
			await Promise.all(
				allPaths.map((path) => this.cleanTempFile(path).catch(() => {}))
			);
			console.log(`[NativeMemoryManager] Emergency cleaned ${allPaths.length} temp files`);

			// Clean all temp directories aggressively
			await this.cleanTempDirectories(0); // Clean all files

			// Trigger all callbacks immediately
			const callbacks = Array.from(this.memoryPressureCallbacks);
			const memoryStatus = await this.getMemoryStatus();
			await Promise.all(
				callbacks.map((callback) =>
					callback(memoryStatus).catch((err) =>
						console.error("[NativeMemoryManager] Emergency cleanup callback error:", err)
					)
				)
			);

			// Force multiple GC attempts
			for (let i = 0; i < 3; i++) {
				await nativeHeapMonitor.tryGarbageCollection();
				await new Promise(resolve => setTimeout(resolve, 100));
			}

		} catch (error) {
			console.error("[NativeMemoryManager] Emergency cleanup error:", error);
		} finally {
			this.isCleaningUp = false;
		}
	}

	private async cleanTempDirectories(maxAge: number): Promise<void> {
		const tempDirs = [
			RNFS.TemporaryDirectoryPath,
			`${RNFS.CachesDirectoryPath}/preprocessed/`,
			`${RNFS.CachesDirectoryPath}/hybrid_preprocessed/`,
			`${RNFS.DocumentDirectoryPath}/.temp/`,
		];

		const now = Date.now();

		for (const dir of tempDirs) {
			try {
				if (await RNFS.exists(dir)) {
					const files = await RNFS.readDir(dir);
					let cleanedCount = 0;

					for (const file of files) {
						if (file.isFile()) {
							const age = now - (file.mtime?.getTime() || 0);
							if (age > maxAge) {
								try {
									await RNFS.unlink(file.path);
									cleanedCount++;
								} catch (e) {
									// Ignore individual file errors
								}
							}
						}
					}

					if (cleanedCount > 0) {
						console.log(`[NativeMemoryManager] Cleaned ${cleanedCount} files from ${dir}`);
					}
				}
			} catch (e) {
				console.warn(`[NativeMemoryManager] Error cleaning directory ${dir}:`, e);
			}
		}
	}

	// Monitoring
	startMonitoring(intervalMs: number = 5000): void {
		if (this.monitoringInterval) return;

		console.log("[NativeMemoryManager] Starting memory monitoring");
		
		// Start heap monitoring
		nativeHeapMonitor.startMonitoring(intervalMs);

		this.monitoringInterval = setInterval(async () => {
			try {
				const status = await this.getMemoryStatus();
				
				// Clean old temp files periodically
				if (this.tempFiles.size > 0) {
					const cleaned = await this.cleanOldTempFiles(10 * 60 * 1000); // 10 minutes
					if (cleaned > 0) {
						console.log(`[NativeMemoryManager] Periodic cleanup: removed ${cleaned} old temp files`);
					}
				}
				
				// Log memory status periodically
				if (status.isLowMemory) {
					console.warn(`[NativeMemoryManager] Low memory: ${nativeHeapMonitor.formatBytes(status.availableDeviceMemory)} available`);
				}
				
			} catch (error) {
				console.error("[NativeMemoryManager] Monitoring error:", error);
			}
		}, intervalMs * 2); // Check twice less frequently than heap monitor
	}

	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = null;
		}
		nativeHeapMonitor.stopMonitoring();
		console.log("[NativeMemoryManager] Stopped memory monitoring");
	}

	// Event registration
	registerMemoryPressureCallback(callback: MemoryPressureCallback): () => void {
		this.memoryPressureCallbacks.add(callback);
		return () => {
			this.memoryPressureCallbacks.delete(callback);
		};
	}

	// Utility methods
	getTempFileStats(): {
		count: number;
		totalSize: number;
		oldestAge: number;
		bySource: Map<string, number>;
	} {
		const now = Date.now();
		let totalSize = 0;
		let oldestAge = 0;
		const bySource = new Map<string, number>();

		for (const info of this.tempFiles.values()) {
			totalSize += info.size;
			const age = now - info.createdAt;
			if (age > oldestAge) oldestAge = age;

			const count = bySource.get(info.source) || 0;
			bySource.set(info.source, count + 1);
		}

		return {
			count: this.tempFiles.size,
			totalSize,
			oldestAge,
			bySource,
		};
	}

	async initialize(): Promise<void> {
		console.log("[NativeMemoryManager] Initializing native memory manager");
		
		// Clean temp directories on startup
		await this.cleanTempDirectories(0); // Clean all files on startup
		
		console.log("[NativeMemoryManager] Initialization complete");
	}

	async shutdown(): Promise<void> {
		this.stopMonitoring();
		await this.emergencyCleanup();
		this.memoryPressureCallbacks.clear();
		console.log("[NativeMemoryManager] Shutdown complete");
	}
}

export const nativeMemoryManager = NativeMemoryManager.getInstance();