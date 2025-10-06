# Implementation Plan: Visara - Intelligent Photo Gallery

**Branch**: `001-build-visara-an` | **Date**: 2025-10-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-build-visara-an/spec.md`

## Summary

Visara is a privacy-first, AI-powered photo gallery application for iOS and Android that enables intelligent search and organization of device photos through on-device machine learning. The app automatically discovers and processes photos using Google ML Kit for object detection and OCR, stores metadata in encrypted local storage, and provides natural language search capabilities—all without transmitting user data externally.

**Technical Approach**: React Native 0.81.4 with New Architecture (Fabric/TurboModules) for native performance, WatermelonDB for reactive data persistence, MMKV for fast key-value storage, MiniSearch for client-side full-text search, and @shopify/flash-list for virtualized rendering of 10,000+ photos.

## Technical Context

**Language/Version**: TypeScript 5.0+ (strict mode), React Native 0.81.4, React 19.1.0
**Primary Dependencies**:
- UI: React Native Paper, React Native Gesture Handler 2.20.2, React Native Reanimated 3.16.5, React Native Safe Area Context
- Navigation: React Navigation v7, React Native Screens
- Data: WatermelonDB (SQLite), MMKV, MiniSearch
- ML: @react-native-ml-kit/image-labeling, @react-native-ml-kit/text-recognition
- Media: @react-native-camera-roll/camera-roll, React Native Vision Camera, React Native Fast Image
- Background: React-Native-Background-Actions, Notifee

**Storage**: WatermelonDB with SQLite adapter (encrypted), MMKV for search indices/preferences
**Target Platform**: iOS 13.0+, Android API 23+ (6.0+)
**Project Type**: Mobile (iOS + Android)
**Performance Goals**: 60fps animations, <300ms search, <2s app launch, handle 10,000+ photos
**Constraints**: On-device processing only, <200MB baseline memory, <500MB during processing, offline-first
**Scale/Scope**: Single-user device app, 10,000+ photos, 8 core screens, 2 smart albums minimum

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Privacy & Security First (NON-NEGOTIABLE)
- ✅ All AI processing on-device using Google ML Kit
- ✅ No cloud uploads or external data transmission
- ✅ Encrypted local storage (Keychain/Keystore for keys, AES-256 for metadata)
- ✅ No telemetry or analytics
- ✅ Clear permission explanations

### Performance & Optimization Standards (NON-NEGOTIABLE)
- ✅ React Native 0.81.4 with New Architecture enabled
- ✅ FlashList for virtualized rendering
- ✅ Serial processing (1 file at a time) with memory monitoring
- ✅ 60fps animations target
- ✅ 3-tier caching (memory 50MB / disk 500MB / on-demand)
- ✅ <16ms frame budget for thumbnails

### User Experience Excellence
- ✅ Native gestures (pinch/swipe/drag) with Reanimated
- ✅ Progressive disclosure in onboarding
- ✅ <100ms visual feedback
- ✅ Offline-first architecture
- ✅ Intelligent defaults (date organization, auto-albums)

### Code Quality & Architecture (NON-NEGOTIABLE)
- ✅ Strict TypeScript, no `any` types
- ✅ Atomic design (atoms → molecules → organisms → templates → screens)
- ✅ Error boundaries with fallback UI
- ✅ Unidirectional data flow (Context API + useReducer)
- ✅ Feature-based folder structure

### AI Processing Guidelines
- ✅ Google ML Kit Vision APIs only
- ✅ Progress indicators for all operations
- ✅ No automatic retry (failed files get badge)
- ✅ Resume capability with checkpoints

### Data Management Principles
- ✅ WatermelonDB for reactive storage
- ✅ MMKV for ultra-fast caching
- ✅ Automatic temp file cleanup
- ✅ MiniSearch indexing (tokenized, prefix matching)
- ✅ Data export capability
- ✅ Clear deletion flows

### Development Workflow Standards
- ✅ Mobile-first approach
- ✅ Feature flags (react-native-config)
- ✅ Semantic versioning
- ✅ Biome for linting/formatting

### Platform-Specific Optimizations
- ✅ Platform-specific navigation (tab bar iOS, drawer Android)
- ✅ Native modules for performance-critical features
- ✅ Platform-appropriate permission handling

**Status**: ✅ PASS - All constitutional requirements satisfied

## Project Structure

### Documentation (this feature)
```
specs/001-build-visara-an/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
visara-v2/
├── android/                    # Android-specific native code
│   ├── app/
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       └── java/com/visara/
├── ios/                        # iOS-specific native code
│   ├── Visara/
│   │   ├── Info.plist
│   │   └── AppDelegate.swift
│   └── Podfile
├── src/
│   ├── components/            # Reusable UI components (atomic design)
│   │   ├── atoms/            # Basic building blocks
│   │   ├── molecules/        # Simple component combinations
│   │   ├── organisms/        # Complex UI sections
│   │   └── templates/        # Page layouts
│   ├── screens/              # Page components
│   │   ├── Onboarding/
│   │   ├── Gallery/
│   │   ├── PhotoViewer/
│   │   ├── Albums/
│   │   ├── Search/
│   │   └── Settings/
│   ├── services/             # Business logic
│   │   ├── ml/              # ML processing
│   │   ├── database/        # WatermelonDB setup
│   │   ├── search/          # MiniSearch integration
│   │   ├── media/           # Gallery access
│   │   └── background/      # Background tasks
│   ├── hooks/                # Custom React hooks
│   ├── contexts/             # State management
│   │   ├── GalleryContext.tsx
│   │   ├── ProcessingContext.tsx
│   │   ├── SearchContext.tsx
│   │   └── SettingsContext.tsx
│   ├── models/               # WatermelonDB models
│   ├── utils/                # Helpers and constants
│   ├── types/                # TypeScript definitions
│   ├── navigation/           # React Navigation setup
│   └── App.tsx
├── .specify/                 # Specify framework
├── package.json
└── tsconfig.json
```

**Structure Decision**: Mobile application structure with separate iOS/Android native directories and shared React Native codebase in `src/`. Atomic design pattern for components, feature-based organization for services.

## Phase 0: Outline & Research

### Unknowns from Technical Context
All critical technical decisions have been specified in user arguments. No NEEDS CLARIFICATION markers remain.

### Research Tasks Completed

**Decision**: React Native 0.81.4 with New Architecture
**Rationale**: Version 0.81 is stable with New Architecture support (Fabric renderer, TurboModules, JSI). User-specified version aligns with constitutional requirement for native performance.

**Decision**: Google ML Kit for on-device ML
**Rationale**: Provides Image Labeling and Text Recognition without cloud dependencies. Constitutional requirement and user specification align.
**Alternatives considered**: TensorFlow Lite (more complex), Core ML/ML Kit native (platform-specific duplication)

**Decision**: WatermelonDB for data persistence
**Rationale**: Reactive SQLite database optimized for React Native, handles large datasets efficiently. Constitutional requirement.
**Alternatives considered**: Realm (licensing concerns), raw SQLite (no reactivity)

**Decision**: @shopify/flash-list for virtualization
**Rationale**: Handles 10,000+ items with superior performance over FlatList. User and constitution both specify.
**Alternatives considered**: FlatList (poor performance at scale), RecyclerListView (less maintained)

**Decision**: MMKV for key-value storage
**Rationale**: <1ms read times, perfect for search indices and app state. Constitutional requirement.
**Alternatives considered**: AsyncStorage (too slow), SecureStore (limited capacity)

**Decision**: MiniSearch for client-side search
**Rationale**: JavaScript-based full-text search with serializable indices, offline-capable. Constitutional requirement.
**Alternatives considered**: Lunr.js (larger bundle), custom solution (reinventing wheel)

**Decision**: Notifee for notifications
**Rationale**: Rich notification support with progress tracking. Constitutional requirement and user specification.
**Alternatives considered**: React Native Push Notification (less feature-rich)

**Decision**: Serial processing (1 file at a time)
**Rationale**: Clarification from spec session - prevents memory overflow, simplifies state management.
**Alternatives considered**: Parallel processing (rejected due to memory constraints)

**Output**: research.md with all decisions documented

## Phase 1: Design & Contracts

### Data Model (data-model.md)

Extracted from spec entities with WatermelonDB schema design:

**MediaFile** (Table: media_files)
- id: string (primary key)
- file_path: string (indexed)
- file_type: enum ('photo' | 'pdf')
- file_name: string
- creation_date: number (timestamp, indexed)
- modification_date: number (timestamp)
- file_size: number
- thumbnail_path: string
- processing_status: enum ('pending' | 'processing' | 'completed' | 'failed')
- Relationships: has_one ProcessingMetadata, belongs_to_many Albums

**ProcessingMetadata** (Table: processing_metadata)
- id: string (primary key)
- media_file_id: string (foreign key, indexed)
- processing_timestamp: number
- success_status: boolean
- Relationships: belongs_to MediaFile, has_many Labels

**Label** (Table: labels)
- id: string (primary key)
- metadata_id: string (foreign key, indexed)
- label_text: string (indexed for search)
- confidence_score: number (0.1-1.0)
- category: string
- timestamp: number
- Relationships: belongs_to ProcessingMetadata

**OCRText** (Table: ocr_texts)
- id: string (primary key)
- metadata_id: string (foreign key, indexed)
- extracted_text: string (full-text indexed for search)
- blocks: nested object (save for future uses)
- confidence_score: number
- timestamp: number
- Relationships: belongs_to ProcessingMetadata

**Album** (Table: albums)
- id: string (primary key)
- album_name: string
- cover_image_path: string
- creation_type: enum ('smart' | 'manual')
- creation_date: number (timestamp)
- last_modified: number (timestamp)
- item_count: number
- Relationships: belongs_to_many MediaFiles

**UserPreference** (Table: user_preferences - singleton)
- id: string (primary key)
- grid_zoom_level: enum (3 | 4 | 11)
- theme: enum ('dark' | 'light' | 'system')
- default_modal_zoom: number
- battery_saver_enabled: boolean
- night_processing_enabled: boolean
- onboarding_completed: boolean
- encryption_key_ref: string

**ProcessingQueue** (Table: processing_queue)
- id: string (primary key)
- media_file_id: string (foreign key, indexed)
- queue_position: number (indexed)
- processing_state: enum ('pending' | 'in_progress' | 'completed' | 'failed')
- checkpoint_data: string (JSON)
- added_timestamp: number
- Relationships: belongs_to MediaFile

**SearchIndexEntry** (Stored in MMKV, not WatermelonDB)
- Serialized MiniSearch index
- Updated incrementally
- Tokenized fields: labels, OCR text, file names

### API Contracts (contracts/)

Since this is a mobile-only application with no backend API, contracts define:

1. **Service Contracts** (contracts/ml-service.md)
   - ImageLabelingService.processImage(uri): Promise<Label[]>
   - TextRecognitionService.extractText(uri): Promise<OCRText>

2. **Database Contracts** (contracts/database-service.md)
   - MediaFileRepository.create(data): Promise<MediaFile>
   - MediaFileRepository.getByDate(date): Observable<MediaFile[]>
   - AlbumRepository.getSmartAlbums(): Observable<Album[]>

3. **Search Contracts** (contracts/search-service.md)
   - SearchService.indexMedia(media): Promise<void>
   - SearchService.search(query): Promise<MediaFile[]>
   - SearchService.serializeIndex(): string

4. **Background Processing Contracts** (contracts/processing-service.md)
   - ProcessingService.enqueue(mediaFile): Promise<void>
   - ProcessingService.processNext(): Promise<ProcessingResult>
   - ProcessingService.pause(): void
   - ProcessingService.resume(): void

### Agent-Specific Context File

Update `.specify/memory/CLAUDE.md` incrementally (O(1) operation):
```markdown
# Visara Technical Context (for Claude Code)

## Current Stack
- React Native 0.81.4 (New Architecture)
- TypeScript 5.0 (strict)
- WatermelonDB + MMKV
- Google ML Kit Vision
- @shopify/flash-list
- React Navigation v7

## Recent Changes
- 2025-10-05: Initial architecture design
- Serial processing model (1 file at a time)
- Encryption key in Keychain/Keystore
- No automatic retry for failed files

## Key Decisions
- All AI processing on-device
- Show all labels regardless of confidence (0.1-1.0)
- Display duplicates separately
- English-only UI (v1)

## Performance Targets
- 60fps animations
- <300ms search (10k photos)
- <2s app launch
- <200MB baseline memory
```

**Output**: data-model.md, contracts/, quickstart.md, CLAUDE.md

## Phase 1: Post-Design Constitution Re-Check

Reviewing design against constitution:

- ✅ Privacy: WatermelonDB encrypted, MMKV for non-sensitive data, Keychain for keys
- ✅ Performance: Serial processing prevents memory overflow, 3-tier caching implemented
- ✅ UX: All gestures mapped to Reanimated, progressive disclosure in design
- ✅ Code Quality: TypeScript strict, atomic design in component structure
- ✅ AI: Google ML Kit only, progress in ProcessingContext
- ✅ Data: WatermelonDB + MMKV + MiniSearch as specified
- ✅ Workflow: Mobile-first, feature flags planned
- ✅ Platform: Platform-specific configs in navigation

**Status**: ✅ PASS - No new violations introduced

## Phase 2: Task Planning Approach

**Task Generation Strategy**:
Will load `.specify/templates/tasks-template.md` and generate tasks from:
1. **Setup Tasks**: React Native init, dependency installation, configure New Architecture, setup WatermelonDB/MMKV, configure ML Kit
2. **Data Layer**: Create WatermelonDB models, implement repositories, setup MMKV, create MiniSearch service
3. **ML Services**: Implement ImageLabelingService, implement TextRecognitionService, create ProcessingService with queue
4. **Context Providers**: GalleryContext, ProcessingContext, SearchContext, SettingsContext
5. **Atomic Components**: Atoms (buttons, inputs, thumbnails), molecules (search bar, nav container), organisms (photo grid, modal viewer, info drawer)
6. **Screens**: Onboarding (4 screens), Gallery, PhotoViewer, Albums, Search, Settings
7. **Navigation**: Setup React Navigation, configure stack/tab navigators
8. **Background Processing**: Implement background task service, notification system, resume capability
9. **Platform Config**: Android permissions/gradle, iOS permissions/pods, signing configs
10. **Performance Optimization**: Implement caching strategy, memory monitoring, batch processing
11. **Polish**: Error boundaries, loading states, animations

**Ordering Strategy**:
- Dependencies: Data models → Services → Contexts → Components → Screens
- Mark [P] for parallel: Independent models, independent services, independent screens

**Estimated Output**: 80-100 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Complexity Tracking

*No constitutional violations requiring justification*

## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (via /clarify session)
- [x] Complexity deviations documented (none)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
