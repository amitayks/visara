package com.visara.backgroundtask;

import android.content.Intent;
import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;

import javax.annotation.Nullable;

/**
 * BackgroundScanService
 *
 * HeadlessJS service that runs JavaScript background tasks for media scanning.
 * This service is triggered by BackgroundScanWorker to run ProcessingOrchestrator
 * in the background without requiring the app to be in foreground.
 *
 * Usage from Worker:
 * ```java
 * Intent serviceIntent = new Intent(context, BackgroundScanService.class);
 * context.startService(serviceIntent);
 * ```
 *
 * Corresponding JavaScript:
 * ```js
 * import { AppRegistry } from 'react-native';
 * import { ProcessingOrchestrator } from '@services/orchestrator/ProcessingOrchestrator';
 *
 * AppRegistry.registerHeadlessTask('BackgroundMediaScan', () => async (taskData) => {
 *   await ProcessingOrchestrator.performInitialScan();
 * });
 * ```
 */
public class BackgroundScanService extends HeadlessJsTaskService {

    /**
     * Task name registered in JavaScript via AppRegistry.registerHeadlessTask
     */
    private static final String TASK_NAME = "BackgroundMediaScan";

    /**
     * Task timeout in milliseconds (10 minutes)
     * Background scan can take time depending on number of new media files
     */
    private static final long TASK_TIMEOUT = 600000;

    @Override
    protected @Nullable HeadlessJsTaskConfig getTaskConfig(Intent intent) {
        return new HeadlessJsTaskConfig(
            TASK_NAME,
            Arguments.createMap(),
            TASK_TIMEOUT,
            true // Allow task to run in foreground
        );
    }
}
