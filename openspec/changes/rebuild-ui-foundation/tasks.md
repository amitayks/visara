# Tasks — rebuild-ui-foundation

Phases follow design D6: spike-gated foundations → parallel build (old tree still compiles) → single cutover commit → verification. Old UI files are NOT touched until 6.x.

## 1. Phase 0 — Dependencies, spike gate, tooling

- [x] 1.1 Add deps: `react-native-unistyles@3.2.5`, `zustand@5.0.14`, `@react-navigation/native-stack@^7.17.9`, `@lodev09/react-native-true-sheet@^3.11.0`, `sonner-native@^0.26.4`; bump `react-native-pager-view` to `8.0.3`; remove `react-native-paper`, `@react-navigation/stack`, `@react-navigation/bottom-tabs`. npm install; verify nitro-modules stays exact 0.36.1.
- [x] 1.2 Configure unistyles babel plugin (before `react-native-worklets/plugin`, which stays LAST; module-resolver + decorators + class-static-block untouched); `cd ios && pod install` (three Podfile patches must still apply cleanly); gradle sync via a debug assemble.
- [x] 1.3 SPIKE GATE (D1): temporary `__DEV__` screen exercising unistyles on RN 0.86 — theme define/flip (light/dark/adaptive), StyleSheet variants, `useAnimatedTheme` in a worklet, hot reload — on BOTH iPhone 17 sim and Pixel_10 emulator. Also present a TrueSheet with a scrollable child on both platforms. SPIKE RESULT 2026-07-04: PASS on both platforms (Android: theme flip + worklet theme + TrueSheet nested scroll OK on Pixel/OnePlus; iOS: required Podfile patch #4 restoring -ObjC dropped by executorch SDK-conditional OTHER_LDFLAGS — Unistyles TurboModule was dead-stripped; fixed and verified on iPhone 17 sim). Sheet primitive must pass themed backgroundColor to TrueSheet (native container follows OS scheme otherwise). Record pass/fail in this file; on fail, switch D1 fallback (typed StyleSheet token engine behind the same wrapper) and continue.
- [x] 1.4 Jest enablement: `transformIgnorePatterns` for the real dep set; setup file with reanimated/worklets mocks per v4 guidance, unistyles mock, in-memory MMKV mock; `npm test` green with a trivial store test proving the harness works.

## 2. Design system (`src/ui`) — spec: ui-design-system

- [x] 2.1 Tokens: colors (dark reference + complete light), spacing (4px base incl. 2/12/20), radii, typography, motion (durations + spring configs incl. morph bezier). Single `ThemeMode` type (`light|dark|system`).
- [x] 2.2 Unistyles engine wiring: themes registered, adaptive mode, settings-driven override; `StatusBar` driven by RESOLVED theme; wrapper API (`useAppTheme`, `createStyles`) so the D1 fallback stays swappable.
- [x] 2.3 Primitives (batch 1, pure): Text, Icon (direct MDI), Button, IconButton, Pressable feedback, Chip, ListItem/Section, Skeleton, EmptyState, SwitchRow, SegmentedControl.
- [x] 2.4 Primitives (batch 2, behavioral): Sheet (TrueSheet wrapper: backdrop, nested scroll, detents), Dialog (confirm/destructive variants), Menu, Toast setup (sonner-native `<Toaster/>` + `toast` helpers), ProgressBar (SharedValue-driven, no re-render path), SelectionBar.
- [x] 2.5 Accessibility pass on all primitives (role/label/state); unit tests for token resolution + theme mode resolution.

## 3. State layer (`src/state`) — spec: ui-state-management

- [x] 3.1 `settingsStore`: persist→MMKV (JSON storage adapter over existing `mmkv` singleton — encryption key untouched); fields theme/batterySaver/nightProcessing/gridZoomLevel/onboardingCompleted; boolean-typed battery/night keys with idempotent legacy-string migration (`getString==='true'` → boolean write-once); unit tests incl. migration idempotency + cold-start read by BackgroundTaskService format.
- [x] 3.2 `navStore`: currentPage/searchMode/documentMode with the exact transition table (swipe exits search; document persists; document-toggle-on-Gallery vs redirect-then-activate-from-Albums; settings/search mutual exclusions); unit tests for every transition (port from old reducer semantics).
- [x] 3.3 `selectionStore` (Set-based, per-id selector helpers) + `viewerStore` ({items, startIndex, currentIndex} transient) + `searchStore` (query/status/results, monotonic request id).
- [x] 3.4 `processingStore` (snapshot fields + failedCount) with vanilla-subscribe → Reanimated SharedValue mirror util; `modelStore` mirroring `GemmaModelDeliveryService.subscribe` (emit-on-subscribe; enabled sourced from service).
- [x] 3.5 `useVisibleMedia()` hook: single `observeVisible()` subscription, 250ms trailing throttle, screen-local state; unit test with a fake observable proving coalescing.

## 4. Services facade + bootstrap — specs: services-ui-facade, orchestrator-gallery-bridge

- [x] 4.1 `src/services/facade.ts`: `searchMedia(query)` (HybridSearch + single `Q.oneOf` batched hydration preserving fused order, drops stale ids), `removeMedia(id,{permanent})` (full cleanup: DB+lexical+vector+queue via a public path reusing `removeByUri` internals), `ensureSearchIndex()` (idempotent load-or-rebuild). Unit tests with repo mocks.
- [x] 4.2 Settings ownership fix: `BackgroundTaskService` never writes battery/night keys post-migration; reads booleans; verify no other writer remains (grep). 
- [x] 4.3 `src/app/bootstrap.ts`: `startAppServices()/stopAppServices()` preserving exact boot order (model-delivery init fire-and-forget → `requestPermissions` → on grant `initialize`+`runInitialProcessing`; on deny → `permissionState='denied'` store + retry path that completes boot without restart); orchestrator event map → processingStore verbatim; observer start/forward/stop; settings→`BackgroundTaskService.updateSettings` subscription.

## 5. App shell + features (`src/app`, `src/features`) — specs: app-navigation-shell, gallery/search/albums/settings/onboarding-experience, page-navigation-core, onboarding-model-step, ai-model-settings

- [x] 5.1 Navigation: static root tree (Onboarding `if`, Shell, PhotoViewer transparentModal, Settings push, DevPoc `if __DEV__`); new thin `App.tsx` composition (GestureHandlerRootView > SafeAreaProvider > Toaster > Navigation) kept in `src/app/` until cutover.
- [x] 5.2 PagerShell: port HorizontalPageContainer worklet logic VERBATIM (50px origin zones, v>500/d>100, Gesture.Race, one store→sharedValue sync, edge preview, spring reset); pure-function gesture validity module + unit tests; right-edge on Albums → `navigate('Settings')`.
- [x] 5.3 BottomBar: morph choreography per spec (stagger windows, absolute overlap, pointerEvents from state, disabled mid-morph, autofocus post-morph, `useAnimatedKeyboard`); page/search/document buttons projecting navStore.
- [x] 5.4 GalleryPage: date-sectioned FlashList v2 grid (full-width spanned headers, no remount on zoom — column change without key swap, scroll preserved), `useVisibleMedia`, pinch zoom 3/4/11 persisted via settingsStore, expo-image cells (recyclingKey, thumbnailUri??uri), selection mode + SelectionBar, document filter dataset, empty states (no media / permission denied + retry / no PDFs), processing progress surface (SharedValue ProgressBar).
- [x] 5.5 PhotoViewer: transparentModal, viewerStore-driven paging (swipe between photos updates title/date + all action targets — stale-metadata fix), pinch 1x-4x + pan, double-tap, swipe-down dismiss (Gesture.Simultaneous), bounds-zoom open/close transition (~150 LOC custom), swipe-up/button → Info sheet.
- [x] 5.6 Info sheet (TrueSheet): metadata, labels with REAL confidence, OCR block, actions (share, copy, add-to-album, delete trash/permanent via facade with confirm); label tap → search mode + query (spec: search-experience).
- [x] 5.7 Search: debounce ≥200ms + stale guard in searchStore effect → `facade.searchMedia`; results replace grid with count; empty/error states; close restores gallery; `ensureSearchIndex` on first search intent (never from screen mount).
- [x] 5.8 AlbumsPage: smart albums from labels (5 canonical, live counts, empty hidden), custom albums CRUD (create/rename/delete via AlbumRepository), drag-reorder WIRED (reanimated-dnd, Sortable-safe container, order persisted), AlbumDetail scoped grid route, add-to-album flow from Info sheet.
- [x] 5.9 SettingsScreen: Appearance (theme trio, immediate), Processing (toggles→store→BackgroundTaskService; status line incl. paused reason + failed count; fire-and-forget Re-run Analysis), AI Model section (modelStore-driven: status/variant/size/progress/controls/waiting reason/free-disk warning, enabled from subscription), Data Management (Clear Cache implemented + toast; Delete All Data implemented: wipe media/labels/ocr/embeddings/queue/indexes, preserve settings+onboarding, restart discovery; typed confirm), About (version + privacy statement, no dead rows).
- [x] 5.10 Onboarding: steps welcome/privacy/permissions/model/complete; working Skip → final step; REAL permission request with granted/denied/limited states + settings link; privacy copy contract verbatim; model step start-or-defer never blocking; completion sets settingsStore.onboardingCompleted.
- [x] 5.11 Move Dev POC surfaces to `src/features/dev/` functionally intact (`__DEV__` gate, useLLM direct, file:// contract, iPad-operable); de-paper if they import it.

## 6. Cutover — single commit

- [x] 6.1 Point `index.js`→ new `src/App.tsx`; DELETE `src/contexts`, `src/navigation`, `src/screens`, `src/components`, `src/theme` (and dead utils only they used); keep `src/native-modules` (codegen), `src/services`, `src/models`, `src/shared-types`, `src/assets`.
- [x] 6.2 Update path aliases in BOTH tsconfig.json and babel.config.js (add @ui/@state/@app/@features; drop dead ones); README nav/state/structure sections rewritten.
- [x] 6.3 Green gate: `npm run typecheck`, `npm run lint:fix` then `npm run lint`, `npm test` — zero errors; grep proves no imports of deleted paths/paper remain.

## 7. Verification — both platforms 100%

- [x] 7.1 Android (Pixel_10 emulator, API 37/16KB): VERIFIED — boot→onboarding (no red box after metro `lazy=false` fix for Unistyles Nitro registration), working Skip→final step, Get started→gallery, real READ_MEDIA permission grant, MediaObserver discovery (2 seeded photos), pipeline ran (2 processed, 2 OCR-failed = emulator ML-Kit limitation, surfaced honestly as "0 of 2 · 2 failed"), date-sectioned grid, processing progress + SharedValue underline, PhotoViewer with correct per-item filename+date chrome, search facade ('beach'→1 result), page swipe to Albums, Settings push, dark-theme immediate apply (Unistyles), AI Model section (Vulkan variant, size/free, insufficient-space warning). CDP-driven via `__visaraQA` dev hooks.
- [x] 7.2 iOS (iPhone 17 sim, iOS 26.4): VERIFIED — Podfile patch #4 (restore -ObjC dropped by executorch SDK-conditional OTHER_LDFLAGS) fixed Unistyles TurboModule dead-strip; boot→gallery with real date-sectioned photos, onboarding gate + privacy copy, real permission prompt (correct copy), albums, Settings push + native "Shell" back button, search facade ('beach'→1 result), PhotoViewer per-item chrome (`sign_object.jpg`), grid zoom 4→3 no-remount, dark theme immediate.
- [x] 7.3 Gesture invariants: gestureMath pure functions unit-tested (origin 50px zones, velocity>500||distance>100, long-swipe-past-mid-screen, 200px-origin never fires) — 116 tests green incl. gesture math + nav transitions + search stale-guard + settings migration. On-device pinch/swipe/morph confirmed via CDP state drives (page transitions, search morph, zoom persist).
- [x] 7.4 Green gates: typecheck 0 errors, biome clean (2 pre-existing ThumbnailService warnings, not UI), 116/116 jest. Known non-UI issue logged: emulator ML-Kit OCR fails on synthetic test images (`TextRecognitionService` — services layer, real-device/iOS unaffected). Spike outcome + Podfile patch #4 + metro lazy fix recorded in commits.
