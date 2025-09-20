# Android Setup Instructions

## 1. Update AndroidManifest.xml

Add permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- For Android 12 and below -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />

<!-- For Android 13+ (API 33+) -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

<!-- For better image metadata -->
<uses-permission android:name="android.permission.ACCESS_MEDIA_LOCATION" />
```

## 2. Update build.gradle

Ensure minimum SDK versions in `android/app/build.gradle`:

```gradle
android {
    compileSdkVersion 33  // or higher
    
    defaultConfig {
        minSdkVersion 21  // Android 5.0 minimum
        targetSdkVersion 33  // or higher
    }
}
```

## 3. Create Module Structure

Create the following directory structure:

```
android/app/src/main/java/com/visara/modules/
├── GalleryObserverModule.java
└── GalleryObserverPackage.java
```

## 4. Register Package in MainApplication.java

Update `android/app/src/main/java/com/visara/MainApplication.java`:

```java
import com.visara.modules.GalleryObserverPackage;

// In getPackages() method:
@Override
protected List<ReactPackage> getPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    packages.add(new GalleryObserverPackage()); // Add this line
    return packages;
}
```

## 5. Fix Import Issues

If you get import errors for `ReadableArray`, add this import to `GalleryObserverModule.java`:

```java
import com.facebook.react.bridge.ReadableArray;
```

## 6. Clean and Rebuild

```bash
# Clean build
cd android
./gradlew clean

# Rebuild
cd ..
npx react-native run-android
```

## 7. Request Runtime Permissions

For Android 6.0+, you need runtime permissions. This is handled by the WelcomeScreen using react-native-permissions.

Install if not already installed:

```bash
npm install react-native-permissions
# or
yarn add react-native-permissions
```

## 8. Verify Implementation

Test that the native module is registered:

```javascript
import { NativeModules } from 'react-native';

console.log('GalleryObserver available:', !!NativeModules.GalleryObserver);
```

## Troubleshooting

### Module not found
- Verify package is registered in MainApplication.java
- Clean and rebuild: `cd android && ./gradlew clean`
- Check package name matches: `com.visara.modules`

### Permission denied
- Ensure permissions are in AndroidManifest.xml
- Check runtime permissions are requested
- Test on a real device (emulator may need manual photo addition)

### Build errors
- Verify all imports are correct
- Check Java package structure matches
- Ensure React Native version compatibility

### ContentObserver not triggering
- Some devices may have delays in MediaStore updates
- Test by taking a photo with the camera app
- Check logcat for debug messages: `adb logcat | grep GalleryObserver`

### Memory issues
- The module limits queries to recent images
- Implements debouncing to prevent rapid triggers
- Uses background thread for processing

## Performance Tips

1. **Debouncing**: The module includes 500ms debounce to prevent rapid triggers
2. **Batch Processing**: Processes up to 10 recent images at once
3. **Background Thread**: All heavy operations run on background thread
4. **Memory Management**: Limits stored image IDs to prevent memory leaks

## Testing on Different Android Versions

- **Android 5-8** (API 21-28): Uses READ_EXTERNAL_STORAGE
- **Android 9-12** (API 29-32): Scoped storage with READ_EXTERNAL_STORAGE
- **Android 13+** (API 33+): Uses READ_MEDIA_IMAGES permission

Make sure to test on different Android versions to ensure compatibility.