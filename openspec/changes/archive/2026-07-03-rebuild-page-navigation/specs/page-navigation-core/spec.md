## ADDED Requirements

### Requirement: Single source of truth for page state

`NavigationContext.currentPage` SHALL be the only page-state authority: `HorizontalPageContainer` derives its pager position and worklet-visible page index from context (via one context→sharedValue sync), dispatches `SET_PAGE` on pager settle, and holds no independent page state.

#### Scenario: Page changes stay consistent through both entry paths

- **WHEN** the user swipes between Main and Albums or taps the Albums nav button
- **THEN** the pager, the context, and the bottom-nav active state agree on the page, and swiping pages exits search mode while document mode persists

### Requirement: Edge-swipe validity judged from gesture origin

Edge-swipe recognition SHALL capture the touch origin at gesture start and validate the 50px edge zone against that origin (not the release position), preserving the velocity-500/distance-100 thresholds, the spring reset, and the translucent edge preview.

#### Scenario: Long edge swipe still triggers

- **WHEN** a swipe starts within 50px of the left edge on Main and ends past mid-screen with distance > 100
- **THEN** search mode activates (previously the release-position check silently dropped it)

#### Scenario: Mid-screen swipe does not trigger edge actions

- **WHEN** a swipe starts 200px from the edge
- **THEN** no edge action fires regardless of velocity; the pager handles it

### Requirement: One search implementation, honest document filter

Search SHALL exist only as MainScreen's inline mode (results replace the grid; the bottom bar morphs into the search field); the orphaned overlay implementation is removed. Document mode SHALL filter to `application/pdf` media only, toggling on Main and redirecting-then-activating from Albums per the existing reducer contract.

#### Scenario: Search results replace the grid

- **WHEN** search mode is active with a query
- **THEN** the main grid shows search results (no overlay component exists in the tree), and closing search restores the gallery

#### Scenario: Document filter isolates documents

- **WHEN** document mode is on and the library contains images and PDFs
- **THEN** only PDFs display; toggling off restores all media
