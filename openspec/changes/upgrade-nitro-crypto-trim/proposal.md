## Why

Two dependencies remain on the pre-0.86 generation after the platform change: `react-native-quick-crypto@0.7.17` (old JSI architecture; 1.x is the Nitro rewrite maintained against RN 0.86) and `react-native-vision-camera@4.7.2` — which research revealed is **declared but never imported anywhere** (installed in the spec-kit era behind a TODO stub; every `Camera` grep hit is camera-roll, a different package). Carrying an unused native camera stack costs build time and upgrade surface on every future move.

## What Changes

- **react-native-quick-crypto 0.7.17 → 1.1.5** (Nitro rewrite) + its peer `react-native-quick-base64@^3.0.0`; `react-native-nitro-modules@0.36.1` is already pinned from the platform change and is shared. Exposure: exactly one call site — `EncryptionService.generateRandomKey` uses `QuickCrypto.randomBytes(32).toString("hex")`, encode-only. **Decryption of existing data is structurally immune**: existing DB keys load verbatim from Keychain/Keystore; quick-crypto performs no derivation on the read path.
- **REMOVE react-native-vision-camera** (unused): drop the dependency; KEEP the camera permission entries in AndroidManifest.xml/Info.plist (onboarding copy references camera; the feature re-adds v5.x + nitro peers when actually built).
- Verify: builds green both platforms, app boots, a fresh encryption-key generation path works (randomBytes via Nitro), existing encrypted DB still opens.

## Capabilities

### New Capabilities
- `nitro-crypto-random`: cryptographic random generation runs on the maintained Nitro-based quick-crypto 1.x with the single key-generation call site verified, and existing keychain-loaded keys continue to decrypt the database.

### Modified Capabilities
<!-- None. No existing spec governs the crypto library version or the unused camera dependency. -->

## Impact

- package.json: `react-native-quick-crypto@1.1.5`, `+react-native-quick-base64@^3.0.0`, `-react-native-vision-camera`; lockfile regenerated; pod install + gradle re-autolink (VisionCamera pod disappears, NitroQuickCrypto appears).
- `src/services/security/EncryptionService.ts`: no code change expected (1.x keeps the node-crypto-style `randomBytes` surface; verify the Buffer `.toString("hex")` shape at typecheck/runtime).
- Out of scope: implementing camera capture; any pbkdf2/cipher usage (none exists).
