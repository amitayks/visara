## Context

Visara (RN 0.81.4, React 19.1.0, New Arch + Fabric + bridgeless + Hermes, TS 5.9 strict, Biome) targets iOS 26.0 (Xcode 26.6) and Android minSdk/compileSdk 36, arm64-v8a only. Three custom TurboModule specs (`src/native-modules/Native{MediaObserver,ThermalObserver,VisionTextRecognizer}.ts`) back Java modules registered via `TurboReactPackage` on Android and legacy `RCTBridgeModule`/`RCTEventEmitter` modules on iOS (interop layer — explicitly retained through 0.86). The Gemma pipeline is pinned to `react-native-executorch@0.9.2` and must not change.

Pre-upgrade baselines recorded green on 2026-07-03: Android `:app:assembleDebug`, iOS Debug build (iPhone 17 sim, Xcode 26.6), `tsc --noEmit`, Biome (modulo `.cxx` noise). Zero Jest tests exist. All work is committed and pushed (`001-build-visara-an`, HEAD `7137371`+).

Everything below is grounded in the 11-agent research run (session scratchpad `research/*.json`); primary sources: rn-diff-purge `0.81.4..0.86.0.diff` (1680 lines, fetched), RN CHANGELOG/blogs 0.82–0.86, SWM migration/compat docs, npm registry peer-dep verification.

## Goals / Non-Goals

**Goals:**
- RN 0.86.0 + React 19.2.3 + reanimated-4 stack building, installing, and booting on both platforms in one atomic change, with executorch 0.9.2 initializing under Hermes V1.
- Every local modification enumerated in the proposal preserved byte-for-byte or functionally ported (MainApplication.kt).
- Toolchain matched to the 0.86 template; `npm test`, `npm run lint`, `npm run typecheck` all exit 0 on macOS.

**Non-Goals:**
- No mmkv/quick-crypto/vision-camera majors (next change — Nitro substrate isolation).
- No fast-image or vector-icons replacement; no UI/navigation rework; no runOnJS→scheduleOnRN rename (deprecated-but-working, deferred); no CSS-animations adoption; no notifee migration (upstream-archived — backlog).
- No attempt to preserve reanimated-3 spring *feel*; v4 physics accepted unless QA shows functional breakage (escape hatch: `Reanimated3DefaultSpringConfig`).

## Decisions

1. **Atomic change, not stepped releases.** 0.83 and 0.86 shipped zero user-facing breaking changes; the pain concentrates in 0.82/0.84/0.85, all enumerated. Stepping through intermediates would triple build-verify cycles for no isolation benefit, and the reanimated hard-pairing forces the stack to move together anyway.
2. **Reanimated 4.5.1 + worklets 0.10.1** (not 4.4.x/0.9.x as one agent suggested): npm-verified peers (`react-native: 0.83 - 0.86`, `react-native-worklets: 0.10.x`), current stable, and 4.5.1 carries the `useAnimatedKeyboard` insets-crash fix that `AnimatedBottomNav.tsx` directly depends on. Lockstep risk documented: future 4.6.x requires worklets 0.11.x simultaneously.
3. **Executorch gate runs first, not last.** Its compat table stops at RN 0.85. Sequence: deps + config edits → **Android assembleDebug + iOS build immediately** → boot + `initExecutorch` smoke → only then polish (jest config, biome excludes, scripts). If the gate fails: STOP, report, evaluate holding at RN 0.85 — do not improvise unpinning executorch.
4. **MainApplication.kt port preserves manual package adds.** New form: `override val reactHost: ReactHost by lazy { getDefaultReactHost(applicationContext, PackageList(this).packages.apply { add(MediaObserverPackage()); add(ThermalObserverPackage()) }) }`. Dropping these two `add()` calls would silently kill media discovery and thermal gating — the one true collision in the whole template diff.
5. **Gradle wrapper via template files, not `gradlew wrapper` regeneration** — Upgrade Helper ships the exact 4 files (properties, jar, gradlew, gradlew.bat); copying them avoids a chicken-and-egg run under the old wrapper and matches template byte-for-byte.
6. **Keep the fmt-consteval Podfile patch verbatim.** Under 0.84+ prebuilt RNCore it likely no-ops (guarded by `File.exist?` + idempotent `sub`); if AppleClang 26 resurfaces the consteval miscompile in source-built pods, the patch is already in place. Delete nothing until a clean build proves it dead — and even then, leave it (zero cost).
7. **Jest downgrade 30 → template ^29.6.3 + `@react-native/jest-preset`.** Jest 30 vs the preset is unverified; there are zero tests, so template alignment costs nothing and makes `npm test` meaningful. Config gets `passWithNoTests` so the empty suite exits 0.
8. **TS 5.9.3 and Babel 7.29 stay; TS 6 / Babel 8 rejected** — template pins ^5.8.3/^7.25.x; chasing majors the RN toolchain hasn't adopted is gratuitous risk. Philosophy: aggressive on OS floors (26/36), conservative on toolchain.
9. **Edge-to-edge metric shifts accepted as correctness.** RN 0.86 fixes `Dimensions`/`measureInWindow`/KeyboardAvoidingView under Android 16's enforced edge-to-edge; targetSdk is already 36 so the OS enforces it either way. Visual QA on AnimatedBottomNav + PhotoViewerModal instead of opt-outs.

10. **mmkv 4.3.2 + nitro-modules 0.36.1 pulled forward from Change B (apply-time discovery).** iOS gate run crashed in mmkv 3.3.3's C++ (`MmkvHostObject::get` → `MMKV::set(bool)` → SEGV null deref) after an otherwise perfect boot (executorch JSI bindings installed, WatermelonDB opened). No 3.x patch exists (3.3.3 is the line's end); research pins 4.3.2 + nitro 0.36.1 and verifies on-disk data continuity given byte-identical `id`/`encryptionKey`. Android boot passed on 3.3.3 but ships 4.3.2 anyway — one substrate on both platforms.

11. **App-level codegen is now mandatory for our TurboModules.** RN 0.86 bridgeless resolves Java TurboModules through codegen-registered names; manual `TurboReactPackage` info maps alone are no longer discoverable from JS `getEnforcing`. The dead October branch (f55d59d) hit and solved the identical symptom with codegenConfig — adopted the same fix, adapted to `src/native-modules` and both modules.
12. **expo-image pulled forward (fast-image confirmed dead under Fabric/0.86).** Thumbnails rendered nothing and load events never fired. Research had already selected expo-image@57 (lockstep with RN 0.86, `recyclingKey` for FlashList, `allowDownscaling` for grid memory) over the stalled @d11 fork and the immature nitro-image. Integration kept minimal: no babel-preset-expo, no expo/metro-config, no version catalog — just autolinking + host factory + lifecycle dispatcher.
13. **Two pre-existing product bugs fixed en passant** (blocking honest runtime verification): settings persistence never wired (onboarding re-ran every launch) and the search index never loaded (MiniSearch.loadJSON double-parse). Both minimal, both verified on device.

## Risks / Trade-offs

- **[GATE] executorch 0.9.2 × RN 0.86/Hermes V1 unverified** — the single plausible blocker. Mitigation: gate-first sequencing (Decision 3); fallback decision point documented (hold at 0.85 vs wait for executorch release) rather than unpinning.
- **Gradle 9 removed-API breakage in third-party scripts** (vector-icons `fonts.gradle`, background-actions, notifee, watermelondb, executorch gradle files) — surfaces at first `gradlew` configuration, not npm install. Mitigation: build Android first; failures name the offending script; workarounds are per-script and small.
- **reanimated-dnd 2.0.0**: single-maintainer, one release in the 2.x line, internal rewrite (handle registration). Only `AlbumList.tsx` consumes it (`DropProvider`/`Sortable`, API unchanged). Mitigation: targeted drag-reorder QA; staying on 1.1.0 under reanimated 4 is explicitly *not* a fallback (built against v3 internals).
- **pager-view 8 iOS SwiftUI rewrite** (Dec 2025): API-stable but young; multi-page jump animation intentionally changed. Our only usage is adjacent-page `setPage` (Main↔Albums) — low exposure; QA pass on iOS pager feel.
- **withSpring behavioral drift** across 8 files — accepted per Non-Goals; QA is functional ("drawer opens, doesn't stutter"), not feel-parity.
- **Hermes V1 under JSI-heavy deps** (WatermelonDB+SQLCipher+simdjson, MMKV 3.3, quick-crypto 0.7) — full rebuild + boot-time smoke (DB opens, MMKV reads, keychain key decrypts). Startup crash here = pin-point the dep and evaluate its Hermes-V1 fix release before considering engine opt-out (expensive: source builds).
- **fast-image 8.6.3 rides the interop layer** — retained through 0.86 per official blogs, replacement already scheduled as its own change; if thumbnails break at runtime the replacement change gets pulled forward, not improvised here.
- **Uncached first builds** after wrapper/pods regeneration will be slow (full native recompile, prebuilt-core download) — expected, not a failure signal.
- **Xcode 26.6 is beyond RN CI's tested toolchains** — any AppleClang-26-specific C++ issue is our frontier alone; the Podfile patch mechanism (Decision 6) is the template for further surgical patches if needed.

## Gate record (task 4.3)

**GO — recorded 2026-07-03.** Android: Pixel_10 emulator (API 36) — full onboarding → gallery with photos rendering, orchestrator pipeline processed 2/2, MediaObserver + Thermal TurboModules resolving via codegen, NitroMmkv storing + hydrating across cold starts, executorch native runtime loading (ExecuTorch INFO logs), zero FATALs across all runs post-fixes. iOS: iPhone 17 simulator (iOS 26) — expo-pods build BUILD SUCCEEDED, boot alive >25s, "Successfully installed JSI bindings for react-native-executorch!", WatermelonDB opened, MMKV v2 core initialized, Welcome UI renders. Both platforms on the final stack: RN 0.86.0 + reanimated 4.5.1/worklets 0.10.1 + RNGH 3.0.2 + pager-view 8.0.2 + mmkv 4.3.2/nitro 0.36.1 + expo-image 57.
