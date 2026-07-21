# user-entity-store Specification

## Purpose
TBD - created by archiving change personalized-vision-context. Update Purpose after archive.
## Requirements
### Requirement: Users can teach entities the model cannot know

The backend SHALL persist user-taught entities — kind ∈ {person, pet, brand, event, place, other}, a name (required, non-empty after trim), and a free-text description — with created/updated timestamps, in schema v2 tables `entity` and `entity_media` (additive migration, no existing rows touched). The facade SHALL expose create, update, delete, list (most-recently-updated first), and per-entity exemplar linking (`source='user'`) of media ids. Entity ids are locally generated (`ent_` uid, same dependency-free scheme as albums).

#### Scenario: Teaching a brand by its design

- **WHEN** the user creates entity `{kind: "brand", name: "Loomis", description: "my coffee brand — matte black bag, orange bird logo, no text"}` and links two photos of the bag
- **THEN** the entity row and two `entity_media` rows with `source='user'` persist, and `listEntities()` returns it first

### Requirement: Teaching triggers re-analysis of affected photos

Creating exemplar links, updating an entity, or deleting an entity SHALL flip the entity's exemplar media rows (current exemplars; on delete, the former exemplars) back to `enrich_status='pending'` (retry count and error reset, deleted rows excluded) and nudge the pipeline (wake a running drain, start an idle one), so the taught knowledge is reflected in enrichment without user-initiated reprocessing.

#### Scenario: Linking exemplars re-enriches them

- **WHEN** the user links an already-`done` photo to an entity
- **THEN** that photo returns to `pending` and the pipeline re-analyzes it with the entity in context

#### Scenario: Deleting an entity scrubs stale knowledge

- **WHEN** an entity with exemplars is deleted
- **THEN** its links are removed and the former exemplar photos re-enrich without the deleted entity in context

### Requirement: Model-detected entity links are recorded, never trusted blindly

When an analysis reports entity names, the pipeline SHALL resolve them case-insensitively against the current store, drop unresolved names, and persist matches as `entity_media` rows with `source='vlm'` — replacing prior `vlm` rows for that photo only and never modifying `source='user'` rows. Recording SHALL be tolerated-failure: enrichment persistence never depends on it. The facade SHALL expose the entities linked to a media id (both sources, user first) for viewer display.

#### Scenario: Hallucinated name is dropped

- **WHEN** the model reports `entities: ["Biscuit", "Rex"]` and only "Biscuit" exists in the store
- **THEN** exactly one `vlm` link (Biscuit) is written and no entity named "Rex" is created

#### Scenario: Re-analysis refreshes model opinion only

- **WHEN** a photo with a `user` link and an old `vlm` link is re-analyzed and the model reports no entities
- **THEN** the `vlm` link is removed and the `user` link remains

### Requirement: Entity data participates in lifecycle cleanup

Purging media SHALL delete their `entity_media` rows in the same transaction as the other per-media rows; the full data wipe SHALL clear `entity_media` while preserving entity shells (the albums precedent — taught knowledge survives a media wipe). Repository writes SHALL notify the invalidation bus under the new `"entities"` watched table.

#### Scenario: Purged photo leaves no dangling links

- **WHEN** a photo with entity links is permanently deleted
- **THEN** no `entity_media` row referencing it survives
