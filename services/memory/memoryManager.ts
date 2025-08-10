import { NativeModules, DeviceEventEmitter } from 'react-native';
import RNFS from 'react-native-fs';
import { getHeapStatus } from '../../utils/heapMonitor';

export interface MemoryStatus {
  availableSystemMemory: number;
  totalSystemMemory: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  heapUsagePercent: number;
  systemMemoryPercent: number;
  isLowMemory: boolean;
  isCriticalMemory: boolean;
}

export interface TempFileInfo {
  path: string;
  size: number;
  createdAt: number;
  source: string;
}

class MemoryManager {
  private static instance: MemoryManager;
  
  private tempFiles = new Map<string, TempFileInfo>();
  private memoryPressureCallbacks = new Set<() => Promise<void>>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly heapUsageThreshold = 0.7; // 70% of max heap
  private readonly criticalHeapThreshold = 0.85; // 85% critical
  private readonly systemMemoryThreshold = 100 * 1024 * 1024; // 100MB minimum
  private readonly criticalSystemMemory = 50 * 1024 * 1024; // 50MB critical
  private isCleaningUp = false;
  private lastCleanupTime = 0;
  private readonly cleanupCooldown = 5000; // 5 seconds between cleanups

  private constructor() {
    this.setupLowMemoryListener();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private setupLowMemoryListener(): void {
    // Listen for system low memory warnings
    DeviceEventEmitter.addListener('lowMemory', () => {
      console.warn('[MemoryManager] System low memory warning received');
      this.handleLowMemory();
    });
  }

  /**
   * Register a temporary file for tracking and cleanup
   */
  registerTempFile(path: string, source: string = 'unknown', size: number = 0): void {
    if (!path) return;
    
    this.tempFiles.set(path, {
      path,
      size,
      createdAt: Date.now(),
      source
    });
    
    console.log(`[MemoryManager] Registered temp file: ${path} from ${source}`);
  }

  /**
   * Clean up a specific temporary file
   */
  async cleanTempFile(path: string): Promise<void> {
    if (!path || !this.tempFiles.has(path)) return;

    try {
      const exists = await RNFS.exists(path);
      if (exists) {
        await RNFS.unlink(path);
        console.log(`[MemoryManager] Deleted temp file: ${path}`);
      }
    } catch (error) {
      console.warn(`[MemoryManager] Failed to delete temp file ${path}:`, error);
    } finally {
      this.tempFiles.delete(path);
    }
  }

  /**
   * Clean all temporary files older than specified age
   */
  async cleanOldTempFiles(maxAgeMs: number = 60000): Promise<number> {
    const now = Date.now();
    const toDelete: string[] = [];
    let deletedCount = 0;

    for (const [path, info] of this.tempFiles.entries()) {
      if (now - info.createdAt > maxAgeMs) {
        toDelete.push(path);
      }
    }

    for (const path of toDelete) {
      await this.cleanTempFile(path);
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Emergency cleanup - aggressively free memory
   */
  async emergencyCleanup(): Promise<void> {
    // Prevent multiple simultaneous cleanups
    if (this.isCleaningUp) {
      console.log('[MemoryManager] Cleanup already in progress, skipping');
      return;
    }

    const now = Date.now();
    if (now - this.lastCleanupTime < this.cleanupCooldown) {
      console.log('[MemoryManager] Cleanup cooldown active, skipping');
      return;
    }

    this.isCleaningUp = true;
    this.lastCleanupTime = now;

    try {
      console.warn('[MemoryManager] Starting emergency cleanup');
      
      // 1. Clean all temp files
      const tempFileCount = this.tempFiles.size;
      const tempFilePaths = Array.from(this.tempFiles.keys());
      
      await Promise.all(
        tempFilePaths.map(path => this.cleanTempFile(path).catch(() => {}))
      );
      
      console.log(`[MemoryManager] Cleaned ${tempFileCount} temp files`);

      // 2. Trigger all registered cleanup callbacks
      const callbacks = Array.from(this.memoryPressureCallbacks);
      await Promise.all(
        callbacks.map(callback => 
          callback().catch(err => 
            console.error('[MemoryManager] Cleanup callback error:', err)
          )
        )
      );

      // 3. Clean temp directory
      await this.cleanTempDirectory();

      // 4. Suggest garbage collection
      if (global.gc) {
        global.gc();
        console.log('[MemoryManager] Triggered garbage collection');
      }

      console.log('[MemoryManager] Emergency cleanup completed');
    } catch (error) {
      console.error('[MemoryManager] Emergency cleanup error:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Clean the system temp directory
   */
  private async cleanTempDirectory(): Promise<void> {
    try {
      const tempDir = RNFS.TemporaryDirectoryPath;
      const files = await RNFS.readDir(tempDir);
      const now = Date.now();
      
      // Delete files older than 1 hour
      const maxAge = 60 * 60 * 1000;
      
      for (const file of files) {
        if (file.isFile()) {
          const age = now - (file.mtime?.getTime() || 0);
          if (age > maxAge) {
            try {
              await RNFS.unlink(file.path);
              console.log(`[MemoryManager] Deleted old temp file: ${file.name}`);
            } catch (err) {
              // Ignore errors for individual files
            }
          }
        }
      }
    } catch (error) {
      console.warn('[MemoryManager] Error cleaning temp directory:', error);
    }
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 10000): void {
    if (this.monitoringInterval) {
      return;
    }

    console.log('[MemoryManager] Starting memory monitoring');
    
    this.monitoringInterval = setInterval(async () => {
      const status = this.getMemoryStatus();
      
      if (status.isCriticalMemory) {
        console.error('[MemoryManager] CRITICAL memory state detected!');
        await this.emergencyCleanup();
      } else if (status.isLowMemory) {
        console.warn('[MemoryManager] Low memory detected');
        await this.handleLowMemory();
      }
      
      // Clean old temp files periodically
      if (this.tempFiles.size > 0) {
        const cleaned = await this.cleanOldTempFiles(5 * 60 * 1000); // 5 minutes
        if (cleaned > 0) {
          console.log(`[MemoryManager] Cleaned ${cleaned} old temp files`);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring memory usage
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[MemoryManager] Stopped memory monitoring');
    }
  }

  /**
   * Register a callback for memory pressure events
   */
  onMemoryPressure(callback: () => Promise<void>): () => void {
    this.memoryPressureCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.memoryPressureCallbacks.delete(callback);
    };
  }

  /**
   * Handle low memory conditions
   */
  private async handleLowMemory(): Promise<void> {
    // Clean files older than 1 minute
    await this.cleanOldTempFiles(60000);
    
    // Trigger memory pressure callbacks
    const callbacks = Array.from(this.memoryPressureCallbacks);
    await Promise.all(
      callbacks.map(callback => 
        callback().catch(err => 
          console.error('[MemoryManager] Memory pressure callback error:', err)
        )
      )
    );
  }

  /**
   * Get current memory status
   */
  getMemoryStatus(): MemoryStatus {
    const heap = getHeapStatus();
    
    // Get system memory (this would need native module in production)
    const systemMemory = this.getSystemMemory();
    
    const heapUsagePercent = heap.heapUsagePercent;
    const systemMemoryPercent = systemMemory.available / systemMemory.total;
    
    return {
      availableSystemMemory: systemMemory.available,
      totalSystemMemory: systemMemory.total,
      usedJSHeapSize: heap.usedJSHeapSize,
      totalJSHeapSize: heap.totalJSHeapSize,
      jsHeapSizeLimit: heap.jsHeapSizeLimit,
      heapUsagePercent,
      systemMemoryPercent,
      isLowMemory: 
        heapUsagePercent > this.heapUsageThreshold ||
        systemMemory.available < this.systemMemoryThreshold,
      isCriticalMemory:
        heapUsagePercent > this.criticalHeapThreshold ||
        systemMemory.available < this.criticalSystemMemory
    };
  }

  /**
   * Get system memory info (simplified - would need native module)
   */
  private getSystemMemory(): { available: number; total: number } {
    // In production, this would call a native module
    // For now, return mock values
    try {
      // Try to use react-native-device-info if available
      const DeviceInfo = NativeModules.RNDeviceInfo;
      if (DeviceInfo && DeviceInfo.getFreeDiskStorage) {
        return {
          available: 200 * 1024 * 1024, // Mock 200MB available
          total: 4 * 1024 * 1024 * 1024 // Mock 4GB total
        };
      }
    } catch (error) {
      // Fallback to mock values
    }
    
    return {
      available: 200 * 1024 * 1024, // 200MB
      total: 4 * 1024 * 1024 * 1024 // 4GB
    };
  }

  /**
   * Get statistics about temp files
   */
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
      bySource
    };
  }

  /**
   * Clear all tracking (for app shutdown)
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    await this.emergencyCleanup();
    this.memoryPressureCallbacks.clear();
  }
}

export const memoryManager = MemoryManager.getInstance();