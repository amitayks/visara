## ADDED Requirements

### Requirement: Cryptographic random generation on quick-crypto 1.x

The project SHALL pin `react-native-quick-crypto@1.1.5` with `react-native-quick-base64@^3.0.0`, sharing the existing `react-native-nitro-modules@0.36.1` substrate. `EncryptionService.generateRandomKey` SHALL continue to produce a 64-character hex key from 32 random bytes.

#### Scenario: Fresh key generation works on the Nitro line

- **WHEN** the app generates a new encryption key (fresh install path)
- **THEN** `randomBytes(32)` succeeds via NitroQuickCrypto and the resulting hex string is 64 characters, with no runtime error

#### Scenario: Existing encrypted data unaffected

- **WHEN** the app boots with an existing keychain-stored key and encrypted database
- **THEN** the key loads verbatim from Keychain/Keystore and WatermelonDB/SQLCipher opens successfully (quick-crypto is not on the read path)

### Requirement: Unused camera dependency removed

`react-native-vision-camera` SHALL be absent from package.json and both native builds, while camera permission declarations remain in `AndroidManifest.xml` and `Info.plist` for the future capture feature.

#### Scenario: Camera lib gone, permissions intact

- **WHEN** dependencies install and both platforms build
- **THEN** no VisionCamera pod/gradle module is compiled, `grep -r "react-native-vision-camera" src/` returns nothing, and the camera permission entries still exist in both manifests
