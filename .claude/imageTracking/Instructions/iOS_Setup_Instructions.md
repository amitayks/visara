# iOS Setup Instructions

## 1. Update Info.plist

Add the following permissions to `ios/Visara/Info.plist`:

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Visara needs access to your photo library to detect and process documents</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Visara needs permission to save processed documents to your photo library</string>
```

## 2. Add Bridging Header (if needed)

If you don't have a bridging header, create one:

1. In Xcode, go to File → New → File
2. Choose "Header File" 
3. Name it `Visara-Bridging-Header.h`
4. Add the following:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
```

## 3. Register Native Module

The GalleryObserver module will be automatically registered when you add the `.h` and `.m` files to your Xcode project.

1. Open `ios/Visara.xcworkspace` in Xcode
2. Right-click on the Visara folder
3. Choose "Add Files to Visara..."
4. Add `GalleryObserver.h` and `GalleryObserver.m`
5. Make sure "Copy items if needed" is checked
6. Make sure your app target is selected

## 4. Update Podfile

No additional pods are needed as we're using the native Photos framework.

## 5. Run Pod Install

```bash
cd ios
pod install
```

## 6. Clean and Rebuild

```bash
# Clean build
cd ios
xcodebuild clean

# Or in Xcode:
# Product → Clean Build Folder (Cmd+Shift+K)

# Then rebuild
npx react-native run-ios
```

## 7. Verify Implementation

Test that the native module is registered:

```javascript
import { NativeModules } from 'react-native';

console.log('GalleryObserver available:', !!NativeModules.GalleryObserver);
```

## Troubleshooting

### Module not found
- Ensure files are added to the Xcode project
- Clean build folder and rebuild
- Check that the module name matches exactly: `GalleryObserver`

### Permission issues
- Ensure Info.plist has the correct permission strings
- Test on a real device (simulator may have limited photo access)
- Reset permissions in Settings if needed

### Build errors
- Make sure you're using the correct React Native imports
- Check that Photos framework is linked (should be automatic)
- Verify minimum iOS deployment target is 10.0 or higher