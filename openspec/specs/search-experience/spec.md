# search-experience Specification

## Purpose
TBD - created by archiving change rebuild-ui-foundation. Update Purpose after archive.
## Requirements
### Requirement: Search is inline-only and replaces the gallery grid

Search SHALL exist exclusively as an inline mode of the Gallery page: while search mode is active, search results SHALL render in place of the gallery grid, and no overlay or standalone search screen component SHALL exist in the component tree. While a completed query's results are displayed, the UI SHALL show the result count.

#### Scenario: Results replace the grid inline

- **WHEN** search mode is active and a query has completed with results
- **THEN** the grid area displays the search results instead of the gallery media
- **AND** no overlay search component is mounted anywhere in the tree

#### Scenario: Result count is visible

- **WHEN** a completed search returns N results
- **THEN** the UI displays the count N alongside the displayed results

### Requirement: Two entry paths activate the single search mode

The bottom-bar search button and a valid left-edge swipe on the Gallery page SHALL both activate the same search-mode flag in the navigation store (`navStore`) and present the inline search input. Edge-gesture validity and thresholds SHALL be as specified by `page-navigation-core`; the bottom-bar morph and input autofocus choreography SHALL be as specified by `app-navigation-shell`. This capability SHALL NOT define a second search-mode flag or competing gesture thresholds.

#### Scenario: Button entry

- **WHEN** the user taps the bottom-bar search button
- **THEN** search mode activates and the inline search input is presented for typing

#### Scenario: Edge-swipe entry matches button entry

- **WHEN** a left-edge swipe on the Gallery page satisfies the `page-navigation-core` validity rules
- **THEN** the same search-mode state activates as with the button, with no divergence in the resulting search UI

### Requirement: Query execution is debounced and stale-guarded

Query text changes SHALL be debounced by at least 200 ms before dispatching a search to the hybrid search facade; keystrokes inside the debounce window SHALL NOT produce facade calls. Each dispatched search SHALL carry a monotonically increasing request identifier, and a response SHALL update search state only if no newer request has been dispatched since it started — results from an older query SHALL never overwrite results from a newer query. Clearing the query to empty SHALL dispatch no search and SHALL clear the current results.

#### Scenario: Rapid typing produces one search

- **WHEN** the user types "sunset" as six keystrokes, each within the debounce window of the previous one
- **THEN** exactly one facade search executes, for the final text "sunset"

#### Scenario: Out-of-order response is discarded

- **WHEN** a search for query A dispatches, then a search for query B dispatches, and A's response arrives after B's response has been applied
- **THEN** the displayed results remain B's
- **AND** A's response is discarded

#### Scenario: Empty query searches nothing

- **WHEN** the user clears the query text
- **THEN** no facade search executes
- **AND** the current results are cleared

### Requirement: Result hydration is one batched query preserving fused order

The search flow SHALL resolve the ranked ids returned by hybrid search into displayable media records through the services facade's `searchMedia` (per `services-ui-facade`), which hydrates all ids of a response in a single batched database query; the search UI SHALL NOT perform per-id lookups. The display order of results SHALL equal the fused ranking order.

#### Scenario: Fused order is preserved end to end

- **WHEN** hybrid search returns ids ranked [C, A, B]
- **THEN** the results display in the order C, A, B

#### Scenario: No per-id hydration

- **WHEN** a search response contains 50 result ids
- **THEN** the UI obtains all 50 media records from a single `searchMedia` call
- **AND** the search UI issues no per-id repository lookups

### Requirement: Empty, error, and degraded search states

A completed search with zero matches SHALL present an empty-results state distinct from the error state. A failed search execution SHALL present a search-error state. When the semantic layer is unavailable and hybrid search degrades to lexical-only results (per `hybrid-search`), those results SHALL display normally with no user-facing error.

#### Scenario: Zero matches shows the empty state

- **WHEN** a search completes successfully with zero results
- **THEN** the empty-results state displays
- **AND** it is presented as "no matches", not as an error

#### Scenario: Search failure shows the error state

- **WHEN** the facade search call fails
- **THEN** the search-error state displays instead of results

#### Scenario: Semantic unavailability is invisible to the user

- **WHEN** the semantic layer is unavailable at query time and hybrid search returns lexical-only results
- **THEN** those results display exactly as normal results
- **AND** no error state or error message appears

### Requirement: Label tap in the Info sheet enters search with the query set

Tapping a label in the photo Info sheet SHALL, in a single action, activate search mode AND set the search query to the tapped label, dismissing the Info sheet and photo viewer so the inline results are visible; a search for that label SHALL then execute and display its results.

#### Scenario: Label tap from the viewer lands in active search

- **WHEN** the user taps the label "beach" in a photo's Info sheet while search mode is inactive
- **THEN** the Info sheet and photo viewer dismiss
- **AND** search mode is active with the query set to "beach"
- **AND** results for "beach" display in place of the gallery grid

### Requirement: Deactivating search clears state and restores the gallery

Deactivating search mode — via the Cancel or input-blur affordances specified by `app-navigation-shell`, or the page-swipe exit specified by `page-navigation-core` — SHALL clear the query and results and restore the gallery grid. Re-entering search after deactivation SHALL start with an empty input and no prior results.

#### Scenario: Cancel restores the gallery

- **WHEN** the user closes search via Cancel
- **THEN** search mode deactivates, the query and results are cleared, and the gallery grid displays again

#### Scenario: Re-entry starts fresh

- **WHEN** the user re-enters search after having closed it with a query and results present
- **THEN** the search input is empty
- **AND** no results from the previous session are shown

### Requirement: Submit dismisses the keyboard only

Submitting the search input from the keyboard SHALL dismiss the keyboard and SHALL NOT dispatch a new search, deactivate search mode, or change the displayed results, because the debounced pipeline has already executed the query.

#### Scenario: Submit after results are shown

- **WHEN** the user presses the keyboard's search/submit key while results are displayed
- **THEN** the keyboard dismisses
- **AND** search mode remains active with the displayed results unchanged
- **AND** no additional facade search executes

### Requirement: Search index lifecycle stays out of screens

Search index readiness SHALL be ensured through the services facade (`ensureSearchIndex`, per `services-ui-facade`); screens and UI components SHALL NOT construct, load, serialize, or rebuild search indexes, and no screen mount SHALL trigger an index rebuild.

#### Scenario: Mounting the gallery does not touch indexes

- **WHEN** the Gallery page (the search host) mounts
- **THEN** no search-index load, construction, or rebuild is initiated from the UI layer

#### Scenario: Searching with a cold index still works

- **WHEN** the user searches before the persisted search index has been loaded into memory
- **THEN** the search resolves through the facade path, which ensures index readiness
- **AND** the UI layer performs no index work of its own

