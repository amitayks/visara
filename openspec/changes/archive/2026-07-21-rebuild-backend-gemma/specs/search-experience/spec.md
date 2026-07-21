# search-experience — Delta Spec

## MODIFIED Requirements

### Requirement: Search index lifecycle stays out of screens

Search SHALL execute solely through the services facade (`searchMedia`, per `services-ui-facade`); screens and UI components SHALL NOT construct, load, serialize, or rebuild any search index, and no screen mount SHALL trigger index work. There is no index-readiness step: the facade queries live database tables directly (`hybrid-search`), so no `ensureSearchIndex`-style call exists in the UI layer.

#### Scenario: Mounting the gallery does not touch indexes

- **WHEN** the Gallery page (the search host) mounts
- **THEN** no search-index load, construction, or rebuild is initiated from the UI layer

#### Scenario: Cold-start search works immediately

- **WHEN** the user searches immediately after a cold launch
- **THEN** the search resolves through the facade path against live tables, with no index warm-up performed by any layer
