# ui-state-management — Delta Spec

## MODIFIED Requirements

### Requirement: Entity collections are consumed at screen level, never mirrored into stores

Global stores SHALL NOT subscribe to backend reactive queries and SHALL NOT hold entity collections mirrored from the database. Screens that render database collections SHALL subscribe to the owning backend feed (`useVisibleMedia` / `watchQuery`-based hooks) at screen level with a trailing throttle of approximately 250 ms (trailing edge guaranteed, so the final database state always renders), hold emissions in screen-local state, and render cells memoized on the reference-stable row objects the feed emits (the backend's row cache guarantees unchanged rows keep object identity across emissions). Exactly two bounded snapshots of already-loaded entities are permitted in global stores — `searchStore`'s current result set (written only by a completed, non-stale search response) and `viewerStore`'s open-session item list (written only when the viewer opens) — and these SHALL NOT be updated by database observation and SHALL be cleared when their surface exits.

#### Scenario: A processing drain does not storm the UI

- **WHEN** the pipeline drain writes one processed photo to the database per item across thousands of items
- **THEN** no global store receives a per-write update
- **AND** the gallery re-renders at most approximately once per 250 ms from its throttled subscription, and renders the final emission after the drain ends

#### Scenario: Unchanged rows do not re-render

- **WHEN** a throttled emission delivers an updated array in which one row changed
- **THEN** only cells whose row reference changed re-render, and all other memoized cells are skipped

#### Scenario: Deletion propagates through observation alone

- **WHEN** a photo is deleted
- **THEN** the grid updates via the feed's next emission
- **AND** no code manually patches a mirrored array or dispatches a removal into a global store
