# Backlog — post RN-0.86 modernization (2026-07-03)

Carried out of the upgrade effort (see `openspec/changes/archive/2026-07-03-*`).
Items here are known, deliberate deferrals — none block the app.

## Needs a 10-second human check
- **Album drag-reorder** (reanimated-dnd 2.0.0): the Sortable tree mounts and
  renders crash-free on device, but long-press reorder couldn't be driven by adb
  synthetic gestures. Long-press an album card on the Albums page and drag —
  confirm reorder sticks.
- **Photo-viewer pinch/zoom feel** under reanimated 4's new spring physics
  (functionally verified; feel-parity with v3 was explicitly not a goal —
  `Reanimated3DefaultSpringConfig` is the escape hatch if it feels off).

## Product gaps (pre-existing, surfaced during upgrade QA)
- **Thumbnail pipeline is absent**: nothing populates `MediaFile.thumbnailUri`;
  the grid renders original `content://` URIs via expo-image (downscaled decode,
  works fine). A real thumbnail service would cut decode cost on huge libraries —
  the dead October branch (`f55d59d~..34c7e34`) contains a 3-tier caching
  implementation worth mining.
- **Documents mode** filters to `application/pdf` only (the old predicate matched
  every image — a no-op). If "documents" should include AI-labeled receipts/
  screenshots, wire the Label table into the filter.
- **VirtualizedLists-nested-in-ScrollView warning** on Main (pre-existing layout
  pattern in MainTemplate/PhotoGrid): benign but worth restructuring someday.

## Dependency watch
- **reanimated 4.5.1 ↔ react-native-worklets 0.10.1 are lockstep-pinned** (exact).
  A future reanimated 4.6.x bump requires worklets 0.11.x in the same commit.
- **op-sqlite pinned exact 17.1.1** with `{sqliteVec, fts5, performanceMode}` build
  flags — the bundled sqlite-vec/FTS5 extensions are compiled in per-version. Any
  bump must re-verify the vec0/FTS5 virtual tables still load (proven by hybrid search).
- **llama.rn pinned exact 0.12.5** — the multimodal (`initMultimodal`) + embedding
  contexts and the Gemma-4 chat-template auto-detection are what enrichment/search
  ride on; re-run the e2e drive before any bump.

_(Retired 2026-07-15 with the Gemma backend rebuild: `@notifee/react-native`,
`react-native-executorch`, `@bam.tech/react-native-image-resizer` — all deleted.)_

## Dev-environment notes
- Local `android/gradle.properties` (untracked, holds signing secrets) needs
  `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m` — release-lint runs
  out of Metaspace at the old 512m with the expo module graph.
- Dev-mode Metro uses lazy bundles; rapid force-stop cycles can log transient
  `LoadBundleFromServerRequestError` — cosmetic, dev-only.

## Discovered during UI rebuild (rebuild-ui-foundation, 2026-07-04)

- **Metro `lazy=false` (load-bearing):** dev split/lazy bundling defers side-effect module init, so Unistyles' Nitro hybrids weren't registered before first render on Android (red-box). `metro.config.js` rewrites `lazy=true`→`lazy=false`. Release bundles are single-file and unaffected.

_(Retired 2026-07-15: the ML-Kit tier-0 OCR failures and iOS Podfile patch #4 —
both belonged to the executorch/ML-Kit tier system, now deleted. OCR is Gemma-4
VLM in one pass; verified reading printed text on both sim/emulator.)_

## Discovered during backend rebuild (rebuild-backend-gemma, 2026-07-15)

- **VLM Metal is gated to real iOS hardware** (`!DeviceInfo.isEmulatorSync()`): the
  iOS Simulator's emulated Metal driver (`MTLSimDriver`) crashes when clip/mmproj
  allocates its GPU buffer, so sim runs CPU. Device inference uses Metal (much
  faster). If a future llama.rn/Xcode combo fixes sim Metal, the gate can relax.
- **Android VLM is CPU-first** (`n_gpu_layers: 0`). GPU offload (Vulkan/OpenCL via
  llama.cpp) is a future perf lever for high-RAM devices — opportunistic, behind a
  capability probe.
- **Future levers (deferred):** LiteRT-LM runtime adapter (2.59 GB litertlm variant,
  smaller footprint); a `WorkManager`/iOS `BGProcessingTask` background lane beyond
  the current dataSync FGS + foreground keep-awake; a dedicated `mediaProcessing`
  FGS type; **PDF enrichment** (Android pdfScan already discovers PDFs as
  `enrich_status='skipped'` — a text/vision pass over pages is the next step);
  E4B model variant as a quality lever for high-RAM devices.
- **Emulator/simulator QA needs models pre-placed** in the app sandbox (iOS
  `Documents/models/`, Android `files/models/`) to skip the 4.2 GB download; the
  delivery `initialize()` adopt-and-verify path handles this (task 5.2). Real-device
  QA exercises the actual background-downloader acquisition.
- **Thumbnail pipeline still absent** (carried from the UI rebuild): the grid decodes
  original `ph://`/`content://` URIs. Higher value now that libraries can be large and
  enrichment reads each asset — a thumbnail/decode cache would cut cost on both paths.
