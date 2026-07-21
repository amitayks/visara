# Tasks: personalized-vision-context

## 1. Schema + contracts

- [x] 1.1 Migration to user_version 2: `entity`, `entity_media`, indexes (additive)
- [x] 1.2 `EntityRow`/`EntityKind`/`EntityBrief`/`AnalysisContext` types; `EnrichmentResult.entities`; `VisionEngine.analyze(fileUri, context?)`; `WatchedTable` += `"entities"`
- [x] 1.3 Contracts: `EntityRepoContract`, `EntityContext` pipeline seam, `MediaRepoContract.resetForReanalysis`

## 2. Entity store

- [x] 2.1 `repo/EntityRepo.ts`: CRUD, exemplar links, `entitiesForMedia`, `promptContext`, `recordDetections` (case-insensitive resolve, vlm-link replace, user-link preserve)
- [x] 2.2 `MediaRepo.purgeByIds` + full wipe extended to `entity_media` / `entity`
- [x] 2.3 `MediaRepo.resetForReanalysis(ids)`

## 3. Vision engine rebuild

- [x] 3.1 Delete `engine/GemmaVision.ts`, `engine/parseEnrichment.ts`
- [x] 3.2 `engine/vision/promptAssembly.ts` (pure, sanitized glossary, caps)
- [x] 3.3 `engine/vision/outputParser.ts` (pure, + entities coercion)
- [x] 3.4 `engine/vision/GemmaVisionEngine.ts` (lazy ctx, mutex, 120 s budget, envelopes)
- [x] 3.5 `engine/vision/index.ts` factory

## 4. Pipeline + facade

- [x] 4.1 Pipeline `entities` dep; per-item context (fail-soft); detection recording (tolerated); `nudge()`
- [x] 4.2 Facade: entity CRUD/exemplars/`getEntitiesForMedia`, teach→re-analyze wiring, `Pipeline.configure` entities seam

## 5. Tests

- [x] 5.1 `outputParser.test.ts` (ported cases + entities field)
- [x] 5.2 `promptAssembly.test.ts` (glossary, caps, sanitization, empty context)
- [x] 5.3 `migrationsSql.test.ts` updated for v2
- [x] 5.4 Detection name-resolution pure tests

## 6. Verification

- [x] 6.1 `tsc --noEmit`, biome, jest green
