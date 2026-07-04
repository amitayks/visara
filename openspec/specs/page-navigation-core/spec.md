# page-navigation-core Specification

## Purpose
TBD - created by archiving change rebuild-page-navigation. Update Purpose after archive.
## Requirements
### Requirement: Single source of truth for page state

The navigation store (`navStore`) SHALL be the only page-state authority: the pager shell derives its pager position and worklet-visible page index from the store (via one store→sharedValue sync), writes the page back to the store on pager settle, and holds no independent page state.

#### Scenario: Page changes stay consistent through both entry paths

- **WHEN** the user swipes between Gallery and Albums or taps the Albums button in the bottom bar
- **THEN** the pager, the store, and the bottom-bar active state agree on the page, and swiping pages exits search mode while document mode persists

### Requirement: Edge-swipe validity judged from gesture origin

The pager shell's edge-swipe recognition SHALL capture the touch origin at gesture start and validate the 50px edge zone against that origin (not the release position), preserving the velocity-500/distance-100 thresholds, the spring reset on a failed swipe, and the translucent edge preview during the gesture. A valid left-edge swipe on Gallery SHALL activate search mode; a valid right-edge swipe on Albums SHALL push the Settings screen (same gesture as before, new destination — the overlay settings drawer is removed).

#### Scenario: Long edge swipe still triggers

- **WHEN** a swipe starts within 50px of the left edge on Gallery and ends past mid-screen with distance > 100
- **THEN** search mode activates (previously the release-position check silently dropped it)

#### Scenario: Right-edge swipe on Albums opens the Settings screen

- **WHEN** a swipe starts within 50px of the right edge on Albums and meets the velocity-500 or distance-100 threshold
- **THEN** the Settings screen is pushed (no overlay drawer exists in the tree), and the platform back gesture or button returns to Albums

#### Scenario: Mid-screen swipe does not trigger edge actions

- **WHEN** a swipe starts 200px from the edge
- **THEN** no edge action fires regardless of velocity; the pager handles it

### Requirement: One search implementation, honest document filter

Search SHALL exist only as the Gallery page's inline mode (results replace the grid; the bottom bar morphs into the search field); no overlay search implementation SHALL exist. Document mode SHALL filter to `application/pdf` media only, toggling on Gallery and redirecting-then-activating from Albums per the navStore transition rules.

#### Scenario: Search results replace the grid

- **WHEN** search mode is active with a query
- **THEN** the Gallery grid shows search results (no overlay component exists in the tree), and closing search restores the gallery

#### Scenario: Document filter isolates documents

- **WHEN** document mode is on and the library contains images and PDFs
- **THEN** only PDFs display; toggling off restores all media

