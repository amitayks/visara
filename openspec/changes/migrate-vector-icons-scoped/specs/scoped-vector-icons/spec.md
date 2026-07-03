## ADDED Requirements

### Requirement: Icons served by the scoped MaterialDesignIcons package only

The project SHALL depend on `@react-native-vector-icons/material-design-icons@13.1.2` with `react-native-paper@^5.15.3`, and `react-native-vector-icons` SHALL be absent. Only the MaterialDesignIcons font family may ship in either platform bundle: no `fonts.gradle` apply on Android, `UIAppFonts` containing exactly `MaterialDesignIcons.ttf` on iOS, and no legacy `.ttf` files or references in the Xcode project.

#### Scenario: Legacy package fully excised

- **WHEN** dependencies install and both platforms build
- **THEN** `RNVectorIcons` is absent from Podfile.lock, the scoped resources pod is present, the APK bundles a single icon font, and the build has no dangling ttf references

#### Scenario: Every existing glyph renders

- **WHEN** icon-heavy screens render (onboarding, settings drawer, bottom navigation, gallery headers)
- **THEN** every icon name previously rendered by the legacy package displays identically via paper's loader against the scoped package (no missing-glyph placeholders)
