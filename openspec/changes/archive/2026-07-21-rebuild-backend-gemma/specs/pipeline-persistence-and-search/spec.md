# pipeline-persistence-and-search — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: Completion stamps processing provenance and preserves the is_processed invariant
**Reason**: The MiniSearch-index-plus-repositories persistence contract is deleted (WatermelonDB, MMKV index snapshots).
**Migration**: Superseded by `sqlite-storage-core` (single SQLite source of truth) and `hybrid-search` (FTS5).

### Requirement: Re-processing is idempotent via version columns
**Reason**: The MiniSearch-index-plus-repositories persistence contract is deleted (WatermelonDB, MMKV index snapshots).
**Migration**: Superseded by `sqlite-storage-core` (single SQLite source of truth) and `hybrid-search` (FTS5).

### Requirement: Search is updated incrementally per processed file
**Reason**: The MiniSearch-index-plus-repositories persistence contract is deleted (WatermelonDB, MMKV index snapshots).
**Migration**: Superseded by `sqlite-storage-core` (single SQLite source of truth) and `hybrid-search` (FTS5).
