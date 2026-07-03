> Small change; design.md intentionally omitted (no architectural decisions — the research mapped a zero-src-change path).

## 1. Dependencies

- [x] 1.1 `npm uninstall react-native-vector-icons`; `npm i @react-native-vector-icons/material-design-icons@13.1.2 react-native-paper@5.15.3`; tsc green.

## 2. Android

- [x] 2.1 Remove the `fonts.gradle` apply line from `android/app/build.gradle`; `assembleDebug` green; confirm single icon font in APK.

## 3. iOS

- [x] 3.1 Info.plist: `UIAppFonts` → exactly `["MaterialDesignIcons.ttf"]`.
- [x] 3.2 pbxproj: remove all legacy ttf PBXBuildFile/PBXFileReference/group/Resources entries; delete committed `.ttf` files.
- [x] 3.3 `pod install` (RNVectorIcons out, scoped resources pod in) + Debug build green.

## 4. Verification

- [x] 4.1 Boot both platforms; icon-heavy surfaces visually verified (onboarding glyphs, bottom nav, settings) — no missing-glyph boxes.
- [x] 4.2 Green sweep + commit + push.
