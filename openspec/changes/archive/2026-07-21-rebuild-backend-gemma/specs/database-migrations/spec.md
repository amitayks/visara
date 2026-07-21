# database-migrations — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: Versioned schema with an explicit migration path
**Reason**: WatermelonDB schema/migrations are deleted.
**Migration**: Superseded by `sqlite-storage-core` (PRAGMA user_version migration runner).

### Requirement: Non-destructive in-place upgrade from v1 to v2
**Reason**: WatermelonDB schema/migrations are deleted.
**Migration**: Superseded by `sqlite-storage-core` (PRAGMA user_version migration runner).

### Requirement: One migration step per schema change
**Reason**: WatermelonDB schema/migrations are deleted.
**Migration**: Superseded by `sqlite-storage-core` (PRAGMA user_version migration runner).
