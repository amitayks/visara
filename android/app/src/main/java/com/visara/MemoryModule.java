package com.visara;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Debug;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

/**
 * Native module for Android memory monitoring
 *
 * Provides accurate memory usage information using Android's ActivityManager
 * and Debug APIs. This enables the app to monitor memory usage in real-time
 * and implement throttling when memory is above threshold (80%).
 *
 * Constitutional Alignment:
 * - Performance & Optimization Standards: Memory monitoring and overflow prevention
 * - Target: <200MB baseline, <500MB during processing
 */
public class MemoryModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public MemoryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "MemoryModule";
    }

    /**
     * Get current memory information
     *
     * Returns:
     * - totalMemory: Total RAM available to the app (in bytes)
     * - usedMemory: Memory currently used by the app (in bytes)
     * - freeMemory: Available memory (in bytes)
     * - nativeHeap: Native heap allocation (in bytes)
     * - maxMemory: Maximum memory the app can use (in bytes)
     */
    @ReactMethod
    public void getMemoryInfo(Promise promise) {
        try {
            // Get ActivityManager for system memory info
            ActivityManager activityManager = (ActivityManager) reactContext.getSystemService(Context.ACTIVITY_SERVICE);

            if (activityManager == null) {
                promise.reject("ERROR", "ActivityManager not available");
                return;
            }

            // Get memory info
            ActivityManager.MemoryInfo memoryInfo = new ActivityManager.MemoryInfo();
            activityManager.getMemoryInfo(memoryInfo);

            // Get app-specific memory info
            Runtime runtime = Runtime.getRuntime();
            long maxMemory = runtime.maxMemory(); // Max heap size
            long totalMemory = runtime.totalMemory(); // Current heap size
            long freeMemory = runtime.freeMemory(); // Free memory in current heap
            long usedMemory = totalMemory - freeMemory; // Used memory

            // Get native heap allocation
            long nativeHeap = Debug.getNativeHeapAllocatedSize();

            // Total used memory includes both Java heap and native heap
            long totalUsed = usedMemory + nativeHeap;

            WritableMap result = Arguments.createMap();
            result.putDouble("totalMemory", (double) maxMemory);
            result.putDouble("usedMemory", (double) totalUsed);
            result.putDouble("freeMemory", (double) (maxMemory - totalUsed));
            result.putDouble("nativeHeap", (double) nativeHeap);
            result.putDouble("maxMemory", (double) maxMemory);
            result.putDouble("systemAvailableMemory", (double) memoryInfo.availMem);
            result.putDouble("systemTotalMemory", (double) memoryInfo.totalMem);
            result.putBoolean("isLowMemory", memoryInfo.lowMemory);

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to get memory info: " + e.getMessage(), e);
        }
    }

    /**
     * Request garbage collection
     * Note: This is just a suggestion to the GC, not guaranteed to run immediately
     */
    @ReactMethod
    public void requestGC(Promise promise) {
        try {
            System.gc();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to request GC: " + e.getMessage(), e);
        }
    }
}
