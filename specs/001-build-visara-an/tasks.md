# Tasks: Visara - Intelligent Photo Gallery

**Input**: Design documents from `specs/001-build-visara-an/`
**Prerequisites**: plan.md (complete), spec.md (complete)

## Execution Flow (main)
```
1. ✅ Load plan.md from feature directory
   → Extract: tech stack, libraries, structure
2. ✅ Load optional design documents:
   → spec.md: Extract acceptance scenarios → integration test tasks
   → plan.md data model: Extract 8 entities → model tasks
   → plan.md contracts: Extract 4 service contracts → contract test tasks
3. ✅ Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: integration tests from scenarios
   → Core: models, services, contexts
   → Integration: navigation, background processing
   → Polish: animations, error boundaries, performance
4. ✅ Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. ✅ Number tasks sequentially (T001, T002...)
6. ✅ Generate dependency graph
7. ✅ Create parallel execution examples
8. ✅ SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
Mobile project structure: `src/` at repository root, `android/` and `ios/` for native code

---

## Phase 3.1: Setup & Dependencies ✅ COMPLETED

- [x] T001 Initialize React Native 0.81.4 project with TypeScript 5.0+ template using `npx react-native@0.81.4 init Visara --template react-native-template-typescript`
- [x] T002 Enable React Native New Architecture (Fabric + TurboModules) by updating android/gradle.properties and ios/Podfile with newArchEnabled=true
- [x] T003 [P] Install UI dependencies: react-native-paper, react-native-gesture-handler@2.20.2, react-native-reanimated@3.16.5, react-native-safe-area-context
- [x] T004 [P] Install navigation dependencies: @react-navigation/native@7, @react-navigation/stack, @react-navigation/bottom-tabs, react-native-screens
- [x] T005 [P] Install data dependencies: @nozbe/watermelondb, @nozbe/simdjson, react-native-mmkv, minisearch
- [x] T006 [P] Install ML dependencies: @react-native-ml-kit/image-labeling, @react-native-ml-kit/text-recognition
- [x] T007 [P] Install media dependencies: @react-native-camera-roll/camera-roll, react-native-vision-camera, react-native-fast-image
- [x] T008 [P] Install background/notification dependencies: react-native-background-actions, notifee
- [x] T009 [P] Install additional dependencies: @shopify/flash-list, react-native-config, react-native-device-info
- [x] T010 Configure Biome for linting and formatting in biome.json with strict TypeScript rules
- [x] T011 Create project structure: src/components/{atoms,molecules,organisms,templates}, src/screens, src/services, src/contexts, src/models, src/hooks, src/utils, src/types, src/navigation
- [x] T012 Configure tsconfig.json with strict mode, path aliases (@components, @screens, @services, @contexts, @models, @hooks, @utils, @types)
- [x] T013 [P] Configure Android permissions in android/app/src/main/AndroidManifest.xml (FULL storage access: READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, MANAGE_EXTERNAL_STORAGE, CAMERA, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC)
- [x] T014 [P] Configure iOS permissions in ios/VisaraApp/Info.plist (NSPhotoLibraryUsageDescription, NSCameraUsageDescription, NSPhotoLibraryAddUsageDescription, UIBackgroundModes: fetch+processing)
- [x] T015 Configure Hermes engine in android/gradle.properties and ios/Podfile

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Integration Tests from Acceptance Scenarios

- [ ] T016 [P] Integration test for first-time onboarding flow in __tests__/integration/onboarding.test.tsx
- [ ] T017 [P] Integration test for photo discovery and chronological display in __tests__/integration/photo-discovery.test.tsx
- [ ] T018 [P] Integration test for photo modal viewing with gestures in __tests__/integration/photo-viewer.test.tsx
- [ ] T019 [P] Integration test for grid zoom levels (3/4/11 columns) in __tests__/integration/grid-zoom.test.tsx
- [ ] T020 [P] Integration test for natural language search functionality in __tests__/integration/search.test.tsx
- [ ] T021 [P] Integration test for document filtering in __tests__/integration/document-filter.test.tsx
- [ ] T022 [P] Integration test for smart album creation and management in __tests__/integration/albums.test.tsx
- [ ] T023 [P] Integration test for manual upload (file select + camera) in __tests__/integration/manual-upload.test.tsx
- [ ] T024 [P] Integration test for settings (Battery Saver, Night Processing, Theme) in __tests__/integration/settings.test.tsx
- [ ] T025 [P] Integration test for background AI processing with resume capability in __tests__/integration/background-processing.test.tsx

### Service Contract Tests

- [ ] T026 [P] Contract test for ImageLabelingService.processImage() in __tests__/contracts/image-labeling-service.test.ts
- [ ] T027 [P] Contract test for TextRecognitionService.extractText() in __tests__/contracts/text-recognition-service.test.ts
- [ ] T028 [P] Contract test for MediaFileRepository CRUD operations in __tests__/contracts/media-file-repository.test.ts
- [ ] T029 [P] Contract test for AlbumRepository.getSmartAlbums() in __tests__/contracts/album-repository.test.ts
- [ ] T030 [P] Contract test for SearchService index/search/serialize in __tests__/contracts/search-service.test.ts
- [ ] T031 [P] Contract test for ProcessingService queue management in __tests__/contracts/processing-service.test.ts

## Phase 3.3: Data Layer (ONLY after tests are failing)

### WatermelonDB Setup

- [x] T032 Create WatermelonDB database configuration in src/services/database/database.ts with SQLite adapter and encryption enabled
- [x] T033 Create WatermelonDB schema in src/services/database/schema.ts defining all 7 tables with indexes

### WatermelonDB Models (Parallel - Different Files)

- [x] T034 [P] Create MediaFile model in src/models/MediaFile.ts with fields: id, file_path, file_type, file_name, creation_date, modification_date, file_size, thumbnail_path, processing_status
- [ ] T035 [P] Create ProcessingMetadata model in src/models/ProcessingMetadata.ts with fields: id, media_file_id, processing_timestamp, success_status
- [x] T036 [P] Create Label model in src/models/Label.ts with fields: id, metadata_id, label_text, confidence_score, category, timestamp
- [x] T037 [P] Create OCRText model in src/models/OCRText.ts with fields: id, metadata_id, extracted_text, blocks, confidence_score, timestamp
- [ ] T038 [P] Create Album model in src/models/Album.ts with fields: id, album_name, cover_image_path, creation_type, creation_date, last_modified, item_count
- [ ] T039 [P] Create UserPreference model in src/models/UserPreference.ts with fields: id, grid_zoom_level, theme, default_modal_zoom, battery_saver_enabled, night_processing_enabled, onboarding_completed, encryption_key_ref
- [ ] T040 [P] Create ProcessingQueue model in src/models/ProcessingQueue.ts with fields: id, media_file_id, queue_position, processing_state, checkpoint_data, added_timestamp

### Model Relationships

- [ ] T041 Define MediaFile relationships: hasOne ProcessingMetadata, belongsToMany Albums in src/models/MediaFile.ts
- [ ] T042 Define ProcessingMetadata relationships: belongsTo MediaFile, hasMany Labels, hasMany OCRTexts in src/models/ProcessingMetadata.ts
- [ ] T043 Define Album relationships: belongsToMany MediaFiles with junction table in src/models/Album.ts

### MMKV Setup

- [ ] T044 Create MMKV storage configuration in src/services/storage/mmkv.ts with encryption enabled
- [ ] T045 Create MMKV storage keys constants in src/utils/constants/storage-keys.ts (SEARCH_INDEX, USER_PREFS, PROCESSING_CHECKPOINT)

## Phase 3.4: Core Services

### ML Services (Parallel - Different Files)

- [ ] T046 [P] Implement ImageLabelingService.processImage() in src/services/ml/ImageLabelingService.ts using @react-native-ml-kit/image-labeling
- [ ] T047 [P] Implement TextRecognitionService.extractText() in src/services/ml/TextRecognitionService.ts using @react-native-ml-kit/text-recognition
- [ ] T048 Create ProcessingService with serial processing queue in src/services/ml/ProcessingService.ts (orchestrates ImageLabeling + TextRecognition)

### Database Repositories (Parallel - Different Files)

- [ ] T049 [P] Implement MediaFileRepository CRUD operations in src/services/database/MediaFileRepository.ts with reactive queries
- [ ] T050 [P] Implement ProcessingMetadataRepository CRUD in src/services/database/ProcessingMetadataRepository.ts
- [ ] T051 [P] Implement LabelRepository CRUD in src/services/database/LabelRepository.ts
- [ ] T052 [P] Implement OCRTextRepository CRUD in src/services/database/OCRTextRepository.ts
- [ ] T053 [P] Implement AlbumRepository with smart album logic in src/services/database/AlbumRepository.ts
- [ ] T054 [P] Implement UserPreferenceRepository singleton pattern in src/services/database/UserPreferenceRepository.ts
- [ ] T055 [P] Implement ProcessingQueueRepository CRUD in src/services/database/ProcessingQueueRepository.ts

### Search Service

- [ ] T056 Create SearchService with MiniSearch integration in src/services/search/SearchService.ts implementing index(), search(), serializeIndex()
- [ ] T057 Implement incremental index updates in SearchService with MMKV persistence

### Media Access Service

- [ ] T058 Create MediaDiscoveryService in src/services/media/MediaDiscoveryService.ts with platform-specific implementation (ContentObserver for Android, PHPhotoLibraryChangeObserver for iOS)
- [ ] T059 Implement thumbnail generation service in src/services/media/ThumbnailService.ts with 3-tier caching (memory 50MB, disk 500MB, on-demand)

### Background Processing Service

- [ ] T060 Create BackgroundTaskService in src/services/background/BackgroundTaskService.ts using react-native-background-actions with WorkManager/Background Tasks integration
- [ ] T061 Implement checkpoint/resume capability in BackgroundTaskService with MMKV state persistence
- [ ] T062 Implement battery/thermal monitoring in BackgroundTaskService with pause logic
- [ ] T063 Create NotificationService in src/services/background/NotificationService.ts using Notifee with progress bar and pause/resume controls

### Encryption Service

- [ ] T064 Create EncryptionService in src/services/security/EncryptionService.ts with key generation on first launch and Keychain/Keystore storage

## Phase 3.5: State Management - Contexts

- [ ] T065 [P] Create GalleryContext in src/contexts/GalleryContext.tsx with useReducer managing: mediaFiles, currentZoomLevel, dateFilters, loading state
- [ ] T066 [P] Create ProcessingContext in src/contexts/ProcessingContext.tsx with useReducer managing: processingQueue, currentProgress, isPaused, failedFiles
- [ ] T067 [P] Create SearchContext in src/contexts/SearchContext.tsx with useReducer managing: searchQuery, searchResults, isSearchActive, resultCount
- [ ] T068 [P] Create SettingsContext in src/contexts/SettingsContext.tsx with useReducer managing: theme, batterySaver, nightProcessing, preferences

## Phase 3.6: Atomic Design Components

### Atoms (Parallel - Different Files)

- [ ] T069 [P] Create Button atom in src/components/atoms/Button.tsx with Reanimated press animation
- [ ] T070 [P] Create Thumbnail atom in src/components/atoms/Thumbnail.tsx using FastImage with loading state
- [ ] T071 [P] Create Badge atom in src/components/atoms/Badge.tsx for processing status indicators
- [ ] T072 [P] Create Icon atom in src/components/atoms/Icon.tsx wrapping React Native Paper icons
- [ ] T073 [P] Create Label Tag atom in src/components/atoms/LabelTag.tsx with confidence score display
- [ ] T074 [P] Create Progress Bar atom in src/components/atoms/ProgressBar.tsx with Reanimated width animation

### Molecules (Parallel - Different Files)

- [ ] T075 [P] Create SearchBar molecule in src/components/molecules/SearchBar.tsx with animated transform from nav button
- [ ] T076 [P] Create DateSectionHeader molecule in src/components/molecules/DateSectionHeader.tsx with sticky positioning
- [ ] T077 [P] Create AlbumCard molecule in src/components/molecules/AlbumCard.tsx with cover image and item count
- [ ] T078 [P] Create ProcessingIndicator molecule in src/components/molecules/ProcessingIndicator.tsx with animated circular progress
- [ ] T079 [P] Create BottomNavContainer molecule in src/components/molecules/BottomNavContainer.tsx with 4 buttons and elevation shadow

### Organisms (Parallel - Different Files)

- [ ] T080 [P] Create PhotoGrid organism in src/components/organisms/PhotoGrid.tsx using FlashList with virtualized rendering and pinch-to-zoom gesture
- [ ] T081 [P] Create PhotoViewerModal organism in src/components/organisms/PhotoViewerModal.tsx with swipe navigation, double-tap zoom, pinch zoom (1x-4x)
- [ ] T082 [P] Create InfoDrawer organism in src/components/organisms/InfoDrawer.tsx with 3 snap points (10%, half, full) showing labels, OCR text, actions
- [ ] T083 [P] Create SettingsDrawer organism in src/components/organisms/SettingsDrawer.tsx with Processing/Appearance/Data Management/Legal sections
- [ ] T084 [P] Create UploadDrawer organism in src/components/organisms/UploadDrawer.tsx with file select and camera capture options
- [ ] T085 [P] Create AlbumList organism in src/components/organisms/AlbumList.tsx with drag-to-reorder capability

### Templates (Parallel - Different Files)

- [ ] T086 [P] Create MainTemplate in src/components/templates/MainTemplate.tsx with header, photo grid, bottom nav layout
- [ ] T087 [P] Create OnboardingTemplate in src/components/templates/OnboardingTemplate.tsx with horizontal swipe pager and dots indicator

## Phase 3.7: Screens (Sequential - May Share Navigation Logic)

- [ ] T088 [P] Create OnboardingScreen1 (Welcome) in src/screens/Onboarding/OnboardingScreen1.tsx
- [ ] T089 [P] Create OnboardingScreen2 (AI Capabilities) in src/screens/Onboarding/OnboardingScreen2.tsx
- [ ] T090 [P] Create OnboardingScreen3 (Privacy) in src/screens/Onboarding/OnboardingScreen3.tsx
- [ ] T091 [P] Create OnboardingScreen4 (Permissions) in src/screens/Onboarding/OnboardingScreen4.tsx
- [ ] T092 Create GalleryScreen in src/screens/Gallery/GalleryScreen.tsx consuming GalleryContext and rendering PhotoGrid
- [ ] T093 Create AlbumsScreen in src/screens/Albums/AlbumsScreen.tsx consuming GalleryContext and rendering AlbumList
- [ ] T094 Create SearchScreen in src/screens/Search/SearchScreen.tsx consuming SearchContext
- [ ] T095 Create SettingsScreen in src/screens/Settings/SettingsScreen.tsx consuming SettingsContext and rendering SettingsDrawer

## Phase 3.8: Navigation

- [ ] T096 Create RootNavigator in src/navigation/RootNavigator.tsx with conditional onboarding check
- [ ] T097 Create OnboardingNavigator in src/navigation/OnboardingNavigator.tsx with stack navigator for 4 screens
- [ ] T098 Create MainNavigator in src/navigation/MainNavigator.tsx with bottom tabs (Gallery, Albums, Search, Settings)
- [ ] T099 Create ModalNavigator in src/navigation/ModalNavigator.tsx for PhotoViewerModal with stack presentation
- [ ] T100 Configure platform-specific navigation in src/navigation/navigationConfig.ts (iOS: tab bar, Android: drawer + bottom nav)

## Phase 3.9: Background Processing Integration

- [ ] T101 Create ProcessingOrchestrator in src/services/orchestrator/ProcessingOrchestrator.ts coordinating MediaDiscovery → ProcessingQueue → ML Services → Database
- [ ] T102 Implement ContentObserver listener for Android in android/app/src/main/java/com/visara/MediaObserver.java with bridge to React Native
- [ ] T103 Implement PHPhotoLibraryChangeObserver for iOS in ios/Visara/PhotoLibraryObserver.swift with bridge to React Native
- [ ] T104 Connect ProcessingOrchestrator to ProcessingContext for UI updates
- [ ] T105 Implement automatic cleanup service in src/services/maintenance/CleanupService.ts for temporary files and deleted media thumbnails

## Phase 3.10: Platform Configuration

- [ ] T106 [P] Configure Android build.gradle with NDK filters, ProGuard rules, signing configs
- [ ] T107 [P] Configure iOS Podfile with pod dependencies, post_install hooks for New Architecture
- [ ] T108 [P] Create android/app/proguard-rules.pro with WatermelonDB and ML Kit keep rules
- [ ] T109 [P] Configure Android WorkManager for background processing in android/app/src/main/java/com/visara/BackgroundTaskModule.java
- [ ] T110 [P] Configure iOS Background Modes in ios/Visara/Info.plist (background fetch, background processing)

## Phase 3.11: Performance Optimization

- [ ] T111 Implement memory monitoring service in src/services/performance/MemoryMonitor.ts with throttling at 80% threshold
- [ ] T112 Implement LRU cache for thumbnails in src/services/media/ThumbnailCache.ts with 50MB memory limit
- [ ] T113 Configure FlashList estimatedItemSize and overrideItemLayout in PhotoGrid for optimal rendering
- [ ] T114 Implement prefetching logic for adjacent photos in PhotoViewerModal
- [ ] T115 Add React.memo, useMemo, useCallback optimizations to high-frequency render components

## Phase 3.12: Error Handling & Resilience

- [ ] T116 [P] Create ErrorBoundary component in src/components/ErrorBoundary.tsx with fallback UI and retry logic
- [ ] T117 [P] Create GalleryErrorBoundary in src/screens/Gallery/GalleryErrorBoundary.tsx with skeleton screen fallback
- [ ] T118 [P] Create ProcessingErrorHandler in src/services/error/ProcessingErrorHandler.ts logging failed files without retry
- [ ] T119 Implement graceful degradation for denied permissions in src/utils/permissions.ts with user-facing messages
- [ ] T120 Implement storage check before processing in ProcessingOrchestrator with pause on low storage

## Phase 3.13: Animations & Transitions

- [ ] T121 [P] Create spring animation config in src/utils/animations/springConfig.ts for modal open/close
- [ ] T122 [P] Implement shared element transitions for thumbnail → full image in PhotoViewerModal using Reanimated
- [ ] T123 [P] Implement grid zoom transition animation in PhotoGrid with layout animation
- [ ] T124 [P] Implement drawer slide-in animations for InfoDrawer and SettingsDrawer
- [ ] T125 Implement haptic feedback on button presses using react-native-haptic-feedback

## Phase 3.14: Polish & Final Integration

- [ ] T126 [P] Create loading skeleton screens in src/components/skeletons/ for Gallery, Albums, Settings
- [ ] T127 [P] Implement empty states for: no photos, no search results, no albums in src/components/empty-states/
- [ ] T128 [P] Create confirmation dialogs for Delete All Data and permanent deletion in src/components/dialogs/
- [ ] T129 Add comprehensive TypeScript types in src/types/index.ts ensuring no `any` types
- [ ] T130 Implement app state persistence with MMKV for last zoom level, theme preference
- [ ] T131 Create App.tsx with provider hierarchy: ErrorBoundary → SettingsContext → GalleryContext → ProcessingContext → SearchContext → RootNavigator
- [ ] T132 Verify all animations run at 60fps using Flipper performance monitor
- [ ] T133 Run end-to-end test of complete user journey: onboarding → photo discovery → AI processing → search → album creation

## Phase 3.15: Testing & Validation

### Unit Tests (Parallel - Different Files)

- [ ] T134 [P] Unit tests for SearchService tokenization in __tests__/unit/search-service.test.ts
- [ ] T135 [P] Unit tests for date section logic in __tests__/unit/date-sections.test.ts
- [ ] T136 [P] Unit tests for encryption key generation in __tests__/unit/encryption-service.test.ts
- [ ] T137 [P] Unit tests for thumbnail cache LRU eviction in __tests__/unit/thumbnail-cache.test.ts
- [ ] T138 [P] Unit tests for smart album classification logic in __tests__/unit/smart-albums.test.ts

### Performance Tests

- [ ] T139 Performance test: photo grid scrolling 10,000+ items maintains 60fps in __tests__/performance/grid-scrolling.test.ts
- [ ] T140 Performance test: search query completes <300ms for 10k photos in __tests__/performance/search-speed.test.ts
- [ ] T141 Performance test: app launch reaches interactive state <2s in __tests__/performance/app-launch.test.ts
- [ ] T142 Performance test: memory usage stays <200MB baseline, <500MB during processing in __tests__/performance/memory-usage.test.ts

### Manual Testing Scenarios

- [ ] T143 Manual test: complete onboarding flow on fresh install (iOS + Android)
- [ ] T144 Manual test: process 1000+ photos and verify all labels/OCR extracted correctly
- [ ] T145 Manual test: verify app works fully offline (airplane mode)
- [ ] T146 Manual test: verify Battery Saver pauses processing when unplugged
- [ ] T147 Manual test: verify Night Processing restricts to 00:00-06:00 window
- [ ] T148 Manual test: force quit app during processing and verify resume capability
- [ ] T149 Manual test: verify encryption key stored in Keychain/Keystore (not in user-accessible storage)
- [ ] T150 Manual test: verify Delete All Data removes all metadata and resets permissions

## Dependencies

**Critical Path Dependencies**:
- Setup (T001-T015) before all other phases
- Integration tests (T016-T025) before implementation (T032+)
- Contract tests (T026-T031) before corresponding service implementation
- Data layer (T032-T045) blocks service layer (T046-T064)
- Models (T034-T040) block repositories (T049-T055)
- Contexts (T065-T068) block screens (T088-T095)
- Atomic components: Atoms (T069-T074) → Molecules (T075-T079) → Organisms (T080-T085) → Templates (T086-T087) → Screens (T088-T095)
- Services (T046-T064) block ProcessingOrchestrator (T101)
- All core implementation before polish (T121-T133)
- Platform config (T106-T110) can run in parallel with component development
- Performance optimization (T111-T115) requires core implementation complete
- Testing (T134-T150) is final validation phase

**Blocking Relationships**:
- T032 (DB config) blocks T033 (schema) blocks all models (T034-T040)
- T034-T040 (models) block T041-T043 (relationships)
- T034-T040 (models) block T049-T055 (repositories)
- T046-T047 (ML services) block T048 (ProcessingService)
- T048 (ProcessingService) blocks T060 (BackgroundTaskService)
- T060-T063 (background services) block T101 (ProcessingOrchestrator)
- T065-T068 (contexts) block T092-T095 (screens consuming contexts)
- T069-T074 (atoms) block T075-T079 (molecules using atoms)
- T075-T079 (molecules) block T080-T085 (organisms using molecules)
- T080-T085 (organisms) block T086-T087 (templates using organisms)
- T086-T087 (templates) block T088-T095 (screens using templates)
- T096-T100 (navigation) requires T088-T095 (all screens created)
- T131 (App.tsx) requires all contexts (T065-T068) and navigation (T096-T100)

## Parallel Execution Examples

### Phase 3.1 - Setup Dependencies
```bash
# Launch T003-T009 together (all npm install tasks):
npm install react-native-paper react-native-gesture-handler@2.20.2 react-native-reanimated@3.16.5 react-native-safe-area-context
npm install @react-navigation/native@7 @react-navigation/stack @react-navigation/bottom-tabs react-native-screens
npm install @nozbe/watermelondb @nozbe/simdjson react-native-mmkv minisearch
npm install @react-native-ml-kit/image-labeling @react-native-ml-kit/text-recognition
npm install @react-native-camera-roll/camera-roll react-native-vision-camera react-native-fast-image
npm install react-native-background-actions notifee
npm install @shopify/flash-list react-native-config react-native-device-info
```

### Phase 3.2 - Integration Tests (all parallel)
```bash
# Launch T016-T025 together:
Task: "Integration test for first-time onboarding flow in __tests__/integration/onboarding.test.tsx"
Task: "Integration test for photo discovery and chronological display in __tests__/integration/photo-discovery.test.tsx"
Task: "Integration test for photo modal viewing with gestures in __tests__/integration/photo-viewer.test.tsx"
Task: "Integration test for grid zoom levels (3/4/11 columns) in __tests__/integration/grid-zoom.test.tsx"
Task: "Integration test for natural language search functionality in __tests__/integration/search.test.tsx"
Task: "Integration test for document filtering in __tests__/integration/document-filter.test.tsx"
Task: "Integration test for smart album creation and management in __tests__/integration/albums.test.tsx"
Task: "Integration test for manual upload (file select + camera) in __tests__/integration/manual-upload.test.tsx"
Task: "Integration test for settings (Battery Saver, Night Processing, Theme) in __tests__/integration/settings.test.tsx"
Task: "Integration test for background AI processing with resume capability in __tests__/integration/background-processing.test.tsx"
```

### Phase 3.2 - Contract Tests (all parallel)
```bash
# Launch T026-T031 together:
Task: "Contract test for ImageLabelingService.processImage() in __tests__/contracts/image-labeling-service.test.ts"
Task: "Contract test for TextRecognitionService.extractText() in __tests__/contracts/text-recognition-service.test.ts"
Task: "Contract test for MediaFileRepository CRUD operations in __tests__/contracts/media-file-repository.test.ts"
Task: "Contract test for AlbumRepository.getSmartAlbums() in __tests__/contracts/album-repository.test.ts"
Task: "Contract test for SearchService index/search/serialize in __tests__/contracts/search-service.test.ts"
Task: "Contract test for ProcessingService queue management in __tests__/contracts/processing-service.test.ts"
```

### Phase 3.3 - WatermelonDB Models (all parallel)
```bash
# Launch T034-T040 together:
Task: "Create MediaFile model in src/models/MediaFile.ts"
Task: "Create ProcessingMetadata model in src/models/ProcessingMetadata.ts"
Task: "Create Label model in src/models/Label.ts"
Task: "Create OCRText model in src/models/OCRText.ts"
Task: "Create Album model in src/models/Album.ts"
Task: "Create UserPreference model in src/models/UserPreference.ts"
Task: "Create ProcessingQueue model in src/models/ProcessingQueue.ts"
```

### Phase 3.4 - Database Repositories (all parallel)
```bash
# Launch T049-T055 together:
Task: "Implement MediaFileRepository CRUD operations in src/services/database/MediaFileRepository.ts"
Task: "Implement ProcessingMetadataRepository CRUD in src/services/database/ProcessingMetadataRepository.ts"
Task: "Implement LabelRepository CRUD in src/services/database/LabelRepository.ts"
Task: "Implement OCRTextRepository CRUD in src/services/database/OCRTextRepository.ts"
Task: "Implement AlbumRepository with smart album logic in src/services/database/AlbumRepository.ts"
Task: "Implement UserPreferenceRepository singleton pattern in src/services/database/UserPreferenceRepository.ts"
Task: "Implement ProcessingQueueRepository CRUD in src/services/database/ProcessingQueueRepository.ts"
```

### Phase 3.5 - Contexts (all parallel)
```bash
# Launch T065-T068 together:
Task: "Create GalleryContext in src/contexts/GalleryContext.tsx"
Task: "Create ProcessingContext in src/contexts/ProcessingContext.tsx"
Task: "Create SearchContext in src/contexts/SearchContext.tsx"
Task: "Create SettingsContext in src/contexts/SettingsContext.tsx"
```

### Phase 3.6 - Atoms (all parallel)
```bash
# Launch T069-T074 together:
Task: "Create Button atom in src/components/atoms/Button.tsx"
Task: "Create Thumbnail atom in src/components/atoms/Thumbnail.tsx"
Task: "Create Badge atom in src/components/atoms/Badge.tsx"
Task: "Create Icon atom in src/components/atoms/Icon.tsx"
Task: "Create Label Tag atom in src/components/atoms/LabelTag.tsx"
Task: "Create Progress Bar atom in src/components/atoms/ProgressBar.tsx"
```

### Phase 3.6 - Molecules (all parallel)
```bash
# Launch T075-T079 together:
Task: "Create SearchBar molecule in src/components/molecules/SearchBar.tsx"
Task: "Create DateSectionHeader molecule in src/components/molecules/DateSectionHeader.tsx"
Task: "Create AlbumCard molecule in src/components/molecules/AlbumCard.tsx"
Task: "Create ProcessingIndicator molecule in src/components/molecules/ProcessingIndicator.tsx"
Task: "Create BottomNavContainer molecule in src/components/molecules/BottomNavContainer.tsx"
```

### Phase 3.6 - Organisms (all parallel)
```bash
# Launch T080-T085 together:
Task: "Create PhotoGrid organism in src/components/organisms/PhotoGrid.tsx"
Task: "Create PhotoViewerModal organism in src/components/organisms/PhotoViewerModal.tsx"
Task: "Create InfoDrawer organism in src/components/organisms/InfoDrawer.tsx"
Task: "Create SettingsDrawer organism in src/components/organisms/SettingsDrawer.tsx"
Task: "Create UploadDrawer organism in src/components/organisms/UploadDrawer.tsx"
Task: "Create AlbumList organism in src/components/organisms/AlbumList.tsx"
```

### Phase 3.15 - Unit Tests (all parallel)
```bash
# Launch T134-T138 together:
Task: "Unit tests for SearchService tokenization in __tests__/unit/search-service.test.ts"
Task: "Unit tests for date section logic in __tests__/unit/date-sections.test.ts"
Task: "Unit tests for encryption key generation in __tests__/unit/encryption-service.test.ts"
Task: "Unit tests for thumbnail cache LRU eviction in __tests__/unit/thumbnail-cache.test.ts"
Task: "Unit tests for smart album classification logic in __tests__/unit/smart-albums.test.ts"
```

## Notes

- **[P] tasks** = different files, no dependencies, can run in parallel
- **Verify tests fail** before implementing corresponding functionality (TDD)
- **Commit after each task** for granular version history
- **Constitutional compliance**: All tasks align with privacy-first, performance, UX, and code quality principles
- **No cloud services**: All AI processing on-device using Google ML Kit
- **Serial processing**: Process 1 file at a time to prevent memory overflow
- **Encryption**: Generate key on first launch, store in Keychain/Keystore
- **No retry logic**: Failed files get badge, no automatic retry
- **Performance targets**: 60fps animations, <300ms search, <2s launch, <200MB baseline memory

## Validation Checklist

- [x] All integration test scenarios from spec.md have corresponding test tasks (T016-T025)
- [x] All service contracts from plan.md have contract test tasks (T026-T031)
- [x] All 7 entities from data model have model creation tasks (T034-T040)
- [x] All tests come before implementation (Phase 3.2 before Phase 3.3+)
- [x] Parallel tasks are truly independent (different files, marked [P])
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Dependencies correctly mapped in Dependencies section
- [x] Atomic design hierarchy respected (atoms → molecules → organisms → templates → screens)
- [x] Constitutional requirements verified (privacy, performance, UX, code quality)
- [x] Platform-specific tasks identified (Android/iOS native code)

---

**Total Tasks**: 150
**Estimated Duration**: 8-10 weeks (with parallel execution)
**Next Step**: Execute Phase 3.1 (Setup) tasks T001-T015
