## ADDED Requirements

### Requirement: A coarse device-capability policy decides Tier-1 eligibility

The system SHALL provide an all-static `DeviceCapabilityService` that computes, from `react-native-device-info`, whether the device is eligible to ever run the heavy Tier-1 (Gemma) pass. Eligibility SHALL require ALL of: total RAM ≥ a configured floor (default **6 GiB**, `getTotalMemory()`), the device is NOT reported low-RAM (`isLowRamDevice()` is false), and on Android the supported ABIs (`supportedAbis()`) include `arm64-v8a`. The policy floors SHALL be named constants so they are tunable without touching call sites. A device that fails the policy SHALL be treated as Tier-0-only.

#### Scenario: A capable device is class-eligible

- **WHEN** `DeviceCapabilityService.isDeviceClassEligible()` runs on a device with ≥ 6 GiB RAM, `isLowRamDevice() === false`, and `arm64-v8a` among its ABIs
- **THEN** it resolves `true`

#### Scenario: A low-RAM device is not eligible

- **WHEN** the device reports total RAM below the floor OR `isLowRamDevice() === true`
- **THEN** `isDeviceClassEligible()` resolves `false`

#### Scenario: A non-arm64 Android device is not eligible

- **WHEN** `supportedAbis()` on Android does not include `arm64-v8a`
- **THEN** `isDeviceClassEligible()` resolves `false` (the Tier-1 runtime ships arm64-v8a only)

### Requirement: Free-disk headroom for Tier-1 is checked live, not cached

The service SHALL expose `hasDiskHeadroomForTier1()` that reads `getFreeDiskStorage()` at call time and returns whether free space meets a configured headroom floor (default **6 GiB**, sized to hold the ~3.2–4.4 GB Tier-1 model plus working slack). Free disk SHALL NOT be cached, because it changes as the user fills or frees storage.

#### Scenario: Sufficient free disk passes the headroom check

- **WHEN** `hasDiskHeadroomForTier1()` runs and `getFreeDiskStorage()` reports at least the headroom floor
- **THEN** it resolves `true`

#### Scenario: Low free disk fails the headroom check

- **WHEN** free disk is below the headroom floor at the moment of the check
- **THEN** `hasDiskHeadroomForTier1()` resolves `false`, even if a prior check had passed

### Requirement: The static capability verdict is cached and versioned

The service SHALL cache the STATIC class signals (total RAM, supported ABIs, low-RAM flag, device id/model, and the computed class-eligibility verdict) in MMKV under a dedicated key, so repeated eligibility checks do not re-query native each time. The cache SHALL be keyed/invalidated by app version (and device id) so a new build re-evaluates the policy. Live free disk SHALL NOT be part of the cached snapshot.

#### Scenario: Second eligibility check reuses the cached snapshot

- **WHEN** `isDeviceClassEligible()` has already run once in this app version and is called again
- **THEN** it returns the cached class verdict without re-reading the static native signals

#### Scenario: A new app version re-evaluates capability

- **WHEN** the app version differs from the one stored in the cached snapshot
- **THEN** the snapshot is discarded and the class signals are re-read and re-cached

### Requirement: canRunTier1 composes capability AND thermal and fails closed

The service SHALL expose `canRunTier1()` as the single check the OrchestratorService / Tier-1 selection consults before starting a Tier-1 pass. It SHALL resolve `true` only when the device is class-eligible AND has live disk headroom AND `ThermalService` reports the device is not thermally throttled at the Tier-1 threshold. On any error or unknown signal it SHALL resolve `false` (fail closed — Tier-1 off), and Tier-0 SHALL be unaffected. This change SHALL NOT wire `canRunTier1()` into an actual Tier-1 drain (no Gemma is enqueued here); it only exposes the check.

#### Scenario: Eligible, cool device may run Tier-1

- **WHEN** the device is class-eligible, has disk headroom, and thermal level is below the Tier-1 threshold
- **THEN** `canRunTier1()` resolves `true`

#### Scenario: Eligible but hot device may not run Tier-1

- **WHEN** the device is class-eligible with disk headroom but `ThermalService` reports throttling at or above the Tier-1 threshold
- **THEN** `canRunTier1()` resolves `false`

#### Scenario: Capability failure silently keeps the device on Tier-0

- **WHEN** capability evaluation throws or a required signal is unknown
- **THEN** `canRunTier1()` resolves `false` and no error is surfaced to the user, while the Tier-0 pipeline continues to run

### Requirement: The capability gate performs no Tier-0 regression

Adding the capability gate SHALL NOT change any Tier-0 behavior. The existing Tier-0 (`tier0_mlkit`) discovery, enqueue, and drain SHALL run identically whether or not the device is Tier-1-eligible; ineligibility SHALL be silent (no user-facing error, no blocked processing).

#### Scenario: An ineligible device still processes Tier-0 normally

- **WHEN** the device is Tier-1-ineligible and the pipeline runs
- **THEN** Tier-0 discovery, enqueue, and draining proceed exactly as before the gate was added, with no user-visible difference
