## ADDED Requirements

### Requirement: Each release has a tracked release-notes document

The release process SHALL produce a version-controlled release-notes file for the release version (e.g. `release-notes/<x.y.z>.md`). The file SHALL contain: a headline, "what's new" bullets, a "user impact / requirements" section, a "known limitations" section, and a short store "what's new" form suitable for App Store Connect / Play Console and the git tag annotation. The document SHALL be reviewable in-repo before submission, not authored only in the store console.

#### Scenario: The release notes file exists and is complete

- **WHEN** the release for version `x.y.z` is prepared
- **THEN** `release-notes/<x.y.z>.md` exists and contains a headline, what's-new bullets, a user-impact/requirements section, a known-limitations section, and a short store form

#### Scenario: Notes are reviewable before store submission

- **WHEN** the release is reviewed
- **THEN** the release notes are present in the git diff/tag for that version, not solely in the store console

### Requirement: Release notes state the raised-floor user impact

The release notes SHALL explicitly state the newest-only support change: the app now requires iOS 26.0 or later and Android 16 (API 36) or later on `arm64-v8a` devices, and that devices below these floors (older OS, 32-bit/`x86`-only) no longer receive the update. This section MAY be finalized before the on-device-AI POC gate, because the floors are already fixed by the predecessor changes.

#### Scenario: The floor change is disclosed to users

- **WHEN** a reader opens the release notes
- **THEN** they find an explicit statement of the iOS 26.0 / Android 16 (minSdk 36) + arm64-v8a requirement and that unsupported older devices will not receive the update

### Requirement: The on-device-AI "what's new" copy is finalized only after the POC GO gate

The release-notes AI-capability copy (what the on-device Gemma feature actually does for the user), the supported-device claims, and any minimum-RAM/device-class guidance SHALL be written to match the real behavior reported by the #4/#6 on-device Gemma POC, and SHALL be finalized only after that POC returns GO. If the POC returns NO-GO, the AI-capability release SHALL NOT proceed.

#### Scenario: AI copy is deferred until GO

- **WHEN** the release notes are drafted before the #4/#6 POC decision
- **THEN** the AI-capability "what's new" copy is marked provisional/POC-dependent and is finalized against the POC's actual output shape, latency, and quality once GO is recorded

#### Scenario: NO-GO halts the AI release

- **WHEN** the #4/#6 POC records NO-GO
- **THEN** the on-device-AI product release is not shipped and the release notes for the AI capability are not published
