import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { galleryScanner } from './GalleryScanner';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import { settingsStore } from '../../stores/settingsStore';

const BACKGROUND_SCAN_TASK = 'background-gallery-scan';

export class BackgroundScanner {
  async registerBackgroundTask() {
    try {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SCAN_TASK, {
        minimumInterval: 60 * 60, // 1 hour minimum
        stopOnTerminate: false,
        startOnBoot: true,
      });
      
      console.log('Background scan task registered');
    } catch (error) {
      console.error('Failed to register background task:', error);
    }
  }

  async unregisterBackgroundTask() {
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SCAN_TASK);
      console.log('Background scan task unregistered');
    } catch (error) {
      console.error('Failed to unregister background task:', error);
    }
  }

  async shouldRunScan(): Promise<boolean> {
    const { settings } = settingsStore.getState();
    
    // Check if auto-scan is enabled
    if (!settings.autoScan) {
      return false;
    }

    // Check WiFi requirement
    if (settings.scanWifiOnly) {
      const netInfo = await NetInfo.fetch();
      if (netInfo.type !== 'wifi') {
        console.log('Skipping scan: WiFi-only mode enabled and not on WiFi');
        return false;
      }
    }

    // Check battery level
    const batteryLevel = await Battery.getBatteryLevelAsync();
    const batteryThreshold = settings.batteryThreshold || 20;
    
    if (batteryLevel * 100 < batteryThreshold) {
      console.log(`Skipping scan: Battery level ${batteryLevel * 100}% below threshold ${batteryThreshold}%`);
      return false;
    }

    return true;
  }

  async runBackgroundScan() {
    const shouldRun = await this.shouldRunScan();
    if (!shouldRun) {
      return;
    }

    const { settings } = settingsStore.getState();
    
    try {
      console.log('Starting background gallery scan...');
      
      await galleryScanner.startScan({
        batchSize: 10, // Smaller batches for background processing
        wifiOnly: settings.scanWifiOnly,
        batteryThreshold: settings.batteryThreshold,
      });
      
      console.log('Background gallery scan completed');
    } catch (error) {
      console.error('Background scan failed:', error);
    }
  }

  async getBackgroundFetchStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
    return await BackgroundFetch.getStatusAsync();
  }

  async isTaskRegistered(): Promise<boolean> {
    const registeredTasks = await TaskManager.getRegisteredTasksAsync();
    return registeredTasks.some(task => task.taskName === BACKGROUND_SCAN_TASK);
  }
}

// Define the background task
TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
  try {
    const scanner = new BackgroundScanner();
    await scanner.runBackgroundScan();
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const backgroundScanner = new BackgroundScanner();