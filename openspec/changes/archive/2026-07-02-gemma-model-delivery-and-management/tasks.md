> Ordered top-to-bottom; every group is agent-run and JS-only (no native module is added). BASELINE: `npx tsc --noEmit` currently reports **8** pre-existing `TS6133` unused-symbol errors in 4 unrelated UI files (including one pre-existing unused import at `src/screens/Onboarding/OnboardingScreen.tsx:11`); every group MUST keep that count at **8** (zero NEW typecheck errors) — do not disturb the pre-existing unused import while editing onboarding. Items tagged **(POC-DEPENDENT)** must be re-tuned after the #4 on-device Gemma POC reports real sizes/latency/quality/output-shape.

## 1. Storage keys + model manifest

- [x] 1.1 Add `MODEL_DELIVERY_STATE: 'model_delivery_state'` and `MODEL_ENABLED: 'model_enabled'` to `STORAGE_KEYS` in `src/utils/constants/storage-keys.ts` (additive; keep the existing keys incl. `DEVICE_CAPABILITY_SNAPSHOT`).
- [x] 1.2 Add `src/services/model/gemmaModelManifest.ts`: resolve the active variant from `Platform.OS` (`ios → mlx`, `android → vulkan`, optional `android → aicore`) and read the three source URLs (`modelSource`, `tokenizerSource`, `tokenizerConfigSource`) from `models.llm.gemma4_e2b_multimodal()` — do NOT hardcode URLs.
- [x] 1.3 In the manifest, implement the executorch filename transform `getFilenameFromUri` (strip `^https?://`, cut at `#`, replace `[^a-zA-Z0-9._-]` with `_`) and derive each final cache path `${directories.documents}/react-native-executorch/${filename}` (import `directories` from `@kesha-antonov/react-native-background-downloader`).
- [x] 1.4 In the manifest, expose `modelVersion` (e.g. `gemma4-e2b-multimodal@<VERSION_TAG>`), an approximate `expectedBytes` per variant (~3.2 GB iOS / ~4.4 GB Android), and an `expectedSha256` per variant. **(POC-DEPENDENT)** mark `expectedBytes`, `expectedSha256`, and the exact `modelVersion` string as placeholders to pin from the POC (the `modelVersion` MUST equal what a future Gemma engine writes to `media_files.ai_model_version`).
- [x] 1.5 Confirm no `any` (`noExplicitAny: error`), tabs/double-quotes, strict TS; the manifest imports only from the pinned `react-native-executorch@0.9.2` getter for URLs.

## 2. GemmaModelDeliveryService (delivery, gating, resume, checksum)

- [x] 2.1 Add `src/services/model/GemmaModelDeliveryService.ts` (all-static, `noStaticOnlyClass` biome-ignore header like sibling services) with a `DeliveryState` type (`status: 'notPresent'|'queued'|'downloading'|'paused'|'verifying'|'ready'|'failed'`, `variant`, `modelVersion`, `bytesDownloaded`, `bytesTotal`, per-file `{ path, verified }`, `checksumVerified`, `updatedAt`, `error`), persisted under `STORAGE_KEYS.MODEL_DELIVERY_STATE` via `src/services/storage/mmkv.ts` with throttled progress writes.
- [x] 2.2 Implement the enable flag helpers over `STORAGE_KEYS.MODEL_ENABLED` (default `false`) and `isReady()` = `MODEL_ENABLED` on AND `status === 'ready'` AND `checksumVerified`.
- [x] 2.3 Implement `startDownload()`: pre-flight free disk (`DeviceInfo.getFreeDiskStorage()` vs manifest `expectedBytes` + headroom slack, reuse #5's `TIER1_MIN_FREE_DISK_BYTES` convention) — refuse with a "not enough space" reason when insufficient; ensure the cache dir exists with `RNFS.mkdir(dir, { NSURLIsExcludedFromBackupKey: true })` BEFORE any transfer.
- [x] 2.4 Implement the gated transfer: create one `@kesha-antonov/react-native-background-downloader` task per source with `isAllowedOverMetered:false` + `isAllowedOverRoaming:false`, writing to the manifest's exact `${RNEDirectory}${filename}` destination; call `setConfig({ allowsCellularAccess:false })` for the iOS session; gate the start on `DeviceInfo.isBatteryCharging()` (fail-open) and expose a "waiting for Wi-Fi/charging" state.
- [x] 2.5 Wire `begin`/`progress`/`done`/`error` handlers to update `bytesDownloaded`/`bytesTotal`/`status`; on iOS call the downloader `completeHandler` on done (matching RNE's own iOS path). Implement `pause()`, `resume()`, and `cancel()` over the tasks.
- [x] 2.6 Implement `initialize()`: re-attach handlers to any live task via `getExistingDownloadTasks()`; reconcile persisted state against on-disk reality using `BareResourceFetcher.listDownloadedModels()` + `RNFS.exists` (revert a `ready` with a missing file to `notPresent`, adopt a complete-but-unrecorded file); re-assert the iOS backup-exclusion flag; NEVER auto-start a transfer.
- [x] 2.7 Implement checksum verification: `@dr.pogodin/react-native-fs` `hash(fileUri, "sha256")` for the `.pte` compared to manifest `expectedSha256`; optional `react-native-quick-crypto` for the small tokenizer/config; fail-closed (mismatch/error ⇒ `RNFS.unlink` the file, `status:'failed'`, no `ready`). Transition to `ready` only when all files exist and the `.pte` digest matches. **(POC-DEPENDENT)** the expected digest/algorithm are pinned from the POC.
- [x] 2.8 Implement `deleteModel()` (via `BareResourceFetcher.deleteResources(...)` or `RNFS.unlink`, state → `notPresent`), `requestReanalysis()` (exposed seam — no `tier1_gemma` enqueue, no Tier-0 change), and `probeAicoreAvailable()` (returns `false` by default; when `true`, select the `aicore` variant and skip the download). **(POC-DEPENDENT)** AICore routing is a documented seam only.
- [x] 2.9 Confirm ISOLATION: the service does NOT import or modify `ProcessingService`, `OrchestratorService` (`processNext`/`maybeStartDrain`), or `EngineRegistry`; registers no engine; enqueues no `tier1_gemma`. Run `npm run typecheck` + `npm run lint` clean.

## 3. Boot prime (reconcile only)

- [x] 3.1 Call `GemmaModelDeliveryService.initialize()` alongside `OrchestratorService.initialize()` in `src/components/system/OrchestratorBridge.tsx` (the boot effect at `:31-46`) so state is reconciled and any in-flight task re-attached at launch — reconcile/re-attach ONLY, never auto-download.
- [x] 3.2 Confirm the boot prime starts no transfer when `MODEL_ENABLED` is false and no files are present; typecheck/lint stay clean.

## 4. Settings "AI Model" section

- [x] 4.1 Add an "AI Model" section component (organism under `src/components/organisms/`, e.g. `AiModelSection.tsx`) rendering delivery status, variant label, model size vs `DeviceInfo.getFreeDiskStorage()`, and progress (percent/bytes) — data-driven from `GemmaModelDeliveryService` state via a small subscription/poll.
- [x] 4.2 Add Download / Pause / Cancel / Delete controls bound to the service; show the "waiting for Wi-Fi/charging" reason and the "not enough space" warning instead of a generic error.
- [x] 4.3 Add the enable toggle bound to `MODEL_ENABLED` (default off); enabling without a verified model must NOT make `isReady()` true and must NOT start a download.
- [x] 4.4 Add the "Re-run analysis" control calling `GemmaModelDeliveryService.requestReanalysis()`; disable/annotate it until the model is ready and enabled; it must NOT enqueue `tier1_gemma` or touch the Tier-0 drain.
- [x] 4.5 Wire the section into `SettingsScreen`/`SettingsDrawer` following the existing section pattern (Processing/Appearance/Data Management/Legal); typecheck/lint stay clean.

## 5. Onboarding model step + privacy copy

- [x] 5.1 Add a model step to the `screens` array in `src/screens/Onboarding/OnboardingScreen.tsx` (new `OnboardingTemplate` step) explaining the optional on-device model + one-time Wi-Fi download, with a start/defer choice that calls `GemmaModelDeliveryService.startDownload()` or defers.
- [x] 5.2 Confirm `handleComplete` still dispatches `SET_ONBOARDING_COMPLETED` unconditionally and never awaits the download (onboarding is not blocked); do NOT disturb the pre-existing unused `MediaDiscoveryService` import baseline error at `:11`.
- [x] 5.3 Reconcile the copy: update `WelcomeContent` ("100% private and secure") and `PrivacyContent` ("All AI analysis runs locally on your device without internet") to state the model is downloaded once over Wi-Fi and then works fully offline, while preserving the accurate "photos/personal data never leave your device" guarantee; ensure no remaining copy claims analysis never uses the internet.
- [x] 5.4 Typecheck/lint stay clean; the onboarding step renders on phone and tablet form factors.

## 6. Verify (baseline-relative)

- [x] 6.1 `npx tsc --noEmit` reports no NEW errors — the pre-existing **8** `TS6133` baseline is not increased (`npm run typecheck`).
- [x] 6.2 Metro-bundle check resolves all new/edited modules and aliases: `npx react-native bundle --platform ios --dev true --entry-file index.js --bundle-output "$TMPDIR/visara.ios.jsbundle" --reset-cache` (and `--platform android` likewise) completes with no resolution/transform error.
- [x] 6.3 `npm run lint` (Biome) is clean on every new/edited file (tabs, double quotes, no `any`).
- [x] 6.4 `openspec validate gemma-model-delivery-and-management --strict` passes.
- [x] 6.5 Confirm ISOLATION one more time: diff shows `ProcessingService`, `OrchestratorService` drain (`processNext`/`maybeStartDrain`), `EngineRegistry`, DB/schema, search, and the `index.js` `initExecutorch` block are unmodified; no Gemma engine registered; no `tier1_gemma` enqueue.

## 7. On-device confirmation (HUMAN — post-#4 POC) — (POC-DEPENDENT)

- [ ] 7.1 (HUMAN) On a real device on Wi-Fi + charging, start the download from Settings; confirm it runs, reports progress, and does NOT transfer when moved off Wi-Fi or unplugged (per policy).
- [ ] 7.2 (HUMAN) Kill the app mid-download and relaunch; confirm `initialize()` re-attaches and the in-flight file resumes rather than restarting from zero.
- [ ] 7.3 (HUMAN) Confirm the `.pte` checksum verifies to `ready`; then launch a `useLLM({ model: models.llm.gemma4_e2b_multimodal() })` load and confirm it performs NO re-download (files consumed from the pre-placed cache).
- [ ] 7.4 (HUMAN) Confirm on iOS the cache directory is excluded from backup; pin the real `expectedBytes`, `expectedSha256`, and `modelVersion` into `gemmaModelManifest.ts`.
