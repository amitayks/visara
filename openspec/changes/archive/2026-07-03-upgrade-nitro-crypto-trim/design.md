## Context

Post-platform-change state: RN 0.86, nitro-modules 0.36.1 already in the tree (mmkv 4). quick-crypto 0.7.x predates Hermes V1/prebuilt-core; 1.1.5 is the Nitro line. vision-camera 4.7.2 compiles on every build yet has zero imports (verified by repo-wide grep; installed by spec-kit task T007 for a feature that was never implemented — only its permissions copy shipped).

## Goals / Non-Goals

**Goals:** quick-crypto on the maintained 1.x line with the key path verified end-to-end; dead camera dependency removed; builds and boot green on both platforms.

**Non-Goals:** camera capture implementation (re-add vision-camera 5.x + nitro peers then); crypto API expansion; touching keychain/DB key storage.

## Decisions

1. **Remove vision-camera rather than bump it** — research-recommended: zero JS migration exists either way (no imports), removal deletes a native compile unit and future upgrade surface; permissions stay so the manifest story is unchanged when the feature lands.
2. **quick-crypto 1.1.5 exact + quick-base64 ^3.0.0** — 1.x peer set per npm verification; nitro pin shared with mmkv (single-substrate rule from the platform change).
3. **No EncryptionService rewrite.** 1.x preserves the node-style `randomBytes(size)` returning a Buffer-like with `toString("hex")`. If typecheck disagrees, adapt the one line, not the service.

## Risks / Trade-offs

- **randomBytes shape drift in 1.x** (Buffer polyfill vs ArrayBuffer): caught by tsc + a boot-time key-generation smoke; one-line fix if it bites.
- **Removing a dep some hidden runtime path uses**: mitigated by repo-wide grep (zero imports) + full boot & drive after removal.
- Existing encrypted data: read path never touches quick-crypto (keys load from Keychain verbatim) — regression structurally impossible; still verified by DB-opens-on-boot check.
