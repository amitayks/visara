import { AppState, AppStateStatus } from 'react-native';
import { memoryManager } from './memoryManager';
import { unifiedImageCache } from '../cache/unifiedImageCache';

/**
 * Initialize comprehensive memory management for the app
 * Call this in your App.tsx or index.js
 */
export function initializeMemoryManagement(): void {
  console.log('[MemoryManagement] Initializing memory management system');

  // Register global error handler for memory issues
  setupMemoryErrorHandling();

  // Register app state listener for cleanup
  setupAppStateListener();

  // Register emergency cleanup handlers for all caches
  registerCacheCleanupHandlers();

  // Start periodic memory monitoring - CHECK EVERY 2 SECONDS during active processing
  memoryManager.startMonitoring(2000); // Check every 2 seconds

  console.log('[MemoryManagement] Memory management initialized');
}

/**
 * Setup error handling for out of memory errors
 */
function setupMemoryErrorHandling(): void {
  const originalHandler = ErrorUtils.getGlobalHandler();
  
  ErrorUtils.setGlobalHandler(async (error, isFatal) => {
    // Check if it's a memory-related error
    if (isMemoryError(error)) {
      console.error('[MemoryManagement] Memory error detected:', error);
      
      // Try emergency cleanup
      try {
        await memoryManager.emergencyCleanup();
        console.log('[MemoryManagement] Emergency cleanup completed after error');
      } catch (cleanupError) {
        console.error('[MemoryManagement] Emergency cleanup failed:', cleanupError);
      }
    }
    
    // Call original handler
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

/**
 * Check if an error is memory-related
 */
function isMemoryError(error: Error): boolean {
  const message = error.message?.toLowerCase() || '';
  const stack = error.stack?.toLowerCase() || '';
  
  return (
    message.includes('memory') ||
    message.includes('heap') ||
    message.includes('allocation') ||
    message.includes('oom') ||
    stack.includes('memory') ||
    stack.includes('heap')
  );
}

/**
 * Setup app state listener for memory cleanup
 */
function setupAppStateListener(): void {
  let lastAppState: AppStateStatus = AppState.currentState;

  AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
    // When app goes to background
    if (lastAppState === 'active' && nextAppState.match(/inactive|background/)) {
      console.log('[MemoryManagement] App going to background, cleaning up');
      
      // Clean old temp files
      await memoryManager.cleanOldTempFiles(5 * 60 * 1000); // 5 minutes
      
      // Reduce cache sizes
      await unifiedImageCache.trimToSize(unifiedImageCache.getSizeInfo().max * 0.5);
    }
    
    // When app comes to foreground
    if (lastAppState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('[MemoryManagement] App coming to foreground');
      
      // Check memory status
      const status = memoryManager.getMemoryStatus();
      if (status.isLowMemory) {
        console.warn('[MemoryManagement] Low memory on app resume');
        await memoryManager.emergencyCleanup();
      }
    }
    
    lastAppState = nextAppState;
  });
}

/**
 * Register cleanup handlers for all cache systems
 */
function registerCacheCleanupHandlers(): void {
  // Register unified image cache cleanup
  memoryManager.onMemoryPressure(async () => {
    console.log('[MemoryManagement] Memory pressure - cleaning image cache');
    await unifiedImageCache.handleMemoryPressure();
  });

  // Register cleanup for any other caches
  // Add more handlers here as needed
}

/**
 * Cleanup function to call when app is terminating
 */
export async function shutdownMemoryManagement(): Promise<void> {
  console.log('[MemoryManagement] Shutting down memory management');
  
  try {
    // Stop monitoring
    memoryManager.stopMonitoring();
    
    // Final cleanup
    await memoryManager.shutdown();
    
    // Clear all caches
    await unifiedImageCache.clearAll();
    
    console.log('[MemoryManagement] Memory management shutdown complete');
  } catch (error) {
    console.error('[MemoryManagement] Error during shutdown:', error);
  }
}

/**
 * Get memory statistics for debugging
 */
export function getMemoryStats(): {
  memory: ReturnType<typeof memoryManager.getMemoryStatus>;
  tempFiles: ReturnType<typeof memoryManager.getTempFileStats>;
  cache: ReturnType<typeof unifiedImageCache.getStats>;
} {
  return {
    memory: memoryManager.getMemoryStatus(),
    tempFiles: memoryManager.getTempFileStats(),
    cache: unifiedImageCache.getStats()
  };
}

/**
 * Force a memory cleanup (for debugging/testing)
 */
export async function forceMemoryCleanup(): Promise<void> {
  console.log('[MemoryManagement] Forcing memory cleanup');
  await memoryManager.emergencyCleanup();
}