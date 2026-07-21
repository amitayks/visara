# nitro-crypto-random — Delta Spec

## REMOVED Requirements

### Requirement: Cryptographic random generation on quick-crypto 1.x
**Reason**: `EncryptionService` was dead code (zero imports) and is deleted along with `react-native-quick-crypto`, `react-native-quick-base64`, and `react-native-keychain`; the new op-sqlite database is plain SQLite (parity with the shipped WatermelonDB setup, which never passed an encryption key). Row ids are generated with a non-cryptographic unique-id scheme owned by `sqlite-storage-core`.
**Migration**: None — no call sites existed. If at-rest encryption is introduced later, op-sqlite's SQLCipher compile target plus a Keychain/Keystore-held key is the sanctioned path (documented in `design.md`).
