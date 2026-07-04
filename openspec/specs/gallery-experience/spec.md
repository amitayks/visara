# gallery-experience Specification

## Purpose
TBD - created by archiving change rebuild-ui-foundation. Update Purpose after archive.
## Requirements
### Requirement: Date-sectioned grid with full-width section headers

The gallery SHALL render visible media as a vertically scrolling, date-sectioned grid (FlashList) ordered newest-first. Every date section header SHALL be a full-width row spanning all grid columns — never a styled cell occupying a single column slot. Header granularity SHALL follow the zoom level: day-level headers (Today / Yesterday / full date) at 3 and 4 columns, month-year headers at 11 columns.

#### Scenario: Headers span the full row at every zoom level

- **WHEN** the grid renders date sections at 3, 4, or 11 columns
- **THEN** each section header occupies the full row width above its section's cells
- **AND** headers use day granularity (Today / Yesterday / full date) at 3 and 4 columns and month-year granularity at 11 columns

### Requirement: Pinch zoom between column levels with persistence and stable scroll

Pinch-out on the grid SHALL step the column count toward larger cells (11 → 4 → 3) and pinch-in SHALL step it toward smaller cells (3 → 4 → 11). The active column level SHALL be persisted (settingsStore single owner) and SHALL be restored on the next launch. Changing the column level MUST NOT remount the list: list identity is preserved (no key-based remount) and the user's scroll position SHALL survive the change.

#### Scenario: Column change keeps list identity and scroll position

- **WHEN** the user has scrolled deep into the library at 4 columns and pinches to 3 columns
- **THEN** the grid re-lays out at 3 columns without remounting the list
- **AND** the content previously in view remains in view (no reset to top)

#### Scenario: Zoom level survives a cold launch

- **WHEN** the user sets the grid to 11 columns and later cold-starts the app
- **THEN** the gallery renders at 11 columns

### Requirement: Constant-time grid cells with recycled thumbnail images

Each grid cell SHALL render its image via expo-image with a `recyclingKey` bound to the media id, sourcing the item's `thumbnailUri` when present and its `uri` otherwise. Per-cell render work MUST be O(1) with respect to library size — a cell MUST NOT scan the media array to derive its props (no per-item findIndex) — and cells SHALL be memoized on reference-stable model instances so a data emission re-renders only cells whose item or selection state changed.

#### Scenario: Recycled cells show the correct image

- **WHEN** the user fast-scrolls a large library
- **THEN** every recycled cell displays the image belonging to its current item (no stale bleed-through)
- **AND** each cell sources `thumbnailUri` when the item has one, else `uri`

#### Scenario: Render cost is independent of library size

- **WHEN** a single item changes in a 10,000-item library
- **THEN** only the affected cells re-render
- **AND** no cell performs a full-array scan during render

### Requirement: Live library updates within the observer throttle window

Media added or changed on the device while the gallery is open SHALL appear in the grid within the media-observer throttle window (≤ 5 seconds) without a full library rescan. The grid SHALL receive data through the screen-level throttled database observable subscription (rules in `ui-state-management`); the live enqueue path is governed by `orchestrator-gallery-bridge`.

#### Scenario: A new photo appears without a rescan

- **WHEN** a photo is added to the device library while the gallery is open
- **THEN** it appears in the grid within the observer throttle window (≤ 5 seconds)
- **AND** no full library rescan is triggered

### Requirement: Multi-select with selection bar actions

Long-pressing a grid cell SHALL enter selection mode with that item selected. While selection mode is active, tapping a cell SHALL toggle that item's membership, and a selection bar SHALL display the live selected count plus share and delete actions, with delete requiring confirmation and executing the full-cleanup delete path. Exiting selection mode SHALL clear the selection entirely. Selection changes SHALL re-render only the cells whose selected state flipped (per-id subscription to selectionStore).

#### Scenario: Enter, toggle, and count

- **WHEN** the user long-presses photo A, then taps photos B and C, then taps B again
- **THEN** selection mode is active and the selection bar count reads 3 then 2, with B unmarked after the second tap
- **AND** only the toggled cells re-render on each change

#### Scenario: Bulk action applies to the selection, then exit clears it

- **WHEN** the user confirms delete (or triggers share) with items selected
- **THEN** the action applies to exactly the selected items, with delete performing full cleanup per the delete requirement
- **AND** selection mode exits with the selection cleared, so the next long-press starts a fresh selection

### Requirement: Document filter dataset

While document mode is active, the grid SHALL display only items whose MIME type is `application/pdf`; deactivating document mode SHALL restore the full visible dataset. Document-mode entry, exit, and cross-page semantics are governed by `page-navigation-core`.

#### Scenario: Filter isolates documents

- **WHEN** document mode is active in a library containing images and PDFs
- **THEN** the grid shows only the PDF items
- **AND** toggling document mode off restores all visible media

### Requirement: Empty, permission-denied, and no-document states

The gallery MUST NOT show a blank grid or fail silently. It SHALL present distinct states for: (a) an empty library with permission granted; (b) media permission denied — including a re-request path (re-request prompt and/or link to system settings) that, once permission is granted, boots the pipeline and populates the grid without an app restart; (c) document mode with zero PDFs, distinct from the no-media state.

#### Scenario: Empty library

- **WHEN** permission is granted and the library contains no media
- **THEN** the gallery shows an empty state explaining there are no photos yet

#### Scenario: Permission denied is recoverable in place

- **WHEN** media permission is denied
- **THEN** the gallery shows a denied state with a re-request action instead of silently aborting
- **AND** granting permission through that path starts the pipeline and populates the grid without restarting the app

#### Scenario: Document mode with no documents

- **WHEN** document mode is active and the library contains no PDFs
- **THEN** the gallery shows a document-specific empty state

### Requirement: Drain progress surface without grid cell re-renders

While the processing pipeline drains, the gallery SHALL display a progress surface showing processed/total counts and current activity. Per-item progress events MUST NOT re-render grid cells: progress SHALL be driven through the processingStore snapshot and its Reanimated SharedValue mirror so grid render counts are unaffected by drain event frequency.

#### Scenario: Progress advances while the grid stays quiet

- **WHEN** the pipeline processes many items and emits per-item progress events
- **THEN** the progress surface advances continuously
- **AND** grid cells do not re-render in response to progress events (grid content updates only via throttled data emissions)

### Requirement: Photo viewer opens at the tapped photo within its launching dataset

Tapping a grid cell SHALL open the photo viewer displaying exactly the tapped photo. The viewer SHALL page horizontally strictly within the dataset that launched it — gallery order, the document-filtered set, search results (`search-experience`), or an album's contents (`albums-experience`) — supplied as in-memory items with a start index (viewerStore); it MUST NOT fall back to the unfiltered library.

#### Scenario: Viewer respects the active dataset

- **WHEN** the user taps the fifth item of the document-filtered grid
- **THEN** the viewer opens on that item
- **AND** horizontal paging reaches only items of the filtered set, in displayed order

### Requirement: Viewer surfaces track the displayed photo

When the user pages to a different photo inside the viewer, every dependent surface SHALL update to the newly displayed photo: any title/date display, the Info sheet content, and the targets of all actions (share, delete, copy). Actions MUST always act on the currently displayed photo, never on the photo the viewer was opened with.

#### Scenario: Metadata and actions follow the swipe

- **WHEN** the viewer is opened on photo A and the user swipes to photo B
- **THEN** opening the Info sheet shows B's metadata, not A's
- **AND** share, delete, and copy target B

### Requirement: Photo viewer gesture set

The viewer SHALL support: pinch zoom clamped to 1x–4x; pan while zoomed; double-tap toggling between fit and zoomed; swipe-down dismissal back to the grid; swipe-up (and an on-screen affordance) opening the Info sheet; and, while unzoomed, horizontal swipes paging between photos. Zoom/pan transforms SHALL reset when the displayed photo changes. Concurrent recognition of the zoom gestures SHALL retain the Gesture.Simultaneous composition (protected surface per `reanimated-4-animation-stack`).

#### Scenario: Zoom, pan, and double-tap

- **WHEN** the user pinches, pans while zoomed, and double-taps
- **THEN** scale stays within 1x–4x, pan moves the zoomed image, and double-tap toggles between fit and zoomed

#### Scenario: Dismiss, info, and paging from the unzoomed state

- **WHEN** the viewer is unzoomed and the user swipes down, up, or horizontally
- **THEN** down dismisses the viewer to the grid, up opens the Info sheet, and horizontal swipes page to the previous/next photo
- **AND** zoom/pan transforms are reset for the newly displayed photo

### Requirement: Info sheet metadata with real label confidence

The Info sheet SHALL present, for the currently displayed photo: creation date and filename; each AI-detected label with its real persisted confidence value (read from stored enrichment, never a hardcoded placeholder); and the extracted OCR text block when OCR text exists. Sheet presentation and nested scrolling are governed by the `ui-design-system` sheet primitive.

#### Scenario: Stored confidences and OCR are shown

- **WHEN** the Info sheet opens for a processed photo whose stored labels carry nonzero confidence values and which has OCR text
- **THEN** the sheet shows the photo's creation date and filename, each label with its stored confidence value (not 0), and the OCR text block

### Requirement: Photo actions with full-cleanup delete and reactive removal

The Info sheet SHALL expose share, copy-metadata (labels plus OCR text to the clipboard, with user-visible confirmation), add-to-album (`albums-experience`), and delete actions targeting the currently displayed photo. Delete SHALL offer app-only removal versus permanent device deletion behind a destructive confirmation, and SHALL execute via the services facade `removeMedia` so cleanup is complete (database row, search-index entries, semantic vector, pending queue rows — contract in `services-ui-facade`). After a delete, the item SHALL disappear from the grid solely through the database observable emission; no code path SHALL manually dispatch a removal into mirrored UI state, and the viewer/Info sheet SHALL close or advance so the deleted photo is no longer displayed.

#### Scenario: Delete performs full cleanup

- **WHEN** the user deletes the displayed photo, chooses app-only or permanent, and confirms
- **THEN** `removeMedia` removes the database row, its search-index entries, its semantic vector, and any pending queue rows (and the device file when permanent was chosen)

#### Scenario: Grid removal is reactive

- **WHEN** the delete completes
- **THEN** the photo disappears from the grid because the database observable emitted the updated list, with no manual state-mirror dispatch
- **AND** the viewer and Info sheet close or advance off the deleted photo

