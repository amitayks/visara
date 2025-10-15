import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

// Register main app component
AppRegistry.registerComponent(appName, () => App);

/**
 * HeadlessJS Task: Background Media Scan
 *
 * Triggered by Android WorkManager (BackgroundScanWorker) to perform
 * background media scanning when app is not in foreground.
 *
 * Task Flow:
 * 1. WorkManager schedules periodic background scan (every 6 hours)
 * 2. BackgroundScanWorker triggers this HeadlessJS task
 * 3. ProcessingOrchestrator performs initial scan for new media
 * 4. Results are persisted to WatermelonDB
 *
 * NOTE: If a centralized BackgroundTaskManager is implemented in the future,
 * this registration should be moved there and the task should route through
 * that manager for unified background task coordination.
 *
 * Related files:
 * - android/app/src/main/java/com/visara/backgroundtask/BackgroundTaskModule.java
 * - android/app/src/main/java/com/visara/backgroundtask/BackgroundScanService.java
 * - src/services/orchestrator/ProcessingOrchestrator.ts
 */
AppRegistry.registerHeadlessTask('BackgroundMediaScan', () => async (taskData) => {
	try {
		console.log('[BackgroundMediaScan] Starting background media scan...');

		// Dynamically import to avoid loading during app startup
		const {ProcessingOrchestrator} = await import(
			'./src/services/orchestrator/ProcessingOrchestrator'
		);

		// Perform initial scan for new media files
		await ProcessingOrchestrator.performInitialScan();

		console.log('[BackgroundMediaScan] Background scan completed successfully');
	} catch (error) {
		console.error('[BackgroundMediaScan] Background scan failed:', error);
		// Don't throw - let WorkManager handle retry logic
	}
});
