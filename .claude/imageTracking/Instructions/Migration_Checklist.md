# Migration Checklist - Real-Time Gallery Implementation

## 🗑️ Phase 1: Remove Old Code

### Files to Delete
- [ ] `services/gallery/backgroundScanner.ts`
- [ ] `services/gallery/BackgroundService.ts`  
- [ ] `services/gallery/GalleryMonitorV2.ts`
- [ ] `services/gallery/FixedGalleryScanner.ts`
- [ ] `services/progress/ScanProgressTracker.ts`
- [ ] `services/notifications/ScanProgressNotification.ts`
- [ ] All background service related utilities
- [ ] Complex scanning state management files

### Code to Remove from Existing Files
- [ ] Remove all `autoScan` settings from `settingsStore.ts`
- [ ] Remove scan frequency options
- [ ] Remove background scan toggles
- [ ] Remove force scan mechanisms
- [ ] Remove scan progress notifications
- [ ] Remove periodic timers and intervals

## 📱 Phase 2: Native Module Setup

### iOS Setup
- [ ] Add `GalleryObserver.h` to iOS project
- [ ] Add `GalleryObserver.m` to iOS project
- [ ] Update `Info.plist` with photo library permissions
- [ ] Run `pod install`
- [ ] Clean build folder in Xcode

### Android Setup  
- [ ] Create `GalleryObserverModule.java`
- [ ] Create `GalleryObserverPackage.java`
- [ ] Update `MainApplication.java`
- [ ] Update `AndroidManifest.xml` with permissions
- [ ] Run `./gradlew clean`

## 🔨 Phase 3: Core Services Implementation

### Real-Time Services
- [ ] Create `services/realtime/RealTimeGalleryManager.ts`
- [ ] Create `services/realtime/InitialScanner.ts`
- [ ] Create `services/processing/DocumentDetector.ts`
- [ ] Create `services/processing/DocumentProcessor.ts`
- [ ] Create `services/tracker/SimpleImageTracker.ts`

### Store Updates
- [ ] Simplify `settingsStore.ts`
- [ ] Simplify `documentStore.ts`
- [ ] Remove scan-related state management

## 🎨 Phase 4: UI Implementation

### Welcome Flow
- [ ] Create `WelcomeScreen.tsx`
- [ ] Add permission request flow
- [ ] Add onboarding steps
- [ ] Store welcome completion flag

### Home Screen
- [ ] Simplify `HomeScreen.tsx`
- [ ] Remove manual scan button
- [ ] Add initial scan progress UI
- [ ] Integrate FlashList for documents
- [ ] Remove background scan controls

### Settings Screen
- [ ] Simplify settings options
- [ ] Remove all scan-related settings
- [ ] Keep only essential preferences

## ✅ Phase 5: Testing & Validation

### Functionality Tests
- [ ] Welcome screen shows on first launch only
- [ ] Permissions requested properly on both platforms
- [ ] Initial scan completes successfully
- [ ] Progress bar shows during initial scan
- [ ] Documents detected and saved correctly
- [ ] Real-time monitoring starts after initial scan
- [ ] New photos detected instantly (< 1 second)
- [ ] Document detection accuracy acceptable
- [ ] Search functionality works
- [ ] Settings persist correctly

### Platform-Specific Tests
- [ ] iOS: Test on iOS 10-17
- [ ] Android: Test on API 21-34
- [ ] Test on real devices (not just simulators)
- [ ] Test with different gallery sizes (0, 100, 1000+ images)
- [ ] Test memory usage with large galleries

### Performance Validation
- [ ] No memory leaks during monitoring
- [ ] Battery usage minimal
- [ ] App startup time acceptable
- [ ] No UI freezes during processing
- [ ] Smooth scrolling in document grid

## 🚀 Phase 6: Deployment Preparation

### Code Cleanup
- [ ] Remove all console.log statements
- [ ] Remove debug code
- [ ] Optimize image processing
- [ ] Add error boundaries
- [ ] Add crash reporting

### Documentation
- [ ] Update README with new architecture
- [ ] Document native module setup
- [ ] Create troubleshooting guide
- [ ] Update user documentation

### Final Checks
- [ ] All TypeScript errors resolved
- [ ] ESLint warnings addressed
- [ ] Bundle size acceptable
- [ ] Release build works on both platforms
- [ ] App store requirements met

## 📊 Success Metrics

After implementation, verify:
- ✅ Code reduction: ~60% fewer files
- ✅ Settings simplified: ~80% fewer options  
- ✅ Response time: < 1 second for new images
- ✅ Battery impact: < 2% per day
- ✅ Memory usage: < 100MB average
- ✅ User experience: No manual scanning needed

## 🔥 Common Issues & Solutions

### Native Module Not Found
- Clean and rebuild project
- Verify module registration
- Check native file placement

### Permissions Denied
- Check Info.plist (iOS)
- Check AndroidManifest.xml
- Verify runtime permission request

### Real-Time Not Working
- Check native observer started
- Verify event listeners attached
- Test with camera app (not screenshots)

### Memory Issues
- Implement image batch processing
- Add cleanup in low memory situations
- Limit concurrent processing

## 🎯 Final Verification

Before considering complete:
1. Delete app and reinstall
2. Go through complete first-time flow
3. Take 5 photos with camera
4. Verify all detected within 5 seconds
5. Close and reopen app
6. Verify documents persist
7. Test on minimum supported OS versions