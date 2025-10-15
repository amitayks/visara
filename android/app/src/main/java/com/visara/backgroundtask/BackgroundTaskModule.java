package com.visara.backgroundtask;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

import java.util.concurrent.TimeUnit;

/**
 * BackgroundTaskModule
 *
 * Provides background task scheduling using Android WorkManager for periodic tasks
 * like media scanning, cleanup, and ML processing when app is in background.
 *
 * Per spec FR-078: "System MUST support background processing for media scanning"
 * Per spec NFR-015: "System MUST use WorkManager for reliable background tasks"
 *
 * Features:
 * - Schedule periodic background scan (every 6 hours)
 * - Schedule periodic cleanup (every 24 hours)
 * - Battery and network constraints
 * - Survives app restart and device reboot
 *
 * Usage from JavaScript:
 * ```js
 * import { NativeModules } from 'react-native';
 * const { BackgroundTaskModule } = NativeModules;
 *
 * // Schedule background scan
 * await BackgroundTaskModule.scheduleBackgroundScan(6); // hours
 *
 * // Schedule cleanup
 * await BackgroundTaskModule.scheduleCleanup(24); // hours
 *
 * // Cancel all tasks
 * await BackgroundTaskModule.cancelAllTasks();
 * ```
 */
@ReactModule(name = BackgroundTaskModule.NAME)
public class BackgroundTaskModule extends ReactContextBaseJavaModule {
    public static final String NAME = "BackgroundTaskModule";

    // Work tags
    private static final String WORK_TAG_SCAN = "visara_background_scan";
    private static final String WORK_TAG_CLEANUP = "visara_cleanup";

    // Default intervals
    private static final long DEFAULT_SCAN_INTERVAL_HOURS = 6;
    private static final long DEFAULT_CLEANUP_INTERVAL_HOURS = 24;

    private final ReactApplicationContext reactContext;

    public BackgroundTaskModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    /**
     * Schedule periodic background media scan
     *
     * @param intervalHours Interval between scans in hours (minimum 1 hour for WorkManager)
     * @param promise Promise resolved when scheduled
     */
    @ReactMethod
    public void scheduleBackgroundScan(int intervalHours, Promise promise) {
        try {
            // Ensure minimum interval (WorkManager requires at least 15 minutes, but we use 1 hour minimum)
            if (intervalHours < 1) {
                intervalHours = 1;
            }

            // Define constraints
            Constraints constraints = new Constraints.Builder()
                    .setRequiresBatteryNotLow(true) // Only run when battery not low
                    .setRequiresDeviceIdle(false)    // Can run when device active
                    .setRequiresCharging(false)      // Can run on battery
                    .setRequiredNetworkType(NetworkType.NOT_REQUIRED) // No network needed (on-device)
                    .build();

            // Create periodic work request
            PeriodicWorkRequest scanWorkRequest = new PeriodicWorkRequest.Builder(
                    BackgroundScanWorker.class,
                    intervalHours,
                    TimeUnit.HOURS
            )
                    .setConstraints(constraints)
                    .addTag(WORK_TAG_SCAN)
                    .build();

            // Schedule work (replace existing if any)
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.enqueueUniquePeriodicWork(
                    WORK_TAG_SCAN,
                    ExistingPeriodicWorkPolicy.REPLACE,
                    scanWorkRequest
            );

            promise.resolve("Background scan scheduled (every " + intervalHours + " hours)");
        } catch (Exception e) {
            promise.reject("SCHEDULE_ERROR", "Failed to schedule background scan: " + e.getMessage(), e);
        }
    }

    /**
     * Schedule periodic cleanup task
     *
     * @param intervalHours Interval between cleanups in hours (minimum 1 hour)
     * @param promise Promise resolved when scheduled
     */
    @ReactMethod
    public void scheduleCleanup(int intervalHours, Promise promise) {
        try {
            if (intervalHours < 1) {
                intervalHours = 1;
            }

            Constraints constraints = new Constraints.Builder()
                    .setRequiresBatteryNotLow(true)
                    .setRequiresDeviceIdle(true) // Cleanup when device idle
                    .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                    .build();

            PeriodicWorkRequest cleanupWorkRequest = new PeriodicWorkRequest.Builder(
                    CleanupWorker.class,
                    intervalHours,
                    TimeUnit.HOURS
            )
                    .setConstraints(constraints)
                    .addTag(WORK_TAG_CLEANUP)
                    .build();

            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.enqueueUniquePeriodicWork(
                    WORK_TAG_CLEANUP,
                    ExistingPeriodicWorkPolicy.REPLACE,
                    cleanupWorkRequest
            );

            promise.resolve("Cleanup scheduled (every " + intervalHours + " hours)");
        } catch (Exception e) {
            promise.reject("SCHEDULE_ERROR", "Failed to schedule cleanup: " + e.getMessage(), e);
        }
    }

    /**
     * Cancel background scan task
     */
    @ReactMethod
    public void cancelBackgroundScan(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.cancelAllWorkByTag(WORK_TAG_SCAN);
            promise.resolve("Background scan cancelled");
        } catch (Exception e) {
            promise.reject("CANCEL_ERROR", "Failed to cancel background scan: " + e.getMessage(), e);
        }
    }

    /**
     * Cancel cleanup task
     */
    @ReactMethod
    public void cancelCleanup(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.cancelAllWorkByTag(WORK_TAG_CLEANUP);
            promise.resolve("Cleanup cancelled");
        } catch (Exception e) {
            promise.reject("CANCEL_ERROR", "Failed to cancel cleanup: " + e.getMessage(), e);
        }
    }

    /**
     * Cancel all background tasks
     */
    @ReactMethod
    public void cancelAllTasks(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.cancelAllWorkByTag(WORK_TAG_SCAN);
            workManager.cancelAllWorkByTag(WORK_TAG_CLEANUP);
            promise.resolve("All tasks cancelled");
        } catch (Exception e) {
            promise.reject("CANCEL_ERROR", "Failed to cancel tasks: " + e.getMessage(), e);
        }
    }

    /**
     * Check if background scan is scheduled
     */
    @ReactMethod
    public void isBackgroundScanScheduled(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            boolean isScheduled = !workManager.getWorkInfosByTag(WORK_TAG_SCAN).get().isEmpty();
            promise.resolve(isScheduled);
        } catch (Exception e) {
            promise.reject("CHECK_ERROR", "Failed to check scan status: " + e.getMessage(), e);
        }
    }


    /**
     * Worker for background media scan
     *
     * Triggers ProcessingOrchestrator via HeadlessJS to perform background media scanning.
     * This allows the app to scan for new media even when not in foreground.
     */
    public static class BackgroundScanWorker extends Worker {
        public BackgroundScanWorker(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                android.util.Log.d("BackgroundScanWorker", "Background scan triggered");

                // Trigger HeadlessJS task to run ProcessingOrchestrator
                // HeadlessJS allows JS code to run in background without UI
                com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(getApplicationContext());

                android.content.Intent serviceIntent = new android.content.Intent(
                    getApplicationContext(),
                    BackgroundScanService.class
                );
                getApplicationContext().startService(serviceIntent);

                android.util.Log.d("BackgroundScanWorker", "Background scan service started");
                return Result.success();
            } catch (Exception e) {
                android.util.Log.e("BackgroundScanWorker", "Background scan failed", e);
                return Result.retry();
            }
        }
    }

    /**
     * Worker for cleanup tasks
     */
    public static class CleanupWorker extends Worker {
        public CleanupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                // TODO: Implement actual cleanup logic
                // Should call CleanupService or equivalent

                android.util.Log.d("CleanupWorker", "Cleanup triggered");

                return Result.success();
            } catch (Exception e) {
                android.util.Log.e("CleanupWorker", "Cleanup failed", e);
                return Result.retry();
            }
        }
    }
}
