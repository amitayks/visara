> Ordered top-to-bottom. Groups are tagged **(agent-run)** or **(HUMAN-run)**. This change edits only build tooling (`bump-version.js`) + release docs — no `src` code. BASELINE: `npx tsc --noEmit` currently reports **8** pre-existing `TS6133` unused-symbol errors in 4 unrelated UI files; every group must keep that count at **8** (zero NEW). The version bump, tag, and store submission (groups F–G) run only AFTER the #4/#6 on-device Gemma POC records **GO**; the tooling/reconciliation/notes prep (A–D) may run earlier. `<x.y.z>` = the version chosen in F1 (recommended `3.0.0`).

## 1. (A) Repair the bump tooling — (agent-run)

- [x] 1.1 In `bump-version.js`, hoist `const [major, minor, patch] = newVersion.split(".").map(Number);` to module scope, immediately after the `^\d+\.\d+\.\d+$` validation, and remove the per-`try` re-declarations in §3/§4/§5 so the final summary `console.log` no longer throws `ReferenceError: major is not defined`.
- [x] 1.2 Repoint the iOS pbxproj write (§4) from `ios/VisaraApp.xcodeproj/project.pbxproj` to `ios/Visara.xcodeproj/project.pbxproj`; keep the `/g` replaces for `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` (they cover both build configs at `:339/347` and `:367/374`).
- [x] 1.3 Repoint the Info.plist array (§5) from `ios/VisaraApp/Info.plist` + `ios/VisaraAppTests/Info.plist` to `ios/Visara/Info.plist` only; keep the `if (!plistContent.includes("$(MARKETING_VERSION)"))` guard so the variable-driven plist (`ios/Visara/Info.plist:19-24`) is a deliberate no-op.
- [x] 1.4 Add a section-failure flag: keep the per-section `try/catch`, but if any section caught an error, `process.exit(1)` at the end so a partial (fail-soft) bump is never reported as success.
- [x] 1.5 Add a code comment documenting the `versionCode = major*10000 + minor*100 + patch` derivation and its two constraints (A: minor/patch ≤ 99; B: build number is per-marketing-version, so repeat store uploads need a manual counter bump).
- [x] 1.6 Dry-run on a scratch branch: run `node bump-version.js 9.9.9`, confirm ALL of `package.json`, `app.json`, `android/app/build.gradle`, and `ios/Visara.xcodeproj/project.pbxproj` change (grep for `9.9.9` / `MARKETING_VERSION = 9.9.9` / `versionCode 99909`), the summary prints, exit code is 0, then `git checkout` to discard.

## 2. (B) First reconciling bump + reconciliation cross-check — (agent-run; HUMAN confirms)

- [x] 2.1 (Blocked on F1 version choice) Run `npm run bump <x.y.z>`; confirm iOS moves off the drifted `MARKETING_VERSION = 1.0;` / `CURRENT_PROJECT_VERSION = 1;` to `<x.y.z>` / the derived build number, closing the pre-existing iOS-vs-JS/Android drift.
- [x] 2.2 Add a read-only reconciliation check (a small script under the existing `scripts` convention, or a documented command list) that asserts `package.json`, `app.json`, `android/app/build.gradle` versionName, and every pbxproj `MARKETING_VERSION` all equal `<x.y.z>`, and every `versionCode`/`CURRENT_PROJECT_VERSION` equals `major*10000+minor*100+patch`; it MUST NOT write.
- [x] 2.3 Run the reconciliation check against the bumped tree; confirm it passes (all anchors agree) and that it FAILS on a deliberately mismatched anchor (revert one field, re-run, restore).
- [x] 2.4 Confirm the reconciliation rejects a component-ceiling breach (dry-run target `2.0.100`) rather than emitting the colliding code `20100`.
- [x] 2.5 Note the one-time `app.json` trailing-newline diff (the file had no final newline; the script writes `\t`-indented JSON + `\n`) so it is not mistaken for corruption; confirm `npm run lint` is clean on it.

## 3. (C) Release notes — (agent seeds; HUMAN finalizes post-GO)

- [x] 3.1 Create `release-notes/<x.y.z>.md` with the skeleton: headline, what's-new bullets, user-impact/requirements, known limitations, and a short store "what's new" form.
- [x] 3.2 Fill the user-impact/requirements section now (floors are known): requires iOS 26.0+ and Android 16 (minSdk 36)+ on `arm64-v8a`; older-OS / 32-bit / `x86`-only devices no longer receive the update.
- [x] 3.3 Mark the on-device-AI "what's new" copy, supported-device claims, and any min-RAM guidance as **POC-dependent** placeholders. (HUMAN, post-GO) Finalize them against the #4/#6 POC's real output shape/latency/quality; if NO-GO, do not publish the AI release.

## 4. (D) Store-metadata & build-number reconciliation — (HUMAN-run, console)

- [ ] 4.1 (HUMAN) In App Store Connect, verify the release build shows "Requires iOS 26.0 or later" and TestFlight excludes < 26.0 devices; capture the reviewer note that iPhone is not a supported on-device-inference device (POC-dependent).
- [ ] 4.2 (HUMAN) In Play Console, verify the release's device catalog reflects `minSdk 36` (Android 16) + `arm64-v8a`-only, and that the data-safety / app-size disclosures account for the multi-GB first-run model download.
- [ ] 4.3 (HUMAN) Confirm build-number uniqueness: before any SECOND store upload of the same `<x.y.z>`, manually increment `CURRENT_PROJECT_VERSION` (iOS) / `versionCode` (Android) above the prior upload, since the derivation reuses the number for one marketing version.
- [x] 4.4 (HUMAN) Manually update the `README.md` "vX.Y.Z" mention (`README.md:215`) to `<x.y.z>` — the bump script does not touch docs.

## 5. (E) Full-build acceptance — (agent JS + arm64 sim post-#8; HUMAN device builds)

- [x] 5.1 (agent) Build a Metro production bundle for the release and confirm it is produced without error.
- [ ] 5.2 (agent, post-#8) Build/install/launch the Debug app on the arm64 iOS/iPadOS 26 Simulator; confirm it boots and the Settings "Version" line reads `<x.y.z>`.
- [ ] 5.3 (HUMAN) Build/install/launch on a real iOS device on `<x.y.z>`; confirm it boots and Settings shows `<x.y.z>` (fed by `DeviceInfo.getVersion()`, `src/screens/Settings/SettingsScreen.tsx:11` → `src/components/organisms/SettingsDrawer.tsx:378`).
- [ ] 5.4 (HUMAN) Build/install/launch on a real Android flagship (arm64-v8a) on `<x.y.z>`; confirm Settings shows `<x.y.z>` and there is no ML-Kit-path regression.
- [ ] 5.5 (HUMAN) Confirm the Settings version now matches on BOTH platforms (the prior "iOS 1.0 vs Android 2.0.0" drift is closed).

## 6. (F) Bump-level decision & ship — (HUMAN-run, post-GO)

- [ ] 6.1 (HUMAN) Decide the bump level and `<x.y.z>`: recommendation is **major → `3.0.0`** (wholesale engine replacement + breaking dropped-device support). Flagged as the human's call; marketing narrative and semver-vs-marketing choice included.
- [ ] 6.2 (HUMAN, post-GO) After the #4/#6 POC records GO and groups B–E pass, commit the bump + notes, `git tag v<x.y.z>`, push, and submit to the stores. NO-GO halts the release.

## 7. (G) Verify — baseline-relative — (agent-run)

- [x] 7.1 `npm run typecheck` (`tsc --noEmit`) reports exactly **8** `TS6133` errors (the baseline) — ZERO new typecheck errors (tooling/docs are outside `tsc` include; `src` is untouched).
- [x] 7.2 Metro production-bundle check: the bundle is produced without error (from 5.1).
- [x] 7.3 `npm run lint` (Biome — tabs, double quotes, no `any`) is clean on `bump-version.js`, the reconciliation script, and the release-notes file.
- [x] 7.4 `openspec validate product-version-bump-release --strict` passes.
