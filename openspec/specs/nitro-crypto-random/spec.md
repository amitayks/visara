# nitro-crypto-random Specification

## Purpose
TBD - created by archiving change upgrade-nitro-crypto-trim. Update Purpose after archive.
## Requirements
### Requirement: Unused camera dependency removed

`react-native-vision-camera` SHALL be absent from package.json and both native builds, while camera permission declarations remain in `AndroidManifest.xml` and `Info.plist` for the future capture feature.

#### Scenario: Camera lib gone, permissions intact

- **WHEN** dependencies install and both platforms build
- **THEN** no VisionCamera pod/gradle module is compiled, `grep -r "react-native-vision-camera" src/` returns nothing, and the camera permission entries still exist in both manifests
