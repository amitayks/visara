## Why

`react-native-vector-icons@10.3.0` is the frozen legacy package (superseded by the `@react-native-vector-icons/*` scoped monorepo). The app bundles **all ~19 font families** on both platforms (unfiltered `fonts.gradle`, 19 `UIAppFonts` entries, plus 38 stray committed `.ttf` files with " 2" duplicates in the Xcode project) while actually using exactly **one family (MaterialDesignIcons) through one wrapper** (`src/components/atoms/Icon.tsx` → react-native-paper's `<Icon>`; zero direct icon imports anywhere).

## What Changes

- Replace `react-native-vector-icons` with `@react-native-vector-icons/material-design-icons@13.1.2` (all 35 icon names the app uses verified present); bump `react-native-paper` → 5.15.3 (RN 0.85+ fixes; its loader auto-prefers the scoped package since 5.14.1). **Zero src/ changes.**
- Android: remove the `fonts.gradle` apply line (`android/app/build.gradle:137`); autolinking handles the scoped package's font.
- iOS: `UIAppFonts` reduced to exactly `MaterialDesignIcons.ttf`; remove all 38 stray `.ttf` file references (19 families × original + " 2" duplicate) from the pbxproj Resources/FileReference/group sections and delete the committed font files; `pod install` (drops `RNVectorIcons`, gains the resources-only scoped pod).
- APK/IPA shrink: ~18 unused font families stop shipping.

## Capabilities

### New Capabilities
- `scoped-vector-icons`: icon rendering runs on the maintained scoped MaterialDesignIcons package with only that family bundled, every existing glyph rendering identically through the paper-backed `Icon` atom.

### Modified Capabilities
<!-- None. -->

## Impact

- package.json (±2 deps + paper bump), android/app/build.gradle (−1 line), ios/Visara/Info.plist (UIAppFonts 19→1), ios pbxproj (−76 ttf lines), ios/Visara/*.ttf deletions, Podfile.lock.
- Risk: a glyph name missing from the scoped set (research verified all 35 present); Xcode build failing on dangling ttf references if pbxproj surgery misses an entry — caught at build time.
