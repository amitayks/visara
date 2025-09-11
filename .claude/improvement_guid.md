# Fix for Scan Progress Bar and Performance Issues

## Overview
The main problems are:
1. Progress bar flashing due to rapid `isScanning` state changes
2. Excessive re-renders in HomeScreen from too frequent progress updates
3. No differentiation between initial scan and monitoring for new images

## Solution Implementation

### 1. Enhanced ScanProgress Type
**File**: `services/gallery/GalleryScanner.ts`

Add these fields to the `ScanProgress` interface (around line 30):
```typescript
export interface ScanProgress {
  totalImages: number;
  processedImages: number;
  lastScanDate: Date | null;
  lastProcessedAssetId: string | null;
  isScanning: boolean;
  
  // Add these new fields
  scanType?: 'initial' | 'monitoring' | 'completed';
  discoveredNewImages?: number;  // For monitoring phase
  phase?: 'discovering' | 'processing' | 'fingerprinting' | 'completed';
  currentFile?: string;
  newFiles?: number;
  changedFiles?: number;
  skippedFiles?: number;
  failedFiles?: number;
  batchId?: string;
}
```

### 2. Improved Progress Management in Store
**File**: `stores/scannerStore.ts`

Replace the `setScanProgress` method with a throttled version:
```typescript
import { debounce } from 'lodash';

// Add after the imports
const PROGRESS_UPDATE_THROTTLE = 500; // Update UI max every 500ms

// Inside the store creation, replace setScanProgress:
setScanProgress: debounce((progress: ScanProgress) => {
  set((state) => {
    // Only update if there's a meaningful change
    const currentProgress = state.scanProgress;
    
    // Check if this is a meaningful update
    const hasChanged = 
      currentProgress.isScanning !== progress.isScanning ||
      currentProgress.processedImages !== progress.processedImages ||
      currentProgress.totalImages !== progress.totalImages ||
      currentProgress.scanType !== progress.scanType ||
      Math.abs((currentProgress.processedImages || 0) - (progress.processedImages || 0)) >= 10;
    
    if (hasChanged) {
      return { scanProgress: progress };
    }
    return state;
  });
}, PROGRESS_UPDATE_THROTTLE),

// Add a new method for immediate updates (for start/stop events)
setImmediateScanProgress: (progress: ScanProgress) => {
  set({ scanProgress: progress });
},
```

### 3. Fix GalleryScanner Progress Updates
**File**: `services/gallery/GalleryScanner.ts`

Update the `updateProgressSubject` method to include scan type detection:
```typescript
private updateProgressSubject() {
  const now = Date.now();
  
  // Throttle updates to prevent UI flooding
  if (now - this.lastProgressUpdateTime < this.PROGRESS_UPDATE_THROTTLE) {
    return;
  }
  
  this.lastProgressUpdateTime = now;
  
  // Determine scan type based on context
  let scanType: 'initial' | 'monitoring' | 'completed' = 'initial';
  
  if (!this.progress.isScanning && this.progress.processedImages > 0) {
    scanType = 'completed';
  } else if (this.progress.lastScanDate && 
             Date.now() - this.progress.lastScanDate.getTime() < 3600000) {
    // If we've scanned within the last hour, we're monitoring
    scanType = 'monitoring';
  }
  
  const enhancedProgress = {
    ...this.progress,
    scanType,
    discoveredNewImages: scanType === 'monitoring' ? this.progress.newFiles : undefined,
  };
  
  this.progressSubject.next(enhancedProgress);
  
  // Also update the store directly with throttling
  if (this.onProgressCallback) {
    this.onProgressCallback(enhancedProgress);
  }
}
```

### 4. Enhanced ScanProgressBar Component
**File**: `app/components/ScanProgressBar/ScanProgressBar.tsx`

Replace the entire component with this enhanced version:
```typescript
import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./ScanProgressBar.style";
import type { ScanProgress } from "../../../services/gallery/GalleryScanner";

interface ScanProgressBarProps {
  progress: ScanProgress;
  animated?: boolean;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({
  progress,
  animated = true,
}) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  
  // Calculate actual progress percentage
  const progressPercentage = useMemo(() => {
    if (progress.scanType === 'monitoring' && progress.discoveredNewImages) {
      // For monitoring, show progress of new images only
      return progress.newFiles && progress.discoveredNewImages > 0
        ? progress.newFiles / progress.discoveredNewImages
        : 0;
    }
    // For initial scan, show overall progress
    return progress.totalImages > 0 
      ? progress.processedImages / progress.totalImages 
      : 0;
  }, [progress]);
  
  const animatedProgress = useSharedValue(0);
  const pulseAnimation = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withSpring(progressPercentage, {
      damping: 20,
      stiffness: 90,
    });
  }, [progressPercentage]);

  useEffect(() => {
    if (animated && progress.isScanning) {
      pulseAnimation.value = withRepeat(
        withTiming(1, { duration: 1500 }),
        -1,
        true,
      );
    }
  }, [animated, progress.isScanning]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnimation.value, [0, 1], [0.6, 1]),
  }));

  // Generate appropriate status text
  const getStatusText = () => {
    if (progress.scanType === 'monitoring') {
      if (progress.discoveredNewImages && progress.discoveredNewImages > 0) {
        return `Found ${progress.discoveredNewImages} new images`;
      }
      return "Monitoring for new images...";
    }
    
    switch (progress.phase) {
      case 'discovering':
        return "Discovering images...";
      case 'processing':
        return "Processing documents...";
      case 'fingerprinting':
        return "Analyzing images...";
      case 'completed':
        return "Scan complete";
      default:
        return "Scanning gallery...";
    }
  };

  // Generate progress numbers text
  const getProgressNumbers = () => {
    if (progress.scanType === 'monitoring' && progress.discoveredNewImages) {
      return `${progress.newFiles || 0}/${progress.discoveredNewImages}`;
    }
    
    if (progress.totalImages === 0) {
      return "Checking...";
    }
    
    return `${progress.processedImages}/${progress.totalImages}`;
  };

  // Don't show progress bar if not scanning or just completed
  if (!progress.isScanning && progress.scanType === 'completed') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{getStatusText()}</Text>
        <Text style={styles.count}>{getProgressNumbers()}</Text>
      </View>
      
      {progress.newFiles !== undefined && progress.newFiles > 0 && (
        <Text style={styles.subtitle}>
          {progress.newFiles} new • {progress.changedFiles || 0} changed
        </Text>
      )}
      
      <View style={styles.progressBar}>
        <Animated.View
          style={[
            styles.progressFill, 
            progressStyle, 
            animated && progress.isScanning && pulseStyle
          ]}
        />
      </View>
    </View>
  );
};
```

### 5. Optimize HomeScreen Subscriptions
**File**: `app/index.tsx`

Replace the scan progress subscription effect (around line 60) with:
```typescript
// Optimized scan progress subscription
useEffect(() => {
  let unsubscribe: (() => void) | undefined;
  
  // Only subscribe if we don't have background scanning
  if (!isBackgroundScanEnabled) {
    unsubscribe = galleryScanner.subscribeToProgress((progress) => {
      // Only update if there's a significant change
      setScanProgress((prev) => {
        if (!prev || 
            prev.isScanning !== progress.isScanning ||
            Math.abs(prev.processedImages - progress.processedImages) >= 10 ||
            prev.scanType !== progress.scanType) {
          return progress;
        }
        return prev;
      });
      
      // Update isScanning separately for immediate UI response
      setIsScanning(progress.isScanning);
    });
  }

  return () => unsubscribe?.();
}, [isBackgroundScanEnabled]);

// Remove or simplify the effect that logs scan state checks (around line 85)
// This is causing excessive re-renders
```

### 6. Fix Background Scanner Progress Updates
**File**: `services/gallery/backgroundScanner.ts`

In the `performEnhancedBackgroundScan` method, update the progress callback:
```typescript
// Around line 450, update the scan options callback
await galleryScanner.startScan(scanOptions, async (progress) => {
  // Check if we should pause
  if (this.isPaused) {
    console.log("[BackgroundScanner] Scan paused by app state");
    return;
  }

  // Detect scan type
  const isMonitoring = progress.lastScanDate && 
    Date.now() - progress.lastScanDate.getTime() < 3600000;
  
  const enhancedProgress = {
    ...progress,
    scanType: isMonitoring ? 'monitoring' as const : 'initial' as const,
    discoveredNewImages: isMonitoring ? progress.totalImages : undefined,
  };

  // Update progress with appropriate message
  if (progress.processedImages === 0 && progress.totalImages > 0) {
    await progressManager.forceUpdate(
      enhancedProgress,
      isMonitoring 
        ? `Found ${progress.totalImages} new images to check...`
        : `Scanning ${progress.totalImages} images...`
    );
  } else if (progress.processedImages % 20 === 0) {
    // Update less frequently
    await progressManager.updateProgress(enhancedProgress);
  }
});
```

### 7. Add Subtitle Style to ScanProgressBar.style.ts
**File**: `app/components/ScanProgressBar/ScanProgressBar.style.ts`

Add this style:
```typescript
subtitle: {
  fontSize: 12,
  color: theme.textSecondary,
  marginTop: 4,
  marginBottom: 8,
},
```

## Testing Instructions

1. **Clear app data and test initial scan**:
   - Should show "Scanning gallery... X/6366"
   - Progress bar should smoothly animate
   - No flickering or rapid disappearing

2. **Test monitoring phase**:
   - After initial scan, add new images
   - Should show "Found X new images" with "X/Y" progress
   - Only new images count shown, not total gallery

3. **Check performance**:
   - HomeScreen should not re-render excessively
   - Console should not spam "Scan state check" logs
   - UI should remain responsive during scanning

## Expected Results

- Progress bar stays visible during entire scan
- Shows appropriate messages for each phase
- Differentiates between initial scan (X/6366) and monitoring (X/20 new)
- Significantly reduced re-renders
- Smoother UI performance
- No flickering or rapid state changes