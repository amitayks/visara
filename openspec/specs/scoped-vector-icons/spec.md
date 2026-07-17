# scoped-vector-icons Specification

## Purpose
TBD - created by archiving change migrate-vector-icons-scoped. Update Purpose after archive.
## Requirements
### Requirement: Icons served by the scoped MaterialDesignIcons package only

The project SHALL depend on `@react-native-vector-icons/material-design-icons@13.1.2`, and `react-native-vector-icons` and `react-native-paper` SHALL be absent. Icons SHALL render through the design system's own `Icon` primitive consuming the scoped package directly. Only the MaterialDesignIcons font family may ship in either platform bundle: no `fonts.gradle` apply on Android, `UIAppFonts` containing exactly `MaterialDesignIcons.ttf` on iOS, and no legacy `.ttf` files or references in the Xcode project.

#### Scenario: Legacy package fully excised

- **WHEN** dependencies install and both platforms build
- **THEN** `RNVectorIcons` is absent from Podfile.lock, the scoped resources pod is present, the APK bundles a single icon font, and the build has no dangling ttf references

#### Scenario: Every existing glyph renders

- **WHEN** icon-heavy screens render (onboarding, settings, bottom bar, gallery headers)
- **THEN** every icon name used by the rebuilt UI displays via the design system `Icon` primitive against the scoped package (no missing-glyph placeholders, no paper loader in the dependency tree)

