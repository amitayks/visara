# Native Observer Implementation - Final Decisions

## Context
Implementing native TurboModules for real-time media file observation in React Native 0.81.4 (New Architecture).

## Final Architecture Decisions

### 1. NO Foreground Service for Observer
- **Decision:** Observer ONLY runs when app is active (foreground)
- **Rationale:**
  - Too much code maintenance for minimal UX gain
  - User can wait 0.1s on app launch for sync
  - Matches iOS behavior (no background observation)
  - Keeps codebase simpler
- **Implementation:** Register ContentObserver in Activity/ViewController lifecycle

### 2. Service Separation
- **Observer Service:** None - runs in app process only
- **Background Processing Service:** Separate (for ML processing) - NOT AFFECTED by this decision

### 3. Native Implementation Scope
- **Initial Scan:** Native TurboModule (fast, one-time)
- **Observer:** Native TurboModule (incremental updates)
- **Manual Refresh:** Native TurboModule (reuse initial scan logic)

### 4. Progress Tracking - IMPORTANT
- **NO UI Loading Progress** for scans/observer
- **NO Cancellation Option** for scans/observer
- **Progress Only For:** ML processing (happens in JS anyway)
- **Module Responsibility:** Just emit events with data, no progress callbacks

### 5. Event Structure
```typescript
// Observer emits batched changes
{
  type: 'media_changed',
  changes: [
    {
      action: 'added' | 'modified' | 'deleted',
      uri: string,
      filename: string,
      mimeType: string,
      width: number,
      height: number,
      fileSize: number,
      creationDate: number,
      modificationDate: number,
      latitude?: number,
      longitude?: number,
    }
  ]
}
```

### 6. Batching & Throttling
- **Initial Scan:** Send batches of 100 items immediately (no throttle)
- **Observer (Normal Mode):** Collect changes, emit every 5 seconds
- **Observer (Battery Saver):** Collect changes, emit every 30 seconds
- **UI:** Always updates immediately when events received

### 7. Platform Differences

#### Android
- Use `ContentObserver` on MediaStore URIs:
  - `MediaStore.Images.Media.EXTERNAL_CONTENT_URI`
  - `MediaStore.Video.Media.EXTERNAL_CONTENT_URI`
  - `MediaStore.Files.getContentUri("external")` (for PDFs)
- Register in `MainActivity.onResume()`
- Unregister in `MainActivity.onPause()`
- Query MediaStore for initial scan and missed changes

#### iOS
- Use `PHPhotoLibraryChangeObserver`
- Register in `AppDelegate` or ViewController
- Photos/Videos only (PDFs require manual picker)
- No background observation (app must be active)

### 8. App Launch Flow
```
1. App launches
2. Get lastSyncTimestamp from AppSettings
3. Native module: getChangesSince(lastSyncTimestamp)
4. Native queries MediaStore/PhotoKit for items modified since timestamp
5. Send batched results to JS (100 items at a time)
6. JS processes each batch (add to DB, no UI progress)
7. Start observer for new changes
8. Update lastSyncTimestamp
```

### 9. Observer Flow (After Initial Sync)
```
1. User takes 5 photos
2. ContentObserver/PHPhotoLibraryChangeObserver fires
3. Native collects changes in buffer
4. After 5s (or 30s in battery saver):
   - Query details for buffered changes
   - Send batch to JS
5. JS adds to DB and updates UI (FlashList)
6. Clear buffer, repeat
```

### 10. TurboModule Interface

```typescript
// src/native-modules/MediaObserver.ts
export interface Spec extends TurboModule {
  // Start initial full scan
  startInitialScan(): void;

  // Get changes since timestamp (for app launch)
  getChangesSince(timestamp: number): void;

  // Start/stop observer
  startObserver(throttleMs: number): void;
  stopObserver(): void;

  // Event emitter (inherited from TurboModule)
  // Events: 'media_batch', 'scan_complete'
}
```

### 11. No Cancellation
- Initial scan runs to completion (fast enough: 20-50s for 10k photos)
- Observer runs continuously while app active
- If user backgrounds app, observer stops automatically (onPause)

### 12. Performance Targets
- 1,000 photos: 2-5 seconds initial scan
- 10,000 photos: 20-50 seconds initial scan
- Observer latency: 5-30 seconds (depending on battery mode)
- Bridge events: ~100 per initial scan (batches of 100)
- Bridge events: ~10-20 per day (observer batches)

### 13. Battery Impact
- Observer only: <0.1% per hour (no foreground service)
- Initial scan: ~0.5-1% one-time cost
- Throttled observer: Minimal impact on battery

### 14. Implementation Files to Create

#### Android
- `android/app/src/main/java/com/visara/mediaobserver/MediaObserverModule.java`
- `android/app/src/main/java/com/visara/mediaobserver/MediaObserverPackage.java`
- `android/app/src/main/java/com/visara/mediaobserver/MediaStoreObserver.java`

#### iOS
- `ios/MediaObserver/MediaObserverModule.swift`
- `ios/MediaObserver/MediaObserverModule.m` (bridge)
- `ios/MediaObserver/PhotoLibraryObserver.swift`

#### JS
- `src/native-modules/MediaObserver.ts` (TypeScript spec)
- Update `MediaDiscoveryService.ts` to use native module

### 15. Error Handling
- If native module unavailable: Fall back to JS `MediaDiscoveryService`
- If permissions denied: Return empty array, show permission prompt
- If query fails: Log error, return partial results

### 16. Testing Strategy
- Test with small library (10 photos)
- Test with large library (1000+ photos)
- Test observer by taking photos while app open
- Test app launch after taking photos while closed
- Test battery saver mode throttling

## References
- media_observe_reserch.md
- React Native TurboModules: https://reactnative.dev/docs/turbo-native-modules-introduction
- Android ContentObserver: https://developer.android.com/reference/android/database/ContentObserver
- iOS PHPhotoLibraryChangeObserver: https://developer.apple.com/documentation/photokit/phphotolibrary
