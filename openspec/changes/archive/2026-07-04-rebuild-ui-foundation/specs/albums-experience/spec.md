# albums-experience — Delta Spec

## ADDED Requirements

### Requirement: Smart Albums Derived From AI Labels
The Albums page SHALL present the system-defined smart albums Receipts, Screenshots, Documents, ID Cards, and Handwritten Notes, each mapping to a fixed predicate over AI-assigned labels stored in the database. Smart-album membership SHALL be derived exclusively by evaluating that predicate against the database; it MUST NOT be manually editable, and smart albums MUST NOT be renameable or deletable. Each visible smart album SHALL display a live item count sourced from the database, and a smart album whose count is zero SHALL be hidden from the Albums page.

#### Scenario: Smart album appears and counts update as the pipeline labels media
- **WHEN** the processing pipeline assigns a label matching a smart album's predicate to at least one media file
- **THEN** that smart album becomes visible on the Albums page showing its current match count
- **AND** the displayed count updates as matching media are added or removed, without leaving and re-entering the Albums page

#### Scenario: Empty smart albums are hidden
- **WHEN** no media file in the database matches a smart album's label predicate
- **THEN** that smart album is not displayed on the Albums page

#### Scenario: Smart albums expose no rename or delete affordances
- **WHEN** the user invokes album management options on a smart album
- **THEN** rename and delete actions are not offered for it

### Requirement: Custom Album Lifecycle
The user SHALL be able to create a custom album from the Albums page through a name dialog, rename an existing custom album through a name dialog, and delete a custom album behind a confirmation step. Album names MUST be non-empty after trimming whitespace; a name that fails validation SHALL NOT be committed. All lifecycle operations SHALL persist through `AlbumRepository` so that custom albums and their names survive app relaunch. Deleting a custom album SHALL remove the album record and its membership records only; the member media files MUST remain in the library, on the device, and in any other albums. A custom album with zero items SHALL remain listed with a zero item count (only smart albums hide when empty).

#### Scenario: Create a custom album
- **WHEN** the user confirms the create dialog with a non-empty name
- **THEN** a custom album with that name appears on the Albums page with an item count of zero
- **AND** the album is still present after the app is fully terminated and relaunched

#### Scenario: Blank names are rejected
- **WHEN** the user attempts to confirm a create or rename dialog with an empty or whitespace-only name
- **THEN** no album is created or renamed and the user is kept in or returned to the dialog to correct the name

#### Scenario: Rename a custom album
- **WHEN** the user renames a custom album and confirms a valid name
- **THEN** the new name is shown wherever the album appears, including the Albums page and the album detail view

#### Scenario: Delete a custom album after confirmation
- **WHEN** the user chooses delete on a custom album and confirms the confirmation prompt
- **THEN** the album and its membership records are removed
- **AND** every photo that was a member remains present in the gallery, on the device, and in every other album it belonged to

#### Scenario: Cancelling deletion changes nothing
- **WHEN** the user dismisses the delete confirmation prompt
- **THEN** the album, its memberships, and its position in the list are unchanged

### Requirement: Persistent Album Reordering
The Albums page SHALL let the user reorder albums by long-pressing an album and dragging it to a new position. Releasing the drag SHALL immediately commit the new order to the displayed list and persist it through `AlbumRepository` sort order, so the order is restored on subsequent app launches. The albums drag list SHALL be hosted in the drag-and-drop library's own container (`Sortable`) and MUST NOT be nested inside a plain `ScrollView`; mounting the Albums page MUST NOT emit a nested-list warning or development red-screen.

#### Scenario: Drag-reorder commits and persists
- **WHEN** the user long-presses an album, drags it to a new position, and releases
- **THEN** the Albums page immediately shows the albums in the new order
- **AND** the same order is shown after the app is fully terminated and relaunched

#### Scenario: Albums list mounts without nested-list warnings
- **WHEN** the app boots in development and the Albums page mounts
- **THEN** no nested-VirtualizedList warning or red-screen error is emitted by the albums list

### Requirement: Album Detail Grid
Tapping an album on the Albums page SHALL open an album detail view containing a photo grid scoped to that album's members — for a smart album, the media files matching its label predicate; for a custom album, its persisted memberships. The scoped grid SHALL provide the photo viewer and multi-select behaviors specified in the `gallery-experience` capability, and a photo viewer opened from album detail SHALL page only within the album's member set. Media files no longer visible in the library MUST NOT appear in the detail grid nor be included in the album's item count. An album detail view with zero members SHALL display an empty state instead of a blank grid.

#### Scenario: Custom album detail shows exactly its members
- **WHEN** the user taps a custom album
- **THEN** the detail view shows a photo grid containing exactly that album's member media files

#### Scenario: Smart album detail shows exactly the predicate matches
- **WHEN** the user taps a visible smart album
- **THEN** the detail view shows a photo grid containing exactly the media files matching that album's label predicate

#### Scenario: Viewer paging stays scoped to the album
- **WHEN** the user opens a photo from an album detail grid and swipes to the next or previous photo
- **THEN** the viewer navigates only among that album's members and its info and actions target the currently displayed member

#### Scenario: Removed media disappears from albums
- **WHEN** a media file belonging to a custom album is deleted from the library
- **THEN** it no longer appears in that album's detail grid
- **AND** the album's displayed item count decreases accordingly

#### Scenario: Empty album detail shows an empty state
- **WHEN** the user opens a custom album that has no members
- **THEN** the detail view displays an empty state rather than a blank grid

### Requirement: Add To Album From Photo Info Sheet
The photo Info sheet SHALL provide an add-to-album action that presents the user's custom albums as selectable targets plus an inline create-new-album option; smart albums MUST NOT be offered as targets. Selecting a target SHALL persist the photo's membership through `AlbumRepository`, and adding a photo that is already a member of the selected album MUST NOT create a duplicate membership. Inline creation SHALL apply the same name validation as the Albums page create dialog and SHALL add the photo to the newly created album in the same flow.

#### Scenario: Add a photo to an existing custom album
- **WHEN** the user chooses add-to-album on the Info sheet and picks an existing custom album
- **THEN** the photo appears in that album's detail grid
- **AND** the album's displayed item count reflects the addition

#### Scenario: Create a new album inline while adding
- **WHEN** the user chooses the create-new option in the add-to-album picker and confirms a valid name
- **THEN** a new custom album is created containing the photo
- **AND** the album appears on the Albums page with an item count of one

#### Scenario: Re-adding to the same album is idempotent
- **WHEN** the user adds a photo to a custom album it already belongs to
- **THEN** the album contains exactly one membership for that photo and its item count is unchanged

### Requirement: Albums Page Empty State
The Albums page SHALL display an empty state when it has no albums to list — no custom albums exist and every smart album is hidden for having zero matches. The empty state SHALL include a create-album call to action that opens the album creation name dialog.

#### Scenario: No albums yet shows a create call to action
- **WHEN** the user opens the Albums page while no custom albums exist and no media matches any smart-album predicate
- **THEN** an empty state with a create-album call to action is displayed instead of an album list

#### Scenario: Call to action opens the creation dialog
- **WHEN** the user taps the empty state's create-album call to action
- **THEN** the album creation name dialog opens
