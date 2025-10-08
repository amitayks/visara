# Native Observer Architecture

## Overview
Custom TurboModule for real-time media observation without foreground service.

## Key Decisions
1. **No Background Service** - Observer only runs when app is active
2. **Native Implementation** - Initial scan + observer in native code
3. **No Progress/Cancellation** - Simple event emission only
4. **Throttled Batching** - 5s normal, 30s battery saver

## Module API

```typescript
interface MediaObserverModule extends TurboModule {
  startInitialScan(): void;
  getChangesSince(timestamp: number): void;
  startObserver(throttleMs: number): void;
  stopObserver(): void;
}

// Events emitted:
// 'media_batch' - { changes: MediaChange[] }
// 'scan_complete' - { total: number }
```

## Implementation

### Android
- `ContentObserver` on MediaStore URIs
- Registered in `MainActivity` lifecycle (onResume/onPause)
- Batch size: 100 items
- Throttle: Handler with delay

### iOS
- `PHPhotoLibraryChangeObserver`
- Photos/Videos only (no PDFs)
- Registered in app lifecycle
- Same batching/throttling

## Integration
- Replace `MediaDiscoveryService` JS methods with native calls
- Keep existing interfaces for compatibility
- Fallback to JS if native unavailable
