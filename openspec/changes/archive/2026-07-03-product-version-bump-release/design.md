## Context

This is the terminal change of the ML-Kit → on-device-Gemma-4 migration wave: the mechanic that turns the merged predecessor work into a shipped product version. It packages, versions, documents, reconciles, and build-accepts a release — it does **not** decide GO (the #4/#6 on-device Gemma POC does) and does not tune the model.

**Current state (verified in-repo):**
- **Versions are drifted because the bump tool is broken.** `package.json:version = "2.0.0"`, `app.json:version = "2.0.0"`, `android/app/build.gradle:85-86` = `versionCode 20000` / `versionName "2.0.0"` — but iOS `ios/Visara.xcodeproj/project.pbxproj` still reads `MARKETING_VERSION = 1.0` (`:347,374`) and `CURRENT_PROJECT_VERSION = 1` (`:339,367`). `ios/Visara/Info.plist:19-24` defers both to `$(MARKETING_VERSION)`/`$(CURRENT_PROJECT_VERSION)`, so the pbxproj is the sole iOS source of truth.
- **Root cause — two defects in `bump-version.js`:**
  1. **iOS writes go to phantom paths.** §4 targets `ios/VisaraApp.xcodeproj/project.pbxproj`; §5 targets `ios/VisaraApp/Info.plist` + `ios/VisaraAppTests/Info.plist`. On disk only `ios/Visara.xcodeproj/project.pbxproj` and `ios/Visara/Info.plist` exist (`ios/VisaraApp.xcodeproj/` is an empty stale husk — just a `project.xcworkspace`, no `project.pbxproj`; `ios/VisaraApp/` and `ios/VisaraAppTests/` do not exist). `existsSync()` ⇒ false ⇒ "⚠️ iOS project.pbxproj not found, skipping iOS update". **iOS is never versioned.**
  2. **Trailing `ReferenceError`.** `const [major, minor, patch] = ...` is declared **inside** each `try` block (§3, §4, §5). The final summary `console.log(...major*10000...)` runs at module scope after those blocks close ⇒ `major is not defined` ⇒ uncaught throw, non-zero exit. Writes already happened, so the crash hides that a run "worked".
- **Live symptom:** the Settings screen renders `DeviceInfo.getVersion()` (`src/screens/Settings/SettingsScreen.tsx:11`, `src/navigation/MainNavigator.tsx:42` → `src/components/organisms/SettingsDrawer.tsx:378`, "Version {appVersion}"). `getVersion()` returns the native marketing version, so **iOS shows "Version 1.0" and Android shows "2.0.0" right now.**
- **OS/ABI floors already set by predecessor work:** iOS — `ios/Podfile:9` `platform :ios, '26.0'`, all `IPHONEOS_DEPLOYMENT_TARGET = 26.0` (`project.pbxproj:342,369,439,511`). Android — `android/build.gradle:4-6` `minSdkVersion = 36` / `compileSdkVersion = 36` / `targetSdkVersion = 36`, and the `arm64-v8a`-only ABI filter from the executorch change. These are **floor** settings, orthogonal to the version bump; this change **verifies** they surface correctly in store metadata but does not re-edit them.
- **No release infrastructure exists yet:** no `fastlane/`, no `metadata/`, no `CHANGELOG`/`RELEASE` file. `README.md:215` hardcodes "v2.0.0". `.gitignore:136-137` ignores `android/gradle.properties` + `*.properties`.

**Stakeholders:** the human owns GO/NO-GO (#4/#6), the final bump-level decision, the marketing narrative, and all store-console submissions; the agent owns the tooling repair, the JS-verifiable acceptance legs, and the reconciliation script.

## Goals / Non-Goals

**Goals:**
- Make `npm run bump <x.y.z>` rewrite **all four** platform anchors correctly and exit clean, with the iOS section pointed at the real `ios/Visara.xcodeproj`/`ios/Visara/Info.plist`.
- Close the existing iOS-vs-JS/Android version drift as the first bump of this release.
- Produce a per-release, tracked release-notes document tuned to the on-device-AI jump and the raised-floor user impact.
- Define a reconciliation checklist that catches drift, partial (fail-soft) bumps, and non-unique store build numbers.
- Verify iOS 26.0 / Android minSdk 36 + arm64-only are reflected in store-metadata expectations.
- Define a final full-build acceptance across iOS device + arm64 iOS-26 Simulator (post-#8) + Android, baseline-relative typecheck + Metro-bundle + lint.
- Recommend the bump level (major) and explicitly leave the decision to the human.

**Non-Goals:**
- Deciding GO/NO-GO, tuning Gemma, or touching `ProcessingService`/engines/schema/search — none of that is release plumbing.
- Re-editing the OS/ABI floors (owned by the executorch + device-capability changes) — only verifying they surface in store metadata.
- Building CI/CD, `fastlane`, automated store upload, or code signing — out of scope; this is the manual, reproducible bump path.
- Deleting the stale `ios/VisaraApp.xcodeproj` husk (a separate cleanup; the fix only stops writing to it).
- Auto-editing `README.md` or other docs from the script.

## Decisions

### D1: Fix `bump-version.js` by repointing iOS to the real project, not by renaming the project

Repoint §4 to `ios/Visara.xcodeproj/project.pbxproj` and §5's plist array to `[ios/Visara/Info.plist]` (drop the non-existent `VisaraAppTests` entry, or leave a guarded existence check). The real `Info.plist` already contains `$(MARKETING_VERSION)`/`$(CURRENT_PROJECT_VERSION)` (`ios/Visara/Info.plist:19-24`), so §5's existing `if (!plistContent.includes("$(MARKETING_VERSION)"))` guard makes the plist a deliberate no-op — the pbxproj `/g` replaces (which already handle **both** build configs at `:339/347` and `:367/374`) are the whole iOS fix once the path is right.

**Alternatives:** rename the Xcode project back to `VisaraApp` to match the script — rejected; the shipping project is `Visara.xcodeproj` (Podfile, workspace, executorch change all reference it), so the script must follow the code, not vice-versa. Hardcode the version into `Info.plist` instead of `$(...)` — rejected; the variable indirection is correct and means one source of truth (pbxproj).

### D2: Parse `[major, minor, patch]` once at module scope; keep per-section try/catch but exit non-zero on any failure

Hoist `const [major, minor, patch] = newVersion.split(".").map(Number);` to just after version validation so §3/§4/§5 and the summary all share it — this removes the trailing `ReferenceError`. Keep the per-section `try/catch` (a bad regex in one file shouldn't abort the others mid-write) **but** track a failure flag and `process.exit(1)` at the end if any section failed, so a partial bump is never reported as success. Today the script swallows section errors and (crash aside) would exit 0 — the reconciliation checklist (D6) is the backstop, but a correct exit code is the first line of defense.

**Alternatives:** wrap the whole script in one try/catch — rejected; one file's failure would silently skip the rest with no per-file signal. Leave exit code at 0 — rejected; CI and humans need a fail signal.

### D3: Keep the `versionCode = major*10000 + minor*100 + patch` derivation, and document its two hard constraints

The scheme (`2.0.0 → 20000`, `3.0.0 → 30000`) is monotonic for normal bumps and already used at `android/app/build.gradle:85`. Keep it, but the spec/checklist MUST state:
- **Constraint A — component ceiling:** minor and patch MUST stay `≤ 99`. `2.0.100` → `20100` == `2.1.0`; `2.100.0` overflows the minor band. Bumps that would breach this are rejected at reconcile time.
- **Constraint B — one build number per marketing version (the important one):** iOS `CURRENT_PROJECT_VERSION` and Android `versionCode` are **derived from the marketing version**, so two builds of the *same* `x.y.z` get the *same* store build number. App Store Connect / TestFlight reject a duplicate `CFBundleVersion` for a given `CFBundleShortVersionString`; Play rejects a non-increasing `versionCode` on a track. A big-AI release that iterates on TestFlight/internal testing **will** need multiple builds of one marketing version, so the release process includes a manual **build-counter bump** (increment `CURRENT_PROJECT_VERSION` / `versionCode` only) between store uploads of the same `x.y.z`.

**Alternatives:** encode a monotonic build counter (e.g. CI run number, or `git rev-list --count`) into `CURRENT_PROJECT_VERSION`/`versionCode` — the correct long-term fix, but it changes the derivation contract and belongs to a follow-up; documented in Open Questions. Timestamp-based codes — rejected; harder to reason about and can exceed Play's `versionCode` 2.1B ceiling.

### D4: Release notes live as a tracked per-release file, seeded now, POC-copy deferred

Add a tracked release-notes document (e.g. `release-notes/<x.y.z>.md`) with a fixed skeleton: headline (on-device AI), what's-new bullets, the **raised-floor user impact** ("now requires iOS 26 / Android 16, arm64 devices; some older devices no longer supported"), known limitations, and a store-"what's new" short form. The floor/impact section can be finalized now (the floors are known); the **AI-capability copy is POC-dependent** and is filled after #4/#6 GO with the model's real behavior.

**Alternatives:** generate notes from git log — rejected; user-facing "what's new" is editorial, not a commit dump. Keep notes only in the git tag / store console — rejected; not reviewable in-repo and easily lost.

### D5: Store-metadata floors are a human reconciliation step, not a repo artifact

There is no `fastlane`/`metadata/` in-repo, so "reflect the newest-only floors in store metadata" is a checklist of console-side verifications: App Store Connect shows **Requires iOS 26.0**, TestFlight compatibility excludes < 26.0 devices; Play Console device catalog reflects **minSdk 36 (Android 16)** + **`arm64-v8a`-only**, and the data-safety / app-size disclosures account for the multi-GB first-run model download. The build's own deployment target + `minSdk` + `abiFilters` (already set) drive these; the step verifies the console matches, and captures the reviewer note that iPhone is not a supported inference device (POC-dependent).

**Alternatives:** scaffold `fastlane` supply/deliver metadata now — rejected as scope creep; no store-automation exists and adding it is a separate initiative.

### D6: Reconciliation is a runnable, read-only cross-check plus a human console checklist

Provide a small **read-only** reconciliation step (a script under the existing `scripts`/tooling convention, or a documented `openspec`-style checklist) that parses all four anchors and asserts they equal the target `x.y.z`, that Android `versionCode`/iOS build number match the derivation, and that no anchor was left behind by a fail-soft bump. It reads native files (`DeviceInfo.getVersion()` parity is implied) and **must not write**. The console-side items (D5, build-number uniqueness from D3) are human checkboxes. This is the safety net for D2's per-section fail-soft behavior.

**Alternatives:** trust the bump script alone — rejected; it `catch`es per section and (pre-D2) exits 0 on partial success, which is exactly how the iOS drift went unnoticed.

### D7: Final acceptance = three real builds, split agent/HUMAN, baseline-relative, gated on GO

The release is accepted only when: (E-agent) `npm run typecheck` at the **8 `TS6133` baseline with zero NEW**, a **Metro-bundle** production-bundle check, and `npm run lint` all pass; (E) the **arm64 iOS-26 Simulator** build/install/launch is green — this leg is unblocked by **#8** (the arm64-sim build-fix), so it is explicitly *post-#8*; (F-HUMAN) a real **iOS device** build + a real **Android flagship** build install, launch, and show the bumped version in Settings, on the release `x.y.z`. This runs **after** the #4/#6 POC returns GO; NO-GO halts the release.

**Alternatives:** accept on JS checks only — rejected; the whole migration is native (RNE xcframework/prefab), so a green `tsc` proves nothing about the shipped binaries. Include an iPhone device leg — rejected; the inference gate is iPad Pro + Android flagship, no iPhone (POC-dependent).

### D8 (RECOMMENDATION — the human's call): bump **major → `3.0.0`**

From the current `2.0.0`, this reads as a **major** bump under semver for two independent reasons: (1) a wholesale engine replacement (ML Kit → on-device Gemma-4 multimodal) that changes the app's core behavior, and (2) a **breaking support-matrix change** — raising the floors to iOS 26.0 / Android 16 (minSdk 36) + `arm64-v8a`-only **drops** every user on an older OS or 32-bit/`x86`-only device; those installs stop receiving updates. Recommendation: **`3.0.0`**. This is explicitly **flagged as the human's decision** — marketing may prefer a different narrative, and a team may version the product marketing string independently of strict semver. Whatever `x.y.z` is chosen, D3's constraints and the reconciliation gate apply unchanged.

## Risks / Trade-offs

- **[Partial/fail-soft bump leaves anchors drifted]** → D2 exit-code + the D6 reconciliation cross-check catch any anchor left behind; the release cannot be accepted until all four equal `x.y.z`.
- **[Duplicate store build number blocks a second TestFlight/internal build of one marketing version]** (Constraint B) → release process includes a manual build-counter bump between same-version uploads; Open Question tracks encoding a real counter.
- **[iOS floor 26.0 + arm64/Android-16 shrinks the addressable audience sharply]** → intended (newest-only stakeholder override); surfaced in release notes (D4) and store-metadata verification (D5) so it is a deliberate, disclosed choice, not a surprise.
- **[Component-ceiling overflow produces a silently wrong `versionCode`]** (Constraint A) → reconciliation rejects any `x.y.z` with minor/patch > 99.
- **[Bump touches `app.json` whitespace]** — `app.json` currently ends with no trailing newline; the script rewrites it tab-indented + `\n`. → one-time Biome-clean diff, noted in the checklist so it isn't mistaken for corruption.
- **[Release proceeds before GO]** → D7 gates acceptance on the #4/#6 decision; NO-GO halts. The reconciliation/notes work can be prepared earlier, but the bump/tag/submit steps wait for GO.
- **[Stale `ios/VisaraApp.xcodeproj` husk causes future confusion]** → out of scope to delete, but D1 stops writing to it and the design records that `Visara.xcodeproj` is the live project.

## Migration Plan

1. **Repair tooling (agent):** apply D1 + D2 to `bump-version.js`; dry-run against a scratch branch and diff.
2. **First reconciling bump (agent):** run `npm run bump <x.y.z>` (the chosen major, e.g. `3.0.0`); confirm iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` now move off `1.0`/`1` and all four anchors agree — this closes the pre-existing drift.
3. **Reconcile (agent + HUMAN):** run the D6 cross-check; complete the D5 store-metadata + D3 build-number-uniqueness console checklist.
4. **Release notes (agent seeds, HUMAN finalizes post-GO):** fill the D4 skeleton; floor/impact now, AI copy after #4/#6 GO.
5. **Acceptance (D7):** agent JS legs + arm64 sim (post-#8); HUMAN iOS-device + Android-flagship builds on the bumped version.
6. **Ship (HUMAN, post-GO):** commit, `git tag v<x.y.z>`, push, submit to the stores.

**Rollback:** the bump is a pure text rewrite across four files (+ notes); `git revert`/`git checkout` restores prior versions. No data migration, no runtime state, no schema — rollback is trivial. If a store build is already uploaded, roll forward with a build-counter bump (Constraint B) rather than reusing a number.

## Open Questions

- **Encode a monotonic build counter?** Should `CURRENT_PROJECT_VERSION`/`versionCode` derive from a real counter (CI run, `git rev-list --count`) instead of the marketing version, to remove the manual same-version build bump (Constraint B)? Deferred to a follow-up; affects the derivation contract.
- **Final bump level & marketing string** (D8) — `3.0.0` recommended; the human confirms `x.y.z` and whether marketing tracks semver.
- **POC-dependent release content** (blocked on #4/#6 GO): the release-notes AI "what's new" copy, store data-safety/app-size disclosures for the multi-GB model download, supported-device claims (iPhone currently excluded from inference), and any minimum-RAM guidance surfaced from the device-capability #5 policy. All are finalized only after the POC reports real output shape/latency/quality — and only if GO is reached.
