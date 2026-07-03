## ADDED Requirements

### Requirement: A reconciliation check proves all version anchors agree post-bump

The release process SHALL provide a read-only reconciliation check that, for a target version `x.y.z`, asserts that `package.json:version`, `app.json:version`, `android/app/build.gradle` `versionName`, and iOS `ios/Visara.xcodeproj/project.pbxproj` `MARKETING_VERSION` (all configurations) are ALL exactly `x.y.z`, and that Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` (all configurations) all equal the derived `major*10000 + minor*100 + patch`. The check SHALL NOT write to any file. It SHALL fail (non-zero / explicit FAIL) if any anchor disagrees.

#### Scenario: Fully-agreeing anchors pass

- **WHEN** the reconciliation check runs after `npm run bump 3.0.0` succeeded on all sections
- **THEN** every anchor reads `3.0.0` / build number `30000` and the check passes

#### Scenario: A left-behind anchor fails the check

- **WHEN** iOS `MARKETING_VERSION` is still `1.0` while the other anchors read `3.0.0` (a fail-soft partial bump)
- **THEN** the reconciliation check reports the mismatch and fails, blocking the release

### Requirement: Reconciliation rejects an out-of-range derivation

The reconciliation check SHALL reject a target `x.y.z` whose `minor` or `patch` exceeds 99, because the `major*10000 + minor*100 + patch` derivation would produce a colliding or non-monotonic store build number.

#### Scenario: Component overflow is rejected

- **WHEN** the target version is `2.0.100` (patch 100, which derives to `20100` == `2.1.0`)
- **THEN** the reconciliation check rejects the version and the release does not proceed

### Requirement: Store build numbers are unique and monotonic per marketing version

The checklist SHALL require that each build uploaded to App Store Connect / TestFlight has a `CFBundleVersion` unique and increasing for its `CFBundleShortVersionString`, and each build uploaded to a Play track has a strictly increasing `versionCode`. Because the derivation (see `version-bump-mechanic`) yields the same build number for repeated builds of one marketing version, the checklist SHALL require a manual build-counter bump (increment `CURRENT_PROJECT_VERSION` / `versionCode` only) before a second upload of the same `x.y.z`.

#### Scenario: A second build of the same marketing version needs a counter bump

- **WHEN** a second TestFlight or Play build of the same `x.y.z` is prepared
- **THEN** the checklist requires `CURRENT_PROJECT_VERSION` / `versionCode` to be manually incremented above the previous upload before submission, so the store does not reject a duplicate/non-increasing build number

### Requirement: The newest-only OS/ABI floors are reflected in store-metadata expectations

The checklist SHALL verify, in the store consoles, that the shipping floors surface correctly: App Store Connect shows the app requires iOS 26.0 or later (TestFlight excludes devices below 26.0), and Play Console's device catalog reflects `minSdk 36` (Android 16) and an `arm64-v8a`-only ABI. The checklist SHALL also verify that the app-size / data-safety disclosures account for the multi-GB first-run on-device model download. These are console-side verifications; this change does not add a `fastlane`/`metadata` directory. Device-support claims (including that iPhone is not a supported on-device-inference device) are POC-dependent and confirmed against the #4/#6 result.

#### Scenario: iOS store min-OS matches the build floor

- **WHEN** the reviewer inspects the App Store Connect build compatibility for the release
- **THEN** it shows "Requires iOS 26.0 or later" consistent with `IPHONEOS_DEPLOYMENT_TARGET = 26.0`

#### Scenario: Play device catalog matches minSdk 36 + arm64

- **WHEN** the reviewer inspects the Play Console release's supported-device summary
- **THEN** it reflects `minSdk 36` (Android 16) and `arm64-v8a`-only, and the data-safety/app-size disclosure covers the on-device model download

### Requirement: The reconciliation surfaces non-build version anchors

The checklist SHALL note version anchors that the bump script intentionally does NOT rewrite so they are reconciled manually: the `README.md` "vX.Y.Z" mention (`README.md:215`) and the fact that the Settings screen displays `DeviceInfo.getVersion()` (the native marketing version) — which must read the new `x.y.z` on BOTH platforms after a correct bump, closing the prior "iOS 1.0 vs Android 2.0.0" drift.

#### Scenario: Settings shows the bumped version on both platforms

- **WHEN** a device build on the bumped `x.y.z` is launched after reconciliation
- **THEN** the Settings screen "Version" line (fed by `DeviceInfo.getVersion()`) shows the same `x.y.z` on both iOS and Android

#### Scenario: Doc anchor is reconciled manually

- **WHEN** the release is prepared
- **THEN** the checklist flags `README.md`'s hardcoded version for manual update, since the bump script does not edit docs
