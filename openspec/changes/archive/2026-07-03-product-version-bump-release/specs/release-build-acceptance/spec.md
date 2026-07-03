## ADDED Requirements

### Requirement: JS acceptance is baseline-relative and Metro-bundleable

The release SHALL pass an agent-run JS acceptance: `npm run typecheck` (`tsc --noEmit`) reports exactly the pre-existing baseline of 8 `TS6133` unused-symbol errors and ZERO new typecheck errors; a Metro production-bundle check produces a bundle without error; and `npm run lint` (Biome — tabs, double quotes, `noExplicitAny: error`) is clean on any file this change touched. Because this change edits only build tooling (`bump-version.js`) and adds release docs, it SHALL introduce no new `src` typecheck or lint findings.

#### Scenario: Typecheck stays at the baseline

- **WHEN** `npm run typecheck` runs on the release branch
- **THEN** it reports exactly 8 `TS6133` errors and no other errors

#### Scenario: The app still bundles

- **WHEN** a Metro production bundle is generated for the release
- **THEN** the bundle is produced without error

#### Scenario: Lint is clean on touched files

- **WHEN** `npm run lint` runs
- **THEN** the files touched by this change report no Biome violations

### Requirement: The release is accepted on three real builds

The release SHALL be accepted only when all three native builds pass on the bumped version `x.y.z`: (1) an arm64 iOS/iPadOS 26 Simulator build/install/launch, (2) a real iOS device build/install/launch, and (3) a real Android flagship (arm64-v8a) build/install/launch. Each SHALL boot the app and show the bumped `x.y.z` in the Settings "Version" line. The arm64 iOS-Simulator leg depends on change #8 (the arm64-simulator build-fix) and is therefore performed only post-#8.

#### Scenario: arm64 iOS-26 Simulator build is green (post-#8)

- **WHEN** the Debug app is built, installed, and launched on the arm64 iOS/iPadOS 26 Simulator after change #8 has landed
- **THEN** it builds, boots, and the Settings version reads the release `x.y.z`

#### Scenario: iOS device and Android flagship builds are green

- **WHEN** the app is built, installed, and launched on a real iOS device and on a real Android flagship (arm64-v8a), each on the bumped `x.y.z`
- **THEN** both boot successfully and the Settings version reads `x.y.z` on both, with no ML-Kit-path regression

### Requirement: Acceptance runs only after the on-device Gemma POC returns GO

The full-build acceptance and the subsequent tag/submit SHALL run only after the #4/#6 on-device Gemma POC records GO. A NO-GO decision SHALL halt the AI-capability release. The tooling repair, reconciliation, and floor/impact release-notes preparation MAY be completed before the gate, but the version bump, tag, and store submission wait for GO.

#### Scenario: GO unblocks acceptance and submission

- **WHEN** the #4/#6 POC records GO
- **THEN** the release proceeds to full-build acceptance, tagging, and store submission on the bumped `x.y.z`

#### Scenario: NO-GO halts the release

- **WHEN** the #4/#6 POC records NO-GO
- **THEN** the version bump/tag/submit for the AI capability does not proceed
