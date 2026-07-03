## Context

Foundation #4 (`executorch-runtime-bootstrap`) integrated `react-native-executorch@0.9.2` and a dev-only POC that calls `useLLM({ model: models.llm.gemma4_e2b_multimodal() })` (`src/screens/Dev/ExecutorchPocScreen.tsx`). The moment that hook mounts, RNE's resource-fetcher downloads the model **implicitly and ungated**. Reading the pinned library confirms the exact behavior we must wrap:

- **The model set (source of truth).** `models.llm.gemma4_e2b_multimodal()` returns `GEMMA4_E2B_MM` (`node_modules/react-native-executorch/src/constants/modelUrls.ts:156-162`): `modelSource` = `…-gemma-4-multimodal/${VERSION_TAG}/e2b/mlx/gemma4_e2b_mlx_int4.pte` (iOS, ~3.2 GB) or `…/e2b/vulkan/gemma_4_e2b_vulkan_8da4w.pte` (Android, ~4.4 GB), plus `tokenizerSource` (`tokenizer.json`) and `tokenizerConfigSource` (`tokenizer_config.json`) shared from the e2b root. So a full acquisition is exactly **three remote files**, one large.
- **Where RNE puts them.** `BareResourceFetcher` writes to `RNEDirectory = ${directories.documents}/react-native-executorch/` (`react-native-executorch-bare-resource-fetcher/lib/constants/directories.js`), final path `fileUri = ${RNEDirectory}${getFilenameFromUri(url)}` where `getFilenameFromUri` strips the scheme, cuts at `#`, and replaces every non-`[a-zA-Z0-9._-]` char with `_` (`react-native-executorch/src/utils/ResourceFetcherUtils.ts:211-215`). RNE **skips the download iff `RNFS.exists(fileUri)`** (`…/lib/handlers.js` `handleRemote`).
- **A platform asymmetry that matters.** RNE's `handleRemote` downloads on **iOS via `@kesha-antonov/react-native-background-downloader`** (`createDownloadTask` — a true background `URLSession`, resumable, honoring `allowsCellularAccess`), but on **Android via `RNFS.downloadFile`** (`@dr.pogodin/react-native-fs` — a **foreground** download with **no metered/Wi-Fi constraint** and no cross-kill resume). The bare fetcher's own docs note "Pause/resume operations are only supported on iOS." So delegating to RNE gives us *no* Wi-Fi gate and *no* resume on Android.

Visara today runs Tier-0 ML-Kit through `ProcessingService` (default `MlKitEngine`, #2) driven by `OrchestratorService` (#3); the version-aware skip guard in `OrchestratorService.processNext` already anticipates a newer model ("A newer model (change #10) will not match here", `src/services/orchestrator/OrchestratorService.ts`). `EngineRegistry.getById("gemma")` deliberately returns `undefined` this wave (`openspec/specs/analysis-engine-selection/spec.md`). MMKV is centralized in `src/services/storage/mmkv.ts` with keys in `src/utils/constants/storage-keys.ts`; #5 just added `DEVICE_CAPABILITY_SNAPSHOT` and a `DeviceCapabilityService.canRunTier1()` (capability+thermal+disk) gate. Onboarding copy promising "100% private… without internet" lives only in `src/screens/Onboarding/OnboardingScreen.tsx` (`WelcomeContent`, `PrivacyContent`), not in any spec.

**Constraints:** Biome (tabs, double quotes, `noExplicitAny: error`), strict TS, all-static services, legacy decorators, `@services/@models/@shared-types` aliases. No new dependency (fs, background-downloader, quick-crypto, device-info, MMKV all already present). This change ships delivery + management + UX only — **no** Gemma engine, **no** active Tier-1 drain, **no** schema change.

## Goals / Non-Goals

**Goals:**
- Replace RNE's implicit first-run fetch with an **explicit, opt-in, Wi-Fi- and charging-gated** acquisition the user starts from Settings or the onboarding step, that **never** downloads without consent.
- Make the download **resumable across app kill on both platforms** and **observable** (progress, byte counts, state) by driving `@kesha-antonov/react-native-background-downloader` directly and re-attaching on boot.
- **Verify integrity** with a native streaming checksum before the model is ever marked ready; a bad file is deleted and never used.
- Persist a **delivery state machine** in MMKV, place the cache with **iOS backup exclusion**, and pre-place files at RNE's exact path so `useLLM` consumes them without re-downloading.
- Ship a **Settings "AI Model" section** (state/progress, size-vs-free-disk, variant, enable toggle, download/pause/cancel/delete, re-run seam) and an **onboarding model step** that never blocks onboarding, and reconcile the privacy copy.
- Keep the app fully functional on **Tier-0 only** until the model is present **and** enabled.

**Non-Goals:**
- Implementing a Gemma `AnalysisEngine`, registering it, or wiring a `tier1_gemma` drain / active re-analysis — later change (this exposes the enable flag + re-run seam, wires no consumer, matching #5).
- Any DB/schema change, `ProcessingResult`/engine-seam change, or new dependency.
- Building an actual AICore/Gemini-Nano native bridge (specified as an optional detected variant + seam only).
- Cellular/metered downloading, background audio capability, or model quantization/latency work.
- Pinning real byte-sizes/checksums/model-version strings before the #4 POC reports them (marked POC-dependent throughout).

## Decisions

### D1: Managed-ahead — the delivery service drives the download itself and pre-places files at RNE's exact path

Rather than let `useLLM` trigger RNE's fetch, `GemmaModelDeliveryService` performs acquisition **before** any Tier-1 code runs, by creating background-downloader tasks that write to the **exact `fileUri` RNE would use** — `${directories.documents}/react-native-executorch/${getFilenameFromUri(url)}` for each of `modelSource`, `tokenizerSource`, `tokenizerConfigSource` from `models.llm.gemma4_e2b_multimodal()`. Because RNE's `handleRemote` returns early when `RNFS.exists(fileUri)` is true, a fully pre-placed set makes the eventual `useLLM` a no-download load. This is the literal reading of the brief's "managed, gated, observable wrapper **around and ahead of** executorch's resource-fetcher."

We reconstruct the same filename with our own copy of the `getFilenameFromUri` transform (scheme-strip, `#`-cut, `[^a-zA-Z0-9._-] → _`) kept in `gemmaModelManifest.ts`, and we treat the URL/path convention as **pinned to RNE `0.9.2`** and a POC-verify item (the POC on-device run confirms `useLLM` actually skips the download after pre-placement).

**Alternatives:** (a) Delegate to RNE's static `ResourceFetcher.fetch(cb, …sources)` and only gate *when* we call it — rejected as primary because on Android RNE uses `RNFS.downloadFile` (no Wi-Fi gate, no resume), so it cannot satisfy the Wi-Fi/resumable requirement; kept as a **documented fallback** if pre-placement proves fragile against RNE internals. (b) Fork/patch RNE — rejected (maintenance, defeats pinning).

### D2: OS-enforced Wi-Fi gating (no `netinfo` dependency) + a JS charging gate

Driving the downloader ourselves lets us set **OS-enforced** network constraints instead of detecting connectivity in JS (there is no connection-type API in the current dep set — `react-native-device-info` only exposes `isWifiEnabled()` = radio-on, not "connected via Wi-Fi"). On **Android** each task is created with `isAllowedOverMetered:false` + `isAllowedOverRoaming:false`; on **iOS** `setConfig({ allowsCellularAccess:false })` (`@kesha-antonov/react-native-background-downloader`) forces the background session to Wi-Fi. The OS then defers/withholds the transfer off Wi-Fi — no polling, no race, and **no new dependency**. **Charging** is not an OS download constraint, so it is a **JS gate**: the service checks `DeviceInfo.isBatteryCharging()` before starting and MAY pause the tasks if charging stops (reusing the `battery.ts` fail-open philosophy — if charging state is unreadable, treat as chargeable rather than wedge acquisition). Wi-Fi + charging are the default policy; both are surfaced as the reason a download is "waiting."

**Alternatives:** add `@react-native-community/netinfo` to detect Wi-Fi in JS — rejected; a new dependency to reproduce, less reliably, what `isAllowedOverMetered:false` already enforces at the OS layer. `DeviceInfo.isWifiEnabled()` as a Wi-Fi proxy — rejected (radio-on ≠ connected-via-Wi-Fi; would allow cellular downloads).

### D3: Opt-in, default OFF, and it NEVER blocks onboarding or Tier-0

`MODEL_ENABLED` defaults **false**. No download begins without an explicit user action (the onboarding step's "Download model" affordance or the Settings toggle/button). Onboarding **completion is independent of model state**: the model step is informational + an optional trigger and is never awaited (mirroring how `OnboardingScreen.handleComplete` already dispatches completion without gating on slow work). Until the model is present **and** enabled, the app runs the shipping Tier-0 `MlKitEngine` unchanged. This is the safety spine of the whole change — a failed/absent/declined download degrades to exactly today's app.

**Alternatives:** auto-start on first launch when on Wi-Fi+charging — rejected; multi-GB acquisition without explicit consent is user-hostile and contradicts the reconciled privacy stance. Block onboarding until download completes — rejected; a 3–4.4 GB gate on first-run onboarding is unacceptable UX.

### D4: Cache placement + iOS backup exclusion, applied AHEAD of RNE

The weights live where RNE expects (`${directories.documents}/react-native-executorch/`, under the app's Documents container). On iOS, multi-GB weights **must not** be swept into iCloud/iTunes backup, so the service pre-creates that directory with `RNFS.mkdir(RNEDirectory, { NSURLIsExcludedFromBackupKey: true })` (`@dr.pogodin/react-native-fs` `MkdirOptionsT`, `NativeReactNativeFs.ts:112-114`) **before** the first download. RNE's own `createDirectoryIfNoExists` only runs `RNFS.mkdir(RNEDirectory)` when the dir is absent (`react-native-executorch-bare-resource-fetcher/lib/ResourceFetcherUtils.js`), so pre-creating with the flag makes RNE's call a no-op and the exclusion attribute persists. (Android has no equivalent user-data-backup concern for this path; the flag is iOS-only and ignored elsewhere.)

**Alternatives:** relocate to Application Support / a custom dir — rejected; it would diverge from RNE's `RNEDirectory` and break the pre-placement short-circuit (D1). Rely on RNE to set the backup flag — rejected; RNE does not set it.

### D5: A durable delivery state machine in MMKV + boot reconciliation and re-attach

`GemmaModelDeliveryService` owns a serialized state under `STORAGE_KEYS.MODEL_DELIVERY_STATE`: `{ status, variant, modelVersion, bytesDownloaded, bytesTotal, files: {url→{path, verified}}, checksumVerified, updatedAt, error }` with `status ∈ notPresent | queued | downloading | paused | verifying | ready | failed`. On `initialize()` the service (a) calls `getExistingDownloadTasks()` and **re-attaches** progress/done/error handlers to any task still running after an app relaunch (this is what makes the download genuinely resumable + observable across kills), and (b) **reconciles** persisted state against on-disk reality via `BareResourceFetcher.listDownloadedModels()` + `RNFS.exists(fileUri)` + a lazy checksum, so a stale "ready" that lost its file drops back to `notPresent`, and an orphaned complete file is adopted as `ready`. `initialize()` is primed early (alongside `OrchestratorService.initialize()` in `OrchestratorBridge`) and **never auto-starts a transfer** — it only observes/reconciles.

**Alternatives:** keep state only in memory — rejected; loses progress/resume across kills, the core requirement. Store state in WatermelonDB `app_settings` — rejected; MMKV is the established fast-path for device/runtime flags here and avoids a DB write on every progress tick (progress is throttled to MMKV, not per-byte).

### D6: Integrity via a native streaming hash, fail-closed

A 3–4.4 GB `.pte` cannot be hashed in JS without OOM, so verification uses `@dr.pogodin/react-native-fs` `hash(fileUri, "sha256")` — a **native** call that streams the file and returns only the digest (`src/index.ts:444`). It is compared against a **pinned expected digest** in the manifest. The small `tokenizer.json` / `tokenizer_config.json` (and the manifest itself, if signed) MAY be hashed with `react-native-quick-crypto` (`createHash`), which is fine for small buffers. Verification is **fail-closed**: a mismatch (or a hash error) deletes the offending file (`RNFS.unlink`), sets `status:"failed"`, and refuses `ready` — a corrupt multi-GB model must never reach `useLLM`. Only when every file exists and the `.pte` digest matches does the service transition to `ready`.

**Alternatives:** trust the downloader's byte-total as "integrity" — rejected; a truncated/corrupt-but-complete file passes a size check but fails to load. Hash with quick-crypto by reading the `.pte` into JS — rejected (OOM on multi-GB). The expected digest + algorithm are **POC-dependent**: sourced by hashing a known-good download once and pinning it (Software Mansion publishes no checksum manifest for `0.9.2`).

### D7: Variant/manifest derived from the executorch getter, versioned to line up with the schema idempotency guard

`gemmaModelManifest.ts` computes the active **variant** from `Platform.OS` (`ios → mlx`, `android → vulkan`, optional `android → aicore` per D10) and reads the URL set from `models.llm.gemma4_e2b_multimodal()` so it stays in lockstep with what `useLLM` will load — no hardcoded URLs that could drift from the pinned library. It also carries an approximate byte-size per variant (~3.2 GB iOS / ~4.4 GB Android, refined at runtime from the downloader's `bytesTotal`/`getFilesTotalSize`) and the pinned checksum(s). The manifest exposes a **`modelVersion` string** (e.g. `gemma4-e2b-multimodal@<VERSION_TAG>`) that MUST equal what a future Gemma engine will stamp into `media_files.ai_model_version` (#1), so the `OrchestratorService.processNext` version-aware skip/re-run guard works when the Tier-1 change lands. The exact string is **POC/Tier-1-dependent**.

**Alternatives:** hardcode the three URLs — rejected; drifts from the pinned RNE getter and duplicates a source of truth. Omit `modelVersion` here — rejected; delivery must agree with the schema's idempotency contract or re-analysis will misfire later.

### D8: Settings "AI Model" section — full lifecycle UI, enable toggle, and an exposed re-run seam

A new section (following the existing `SettingsDrawer` section pattern: `Processing`, `Appearance`, `Data Management`, `Legal`) renders from the delivery state: **status + progress** (byte counts / percent from the state machine), **model size vs. free disk** (`DeviceInfo.getFreeDiskStorage()` with a pre-flight "needs X, have Y" check reusing #5's `TIER1_MIN_FREE_DISK_BYTES` slack), the **variant** label, an **enable toggle** (`MODEL_ENABLED`, opt-in), and **Download / Pause / Cancel / Delete** actions (Delete calls `BareResourceFetcher.deleteResources(...manifest sources)` or `RNFS.unlink` to reclaim space and returns to `notPresent`). A **"Re-run analysis"** control is present but its handler is an **exposed seam** — since no Tier-1 drain exists yet, it does not start Gemma processing in this change; it is the affordance the later Tier-1 change consumes (identical to how #5 exposes `canRunTier1()` with no active consumer). The section is data-driven off the same service the onboarding step uses, so both stay consistent.

**Alternatives:** wire "Re-run analysis" to `OrchestratorService.runInitialProcessing()` now — rejected; that re-runs **Tier-0**, not Gemma, and would be misleading dead behavior. A separate full-screen "AI Model" screen — deferred; a drawer section matches the existing settings IA.

### D9: Onboarding model step + privacy-copy reconciliation

Add one step to the `screens` array in `OnboardingScreen` (the same `OnboardingTemplate` pattern as `welcome`/`ai-features`/`privacy`/`permissions`) that explains the optional on-device model, its one-time Wi-Fi download, and offers a **"Download later / Download on Wi-Fi"** choice — **without awaiting** it (`handleComplete` still dispatches `SET_ONBOARDING_COMPLETED` regardless, D3). The misleading absolute copy is reconciled: `WelcomeContent`'s "100% private and secure" and `PrivacyContent`'s "All AI analysis runs locally on your device **without internet**" become the accurate "**downloads the AI model once over Wi-Fi, then works fully offline** — your photos never leave your device." The distinction preserved: *photos/data never leave the device* stays absolute; only *model acquisition* is a one-time network event.

**Alternatives:** leave the copy as-is — rejected; it is now factually wrong and an App-Store/privacy-representation risk. Delete the privacy screen's internet claim entirely — rejected; the honest, reassuring framing (one-time model download, then offline) is better UX than silence.

### D10: Optional Android AICore / Gemini-Nano fast-path — specified as a detected variant + seam, not built

Where an Android device exposes **AICore / Gemini-Nano**, the ~4.4 GB Vulkan download is unnecessary — the system already hosts a Gemma-class model. The manifest therefore admits an `aicore` variant whose acquisition is a **capability probe** rather than a download, and the delivery state can reach `ready` with `bytesTotal:0`. Because **no first-party AICore API exists in the current dependency set** (it needs a Play-services/AICore native bridge that this JS-only change will not fabricate), this path is specified as **optional and detected**: a `probeAicoreAvailable()` seam that defaults to `false` until a future native module implements it, plus the routing that skips the download when it returns `true`. Everything downstream (enable toggle, re-run seam, Settings display) treats `aicore` as just another `ready` variant.

**Alternatives:** implement the AICore bridge now — rejected; out of scope for a JS delivery change and unverifiable without device hardware. Ignore AICore entirely — rejected; leaving the seam documented lets a later change skip multi-GB downloads on capable devices cheaply.

### D11: Expose, don't consume — zero coupling into the live Tier-0 pipeline

Like #5, this change **exposes** `GemmaModelDeliveryService` (state + `isReady()` + `MODEL_ENABLED`) and the re-run seam but adds **no** consumer to `OrchestratorService.processNext`/`maybeStartDrain`, registers **no** engine, and enqueues **no** `tier1_gemma` work. `EngineRegistry.getById("gemma")` still resolves `undefined`. This guarantees no dead code in the shipping drain and a trivial rollback, and it keeps the GO/NO-GO risk of #4 isolated from delivery UX.

**Alternatives:** register a stub Gemma engine gated on `isReady()` — rejected; untested dead code in the drain before the Tier-1 change exists.

## Risks / Trade-offs

- **Pre-placement couples to RNE's path/URL convention (`0.9.2`).** If RNE changes `getFilenameFromUri`, `RNEDirectory`, or the getter URLs, `useLLM` might re-download despite our placed files. → Pin `0.9.2`, keep the filename transform in one manifest helper, and make "useLLM consumes pre-placed files with no re-download" an explicit #4-POC on-device check; fall back to delegating `ResourceFetcher.fetch` (D1 alt-a) if it breaks.
- **Android resume semantics.** `@kesha-antonov/react-native-background-downloader` resume/pause is strongest on iOS; Android background continuation depends on OS/OEM. → Re-attach via `getExistingDownloadTasks()` on boot; if a partial is unrecoverable, restart the single failed file (the tokenizer files are tiny; only the `.pte` is costly) and surface a clear "resuming/retrying" state.
- **OS defers Wi-Fi-only downloads indefinitely.** With `isAllowedOverMetered:false`, a user never on Wi-Fi sees a download that "never starts." → Surface a "waiting for Wi-Fi (and charging)" state in Settings/onboarding with the reason; optionally allow an explicit "allow this download over cellular" override later (out of scope now).
- **Free-disk check races a filling disk.** A pre-flight `getFreeDiskStorage()` can pass then the write still ENOSPC. → Treat the pre-flight as advisory, handle the downloader's disk error into `status:"failed"` with a "not enough space" message, and never partially mark `ready`.
- **Checksum digest must be sourced out-of-band.** Software Mansion ships no published checksum for `0.9.2`. → Compute once from a trusted download and pin it (POC task); until pinned, the manifest's expected digest is a placeholder and verification is the last gate before `ready`.
- **iOS backup-exclusion timing.** If some other code created `RNEDirectory` before us, the flag may be unset. → `initialize()` sets it idempotently (re-`mkdir` with the flag / set the resource value) before the first download, and reconciliation re-asserts it.
- **`MODEL_ENABLED` on without a ready model.** The toggle could be on before delivery finishes. → `isReady()` = enabled AND state `ready` AND checksum verified; the future Tier-1 consumer must call `isReady()`, never the raw flag.
- **AICore path is unverifiable here.** `probeAicoreAvailable()` defaults `false`; no device can exercise `aicore` until the bridge exists. → Documented optional seam; the mainline MLX/Vulkan download path is fully specified and testable.
- **Metro-bundle / lint regressions from new UI + service.** → Tasks end with `npm run typecheck` (baseline 8), a Metro-bundle check, and `npm run lint`.

## Migration Plan

Ordered; JS-only and agent-verifiable against the typecheck baseline (no native module is added). Matches `tasks.md`.

1. **State + manifest core (agent-run):** add `MODEL_DELIVERY_STATE` + `MODEL_ENABLED` to `storage-keys.ts`; add `gemmaModelManifest.ts` (variant, URL set from the getter, filename transform, size + pinned-digest placeholders, `modelVersion`); add `GemmaModelDeliveryService.ts` (state machine, MMKV persistence, gating policy, checksum, reconcile/re-attach, `initialize()`, `isReady()`, download/pause/cancel/delete, `requestReanalysis()` seam, `probeAicoreAvailable()` default-false).
2. **Boot prime (agent-run):** call `GemmaModelDeliveryService.initialize()` alongside `OrchestratorService.initialize()` (`OrchestratorBridge`) — reconcile/re-attach only, never auto-download.
3. **Settings section (agent-run):** the "AI Model" organism + `SettingsScreen`/`SettingsDrawer` wiring (state/progress, size-vs-free-disk, variant, enable toggle, controls, re-run seam).
4. **Onboarding step + copy (agent-run):** add the model step to `OnboardingScreen`; reconcile `WelcomeContent`/`PrivacyContent` copy; confirm completion never awaits the download.
5. **Verify (agent-run):** `npm run typecheck` (stays 8) + Metro-bundle check + `npm run lint`; `openspec validate`.
6. **On-device confirmation (HUMAN, post-#4-POC):** confirm a gated download runs Wi-Fi+charging-only, resumes across kill, checksum-verifies, is iOS-backup-excluded, and that a subsequent `useLLM` load performs **no** re-download; then pin real sizes/digests/`modelVersion`.

**Rollback:** additive and low-blast-radius. Deleting the two service files, the two storage keys, the Settings section, and the onboarding step + reverting the copy fully restores today's app; because nothing consumes delivery state in the Tier-0 drain (D11), a partial rollback still leaves a working Tier-0 app. No schema, no data, no dependency change.

## Open Questions

- **Pre-placement vs. delegate:** does the #4 on-device POC confirm `useLLM` skips its download after we pre-place at `${RNEDirectory}${getFilenameFromUri(url)}`, or must we delegate RNE's `ResourceFetcher.fetch` and accept weaker Android gating?
- **Checksums/sizes/version:** what are the real SHA-256 digests, byte-sizes, and the `modelVersion` string (must match the future Gemma engine's `ai_model_version`)?
- **Charging strictness:** is charging a hard precondition (pause if unplugged) or advisory, and should it match #5's Tier-1 charging question?
- **Cellular override:** do we ever expose an explicit "download over cellular" escape hatch, or is Wi-Fi-only absolute?
- **AICore:** is the Android AICore/Gemini-Nano fast-path worth a follow-up native bridge, and what is its detection contract?
- **Re-run wiring:** does the later Tier-1 change consume `requestReanalysis()` by clearing the version guard so files re-enqueue, and should re-run require charging like the drain?
- **Notifications:** should download progress surface as a system notification (Notifee is a dependency) or stay in-app only?
