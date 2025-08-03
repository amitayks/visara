# Background Scanner Freeze and Content URI Fix Summary

## Problem
App freezes when background scanner tries to process images. The scanner attempts to access content:// URIs which fail with "Source file does not exist" errors, causing the app to become unresponsive.

## Root Causes
1. **Content URI Access**: Android content:// URIs from MediaStore require special handling and permissions
2. **Concurrent File Operations**: Multiple file copy operations happening simultaneously
3. **Background Service Processing**: Processing heavy operations in the background task thread
4. **Infinite loops**: Background task could run indefinitely without proper exit conditions

## Fixes Applied

### 1. Content URI Handling Fix (services/imageStorage.ts)
- Added special handling for content:// URIs using base64 encoding
- Implemented fallback method using fetch API for content URIs
- Better error handling to throw errors instead of returning invalid URIs
- Added blobToBase64 helper method for file conversion

Key changes:
```typescript
// For content URIs, we need to read and write the file
// RNFS.copyFile doesn't work reliably with content URIs
const base64Data = await RNFS.readFile(tempUri, 'base64');
await RNFS.writeFile(permanentUri, base64Data, 'base64');
```

### 2. Gallery Scanner Batch Processing (services/gallery/GalleryScanner.ts)
- Changed from parallel to sequential processing to avoid overwhelming the system
- Added 100ms delay between processing each asset
- Added timeout protection (30 seconds) for image processing
- Better error handling - individual failures don't stop the entire batch
- Added background service status checks before updating notifications

Key changes:
- Sequential processing with `for...of` loop instead of `Promise.allSettled`
- `Promise.race` with timeout for processing each image
- Continue processing on individual failures

### 3. Background Scanner Task Updates (services/gallery/backgroundScanner.ts)
- Added 5-second initial delay before starting processing
- Implemented iteration counter with max iterations (1000) to prevent infinite loops
- Break sleep intervals into 1-minute chunks for better responsiveness
- Smaller batch sizes for background processing (5 instead of 10-20)
- Less frequent progress updates in background (every 10 images)
- Better error handling with retry logic

Key changes:
- Controlled loop with iteration limits
- Chunked sleep intervals for better service control
- Smaller batches and optimized progress updates

### 4. Android Permissions (android/app/src/main/AndroidManifest.xml)
- Added `ACCESS_MEDIA_LOCATION` permission for accessing image metadata
- Added `android:requestLegacyExternalStorage="true"` for better file access compatibility

## Summary of Changes

### File: services/imageStorage.ts
1. Added content URI detection and special handling
2. Implemented base64 reading/writing for content URIs
3. Added fetch API fallback method
4. Changed to throw errors instead of returning invalid URIs
5. Added blobToBase64 conversion helper

### File: services/gallery/GalleryScanner.ts
1. Changed batch processing from parallel to sequential
2. Added delays between asset processing
3. Implemented timeout protection for image processing
4. Added BackgroundService status checks
5. Better error isolation and logging

### File: services/gallery/backgroundScanner.ts
1. Added initial delay and iteration limits
2. Implemented chunked sleep intervals
3. Reduced batch sizes for background processing
4. Optimized notification update frequency
5. Added better error recovery logic

### File: android/app/src/main/AndroidManifest.xml
1. Added ACCESS_MEDIA_LOCATION permission
2. Added requestLegacyExternalStorage attribute

## Testing Steps

1. Clear app data and cache
2. Launch app and grant gallery permissions
3. Navigate to Settings and enable background scanning
4. App should not freeze
5. Check logs for successful processing of content:// URIs
6. Verify background scanner processes images without hanging

## Expected Results

1. No app freezing when processing gallery images
2. Content URIs are properly handled and copied
3. Background scanner runs smoothly with proper progress updates
4. Failed images are tracked for retry without stopping the scan
5. Service can be stopped cleanly at any time

## Performance Improvements

1. Sequential processing reduces memory pressure
2. Smaller batches in background prevent UI blocking
3. Timeout protection prevents hanging on problematic images
4. Chunked sleep intervals improve service responsiveness
5. Less frequent notifications reduce system overhead

## Future Recommendations

1. Consider implementing a queue-based processing system
2. Add more granular progress tracking
3. Implement adaptive batch sizing based on device performance
4. Add telemetry for tracking processing failures
5. Consider using WorkManager for more reliable background processing on Android