# Background Scanner Crash Fix Summary

## Problem
The app was crashing when navigating to the Settings page after accepting gallery permissions. The crash occurred specifically when the background service tried to start.

## Root Causes
1. **Android Permission Revocation Behavior**: When permissions are granted/revoked while the app is running, Android may restart the app's process.
2. **Background Service Starting Too Early**: The background service was trying to start immediately after permission is granted, before the app is fully ready.
3. **Infinite Promise in Background Task**: The background task used an infinite Promise that never resolved, causing memory issues.
4. **Missing Android Manifest Configuration**: The app was missing proper foreground service declarations for newer Android versions.

## Fixes Applied

### 1. Android Manifest Updates
**File**: `android/app/src/main/AndroidManifest.xml`
- Added missing permissions:
  - `RECEIVE_BOOT_COMPLETED`
  - `POST_NOTIFICATIONS`
  - `FOREGROUND_SERVICE_DATA_SYNC`
- Updated service declaration with proper attributes:
  - `android:exported="false"`
  - `android:foregroundServiceType="dataSync"`

### 2. Background Scanner Fixes
**File**: `services/gallery/backgroundScanner.ts`
- Replaced infinite Promise with controlled loop
- Added `shouldStop` flag for clean shutdown
- Implemented `sleep` function for proper async delays
- Fixed the background task to properly exit when service stops
- Added better error handling and logging

### 3. Settings Screen Safety Improvements
**File**: `app/(tabs)/settings.tsx`
- Added 2-second delay before starting background service
- Added app state checks before starting service
- Re-verify permissions before starting background service
- Added proper error handling with user-friendly alerts
- Prevented duplicate start attempts

### 4. Permission Change Handler
**File**: `utils/permissionChangeHandler.ts` (new file)
- Monitors app state changes
- Detects permission changes when app returns to foreground
- Handles Android app restarts due to permission changes
- Safely reinitializes services after permission changes
- Saves crash reasons for debugging

### 5. App Entry Point Updates
**File**: `index.js`
- Added global error handler to catch crashes
- Implemented unhandled promise rejection handler
- Saves crash reasons to AsyncStorage for next launch
- Initializes permission change handler on app start

## Key Changes Summary

1. **Fixed Infinite Promise**: The background task now uses a controlled loop that can properly exit when the service stops.

2. **Added Delays**: Strategic delays ensure the app is stable before starting background services:
   - 2-second delay in Settings screen before starting service
   - 3-second delay in PermissionChangeHandler after permission changes

3. **Better State Management**: Added proper state tracking to prevent duplicate service starts and handle app lifecycle correctly.

4. **Crash Recovery**: The app can now detect if it was restarted due to a permission change and handle it gracefully.

5. **Enhanced Error Handling**: All critical operations are wrapped in try-catch blocks with proper error logging.

## Testing Steps

1. Clear app data completely
2. Launch app fresh
3. Navigate to other screens first (don't go to Settings immediately)
4. Go to Settings - permissions should be requested
5. Accept permissions
6. App should NOT crash
7. Background service should start after a 2-second delay

## Future Improvements

1. Consider implementing a more sophisticated background task scheduler
2. Add telemetry to track permission-related crashes
3. Implement exponential backoff for failed background service starts
4. Add user-visible status for background service state
5. Consider using WorkManager for Android for more reliable background tasks