## 1. Dependencies

- [x] 1.1 package.json: `react-native-quick-crypto@1.1.5` (exact), ADD `react-native-quick-base64@^3.0.0`, REMOVE `react-native-vision-camera`; `npm install`; verify nitro-modules still single-pinned at 0.36.1.
- [x] 1.2 `npx tsc --noEmit` green (EncryptionService randomBytes shape check; adapt the one line if 1.x changed the Buffer type).

## 2. Native rebuild

- [x] 2.1 Android `:app:assembleDebug` green (VisionCamera module gone from autolink, NitroQuickCrypto present).
- [x] 2.2 iOS `pod install` + Debug build green (VisionCamera pod gone, NitroQuickCrypto pod in the lock).

## 3. Verification

- [x] 3.1 Camera permissions still declared in AndroidManifest.xml + Info.plist; zero vision-camera imports in src/.
- [x] 3.2 Boot smoke both platforms: app reaches UI, encrypted DB opens (existing-key path), no quick-crypto runtime errors in logs.
- [x] 3.3 Green sweep (lint/tsc/jest) + commit + push.
