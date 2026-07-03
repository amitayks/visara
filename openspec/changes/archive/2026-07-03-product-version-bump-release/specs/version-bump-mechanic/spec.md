## ADDED Requirements

### Requirement: `npm run bump <x.y.z>` rewrites all four platform version anchors

The `npm run bump <x.y.z>` script (`bump-version.js`) SHALL, given a valid semver `x.y.z`, rewrite the version in ALL of: `package.json` (`version`), `app.json` (`version`), `android/app/build.gradle` (`versionName` and `versionCode`), and the iOS Xcode project `ios/Visara.xcodeproj/project.pbxproj` (`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION`, all build configurations). It SHALL reject an argument that is missing or does not match `^\d+\.\d+\.\d+$` with a non-zero exit and a usage message, writing nothing.

#### Scenario: A valid version updates every anchor

- **WHEN** `npm run bump 3.0.0` runs on a clean tree
- **THEN** `package.json` and `app.json` both read `"version": "3.0.0"`, `android/app/build.gradle` reads `versionName "3.0.0"`, and `ios/Visara.xcodeproj/project.pbxproj` reads `MARKETING_VERSION = 3.0.0;` in every build configuration

#### Scenario: A malformed version is rejected without writing

- **WHEN** `npm run bump 3.0` or `npm run bump` runs
- **THEN** the script prints a usage/error message, exits non-zero, and leaves all version files unchanged

### Requirement: The iOS section targets the real Xcode project, not the stale husk

The script SHALL write iOS version fields to `ios/Visara.xcodeproj/project.pbxproj` and (where present) `ios/Visara/Info.plist`. It SHALL NOT depend on the non-existent `ios/VisaraApp.xcodeproj/project.pbxproj`, `ios/VisaraApp/Info.plist`, or `ios/VisaraAppTests/Info.plist`. Because `ios/Visara/Info.plist` defines `CFBundleShortVersionString`/`CFBundleVersion` as `$(MARKETING_VERSION)`/`$(CURRENT_PROJECT_VERSION)`, the pbxproj SHALL be the single iOS source of truth and the Info.plist edit SHALL be a deliberate no-op guarded by detecting those variables.

#### Scenario: iOS marketing/build versions actually change

- **WHEN** `npm run bump 3.0.0` runs while `project.pbxproj` currently reads `MARKETING_VERSION = 1.0;` / `CURRENT_PROJECT_VERSION = 1;`
- **THEN** after the run every `MARKETING_VERSION` reads `3.0.0` and every `CURRENT_PROJECT_VERSION` reads the derived build number, and the script does NOT print "iOS project.pbxproj not found"

#### Scenario: Variable-driven Info.plist is left untouched

- **WHEN** the script processes `ios/Visara/Info.plist` and finds `$(MARKETING_VERSION)` present
- **THEN** it leaves the plist's version strings unchanged (the pbxproj carries the real values) and does not corrupt the file

### Requirement: The store build number is derived and its constraints are enforced

The script SHALL compute the Android `versionCode` and the iOS `CURRENT_PROJECT_VERSION` as `major*10000 + minor*100 + patch` from `x.y.z`. This derivation SHALL be documented alongside two constraints: (A) `minor` and `patch` MUST each be `≤ 99`, otherwise the derived code is non-monotonic or collides; (B) because the build number is derived solely from the marketing version, two builds of the SAME `x.y.z` produce the SAME store build number, which requires a manual build-counter bump between store uploads of one marketing version.

#### Scenario: Derivation matches for a normal version

- **WHEN** `x.y.z = 3.0.0`
- **THEN** Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` are both `30000`

#### Scenario: Component-ceiling breach is flagged

- **WHEN** a bump target has `minor > 99` or `patch > 99` (e.g. `2.0.100`)
- **THEN** the derivation is documented as invalid for that input and the reconciliation step (see `version-file-reconciliation`) rejects it rather than silently emitting a colliding code

### Requirement: The script exits clean and signals partial failure

The script SHALL run to completion without throwing (no reference to `major`/`minor`/`patch` outside their defined scope), and SHALL parse `[major, minor, patch]` exactly once. It SHALL keep per-section error handling so one file's failure does not abort the others mid-write, but SHALL exit non-zero if ANY section failed, so a partial bump is never reported as success.

#### Scenario: A successful bump prints next steps and exits zero

- **WHEN** all four anchors update successfully
- **THEN** the script prints its summary and next-steps guidance and exits with code 0, with no `ReferenceError`

#### Scenario: A section failure yields a non-zero exit

- **WHEN** one target file cannot be updated (e.g. a regex finds no match) while others succeed
- **THEN** the script reports which section failed and exits non-zero, so the caller/CI treats the bump as incomplete
