## Why

The page-navigation layer works but carries structural debt the UI docs (todo.md, UI-PAGES-IMPROVMENT.md) flagged: `HorizontalPageContainer` keeps a dual source of truth (`currentPageLocal` state vs `NavigationContext.currentPage`), its edge-swipe validity check reads the pointer position at *release* instead of gesture *origin* (an edge swipe ending mid-screen fails), gesture worklets read JS state (stale-closure risk under reanimated 4), and a redundant nested `GestureHandlerRootView` wraps it. Meanwhile a full parallel search implementation (`SearchModeOverlay.tsx`, 470 lines) is **dead code — never mounted anywhere** — duplicating MainScreen's live inline search, and the document-mode filter predicate matches `application/pdf || image/*`, i.e. everything: a no-op filter. Deep exploration (agent map, 2026-07-03) confirmed todo items 2 and 3 are already implemented in the live code; the remaining value is this cleanup + defect fixing without losing the edge features todo.md explicitly protects.

## What Changes

- **Rebuild `HorizontalPageContainer` internals** (public behavior identical): context becomes the single source of truth (no `currentPageLocal`); a `useSharedValue` page mirror feeds worklets (fixes stale closures); edge-swipe origin captured at gesture start into a shared value and validated at end (fixes the release-position bug); inner `GestureHandlerRootView` removed (App root provides one). Preserved exactly: pager-view props (`offscreenPageLimit=1`, `overScrollMode="never"`), 50px edge zone, velocity 500 / distance 100 thresholds, spring config, translucent edge-preview overlay, `Gesture.Race` composition, `setPage` sync.
- **Delete dead code**: `SearchModeOverlay.tsx` (orphaned duplicate search pipeline), `ModalNavigator.tsx` (unmounted stub), `NavigationContext`'s never-dispatched `ACTIVATE_DOCUMENT_MODE`/`DEACTIVATE_DOCUMENT_MODE`, `GalleryContext`'s dead `isDocumentMode`/`TOGGLE_DOCUMENT_MODE`, the commented-out `BottomNavContainer` block in MainTemplate and commented handlers in MainScreen.
- **Fix the document filter**: predicate becomes `mimeType === "application/pdf"` (true documents; the discovery pipeline explicitly scans PDFs). Previously `pdf || image/*` showed everything.
- **Preserved behavioral contracts** (verified in the map): `SET_PAGE` closes search but not document mode; search↔settings exclusivity; document toggle on Main / redirect+activate from Albums (already correct in the reducer); Android back-handler chain (search→settings, drawers→viewer); `useAnimatedKeyboard` bottom-offset; safe-area layering; edge-swipe → search/settings entry.

## Capabilities

### New Capabilities
- `page-navigation-core`: the two-page pager with edge-gesture mode entry runs on a single-source-of-truth context model with worklet-safe gesture logic, and search/document/settings modes follow the documented interaction contract with no duplicate implementations.

### Modified Capabilities
<!-- None — no existing spec governs the navigation UI layer. -->

## Impact

- Rewritten: `src/components/organisms/HorizontalPageContainer.tsx`. Deleted: `src/components/organisms/SearchModeOverlay.tsx`, `src/navigation/ModalNavigator.tsx`. Trimmed: `NavigationContext.tsx`, `GalleryContext.tsx`, `MainTemplate.tsx`, `MainScreen.tsx` (filter + comment blocks).
- Risk: edge-gesture feel regression (mitigated: constants/spring preserved verbatim; on-device drive test); worklet page-mirror desync (mitigated: single effect syncs context→shared value).
