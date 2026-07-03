> design.md omitted: the agent map (recorded in proposal) IS the design ground truth; decisions are enumerated in the proposal.

## 1. Container rebuild

- [x] 1.1 Rewrite `HorizontalPageContainer.tsx`: drop `currentPageLocal`; context→`pageShared` sync effect; gesture origin captured in `onBegin` shared value; edge checks in worklets use shared values only; remove inner `GestureHandlerRootView`; preserve constants/spring/overlay/Race/pager props verbatim.
- [x] 1.2 tsc + lint green.

## 2. Dead-code excision

- [x] 2.1 Delete `SearchModeOverlay.tsx` + `ModalNavigator.tsx` (grep-verified unreferenced).
- [x] 2.2 NavigationContext: remove `ACTIVATE_DOCUMENT_MODE`/`DEACTIVATE_DOCUMENT_MODE` actions + cases; GalleryContext: remove `isDocumentMode` + `TOGGLE_DOCUMENT_MODE`.
- [x] 2.3 MainTemplate: remove commented `BottomNavContainer` block; MainScreen: remove commented handler block.

## 3. Filter fix

- [x] 3.1 MainScreen document predicate → `mimeType === "application/pdf"`.

## 4. Verification (emulator drive)

- [x] 4.1 Swipe Main↔Albums (both directions) — pages settle, active nav state follows, search closes on page change.
- [x] 4.2 Search: morph opens, query filters grid in place, close restores gallery.
- [x] 4.3 Document button: on Main toggles filter (PDF-only view); from Albums redirects to Main with filter on.
- [x] 4.4 Settings drawer opens/closes; Android back chain intact.
- [x] 4.5 Green sweep + boot both platforms + commit + push.

> Verification note (2026-07-03, Pixel_10 drive): pager swipe Main↔Albums was found BROKEN pre-rebuild (regression introduced by the RNGH 3 upgrade in change upgrade-rn-086-platform: edge Pan gestures activated anywhere on screen and v3 detector activation blocks the native pager). Fixed here via hitSlop edge-strip confinement — recognition limited to the 50px bands, restoring native pager scrolling while preserving edge actions. Verified live: page swipe both directions with active-state tracking; documents-from-Albums redirect with PDF-only empty-state; documents toggle-off restore; search morph → in-place results (query beach → 2 beach photos) → close restore; settings drawer open/close; zero FATALs.
