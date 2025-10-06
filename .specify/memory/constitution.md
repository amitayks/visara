<!--
Sync Impact Report:
- Version change: [initial] → 1.0.0
- New constitution created with 8 core principles
- Added sections: Development Workflow Standards, Platform-Specific Optimizations, Governance
- Templates requiring updates:
  ✅ plan-template.md - reviewed, constitution check section compatible
  ✅ spec-template.md - reviewed, requirement sections align
  ✅ tasks-template.md - reviewed, task categorization compatible
- Follow-up TODOs: None - all placeholders filled
-->

# Visara Constitution

## Core Principles

### I. Privacy & Security First (NON-NEGOTIABLE)

All AI processing MUST occur on-device without any cloud uploads or external data transmission. User media files must never leave the device unless explicitly shared by the user through standard OS sharing mechanisms. Processed metadata MUST be stored in encrypted local databases using platform-appropriate encryption (Keychain/Keystore for sensitive data, encrypted SQLite for bulk data). No telemetry, analytics, crash reporting, or any form of data collection that transmits user information is permitted. Permission requests MUST include detailed, plain-language explanations of why each permission is needed and what specific functionality it enables.

**Rationale**: User trust is foundational. Photo libraries contain intimate personal moments. Any privacy compromise destroys the product's value proposition. On-device processing demonstrates that powerful AI features don't require privacy sacrifices.

### II. Performance & Optimization Standards (NON-NEGOTIABLE)

Leverage React Native New Architecture (Fabric renderer, TurboModules, JSI) on version 0.81.4 for native performance. Implement virtualized lists (FlashList/RecyclerListView) capable of smoothly handling 10,000+ images without performance degradation. Background processing MUST be non-blocking using WorkManager (Android) and Background Tasks (iOS), respecting device battery and thermal states. Memory management MUST prevent overflow, Process 1 file at a time (serial processing), aggressive cleanup of unused bitmaps, and LRU caching strategies. App MUST maintain 60fps animations during all user interactions, with AI processing occurring in background threads. Thumbnail generation and caching (3-tier: memory/disk/on-demand) MUST provide instant UI responsiveness (<16ms frame budget).

**Rationale**: Performance determines whether users tolerate the app or abandon it. Gallery apps with lag or stuttering fail regardless of features. Native architecture ensures we compete with system gallery apps.

### III. User Experience Excellence

All gesture-based interactions (pinch-zoom, swipe-to-delete, drag-to-select) MUST feel native with physics-based animations at 60fps using Reanimated. Implement progressive disclosure: show core features immediately, reveal advanced capabilities contextually. Seamless transitions between grid/list/map views using shared element transitions. Provide immediate visual feedback (<100ms) for all user interactions through haptics, micro-animations, or visual state changes. Offline-first architecture ensures full functionality without internet—all features work without network connectivity. Intelligent defaults (auto-organize by date, smart album creation, face grouping enabled) MUST work for 90% of users without configuration.

**Rationale**: Great UX isn't cosmetic—it's the primary feature. Users judge apps in milliseconds. Respecting platform conventions while adding delightful moments creates memorable experiences.

### IV. Code Quality & Architecture (NON-NEGOTIABLE)

Strict TypeScript usage across the entire codebase with no `any` types except in explicitly justified interop layers. Apply atomic design principles: atoms (buttons, icons) → molecules (search bar) → organisms (photo grid) → templates → screens. Comprehensive error boundaries at feature boundaries with graceful fallback UI (skeleton screens, retry mechanisms, degraded modes). Implement unidirectional data flow (actions → reducers → selectors → UI) with clear separation of concerns between presentation and business logic. Modular architecture using feature-based folder structure enables adding new capabilities (e.g., video support, cloud backup) without architectural refactoring. Extensive code documentation MUST explain AI processing pipelines, performance trade-offs, and non-obvious algorithmic choices.

**Rationale**: Complexity grows exponentially without discipline. TypeScript catches errors at compile time. Clean architecture enables long-term velocity. Documentation ensures knowledge transfer.

### V. AI Processing Guidelines

Use Google ML Kit Vision APIs (Image Labeling, Face Detection, Text Recognition, Object Detection) for consistent on-device processing across platforms. Provide clear visual indicators (progress bars, processing counts, estimated time remaining) for all AI operations. Offer configurable processing quality/speed trade-offs (fast/balanced/accurate modes) with clear explanations of differences. Implement resume capability for interrupted processing—track processed items, resume from last checkpoint on app restart. Use incremental index updates with MiniSearch: process new photos immediately, rebuild full index only when necessary, maintain search responsiveness during indexing.

**Rationale**: AI processing is resource-intensive. Users need visibility and control. Graceful handling of interruptions prevents frustration with long-running operations.

### VI. Data Management Principles

Use WatermelonDB with SQLite adapter for reactive, performant data storage with automatic UI updates on data changes. Use MMKV for ultra-fast key-value caching of app state, user preferences, and frequently accessed metadata (<1ms read times). Implement automatic cleanup of temporary files (processing artifacts, thumbnails for deleted photos) using scheduled background tasks. Build efficient search indexing with MiniSearch: tokenized fields (labels, detected text, faces), prefix matching, fuzzy search support. Provide data export capabilities (JSON export, CSV reports) giving users control over their processed metadata. Clear data deletion flows with confirmation dialogs, explaining what will be permanently removed vs. what can be recovered.

**Rationale**: Data layer performance determines app responsiveness. WatermelonDB's reactive queries eliminate manual refresh logic. MMKV provides instant app startup. User data control builds trust.

### VII. Development Workflow Standards

Mobile-first development approach: build for iOS/Android first, web/desktop if needed later. Feature flags (using react-native-config or custom solution) enable progressive rollout and A/B testing without new releases. Semantic versioning (MAJOR.MINOR.PATCH) with clear changelog: breaking changes, new features, bug fixes. Comprehensive changelog maintenance in CHANGELOG.md following Keep a Changelog format. Code reviews required for all changes with minimum one approver, focused on architecture alignment, performance implications, and constitutional compliance.

**Rationale**: Systematic workflow prevents chaos at scale. Feature flags reduce risk. Code review distributes knowledge and maintains quality.

### VIII. Platform-Specific Optimizations

Leverage platform-specific capabilities when they provide significant value: iOS Live Text integration, Android Material You theming, platform-specific sharing capabilities. Maintain consistent UX across platforms while respecting platform conventions (iOS: tab bar navigation, Android: drawer + bottom nav; iOS: swipe-to-go-back, Android: system back gesture). Use native modules (Swift/Kotlin with JSI bindings) for performance-critical features: thumbnail generation, image processing, file system operations. Implement platform-appropriate navigation patterns using React Navigation with platform-specific configs. Optimal use of device hardware: GPU acceleration for image rendering, dedicated image processing cores when available, efficient battery management respecting platform guidelines.

**Rationale**: Platform differences aren't obstacles—they're opportunities. Users expect platform-native behavior. Performance-critical paths benefit from native code.

## Technical Stack Requirements

**Mandatory Technologies**:
- React Native 0.81.4+ (New Architecture enabled)
- TypeScript 5.0+ (strict mode)
- WatermelonDB (data persistence)
- MMKV (key-value storage)
- Google ML Kit Vision (AI processing)
- MiniSearch (search indexing)
- Reanimated 3+ (animations)
- FlashList (virtualized lists)
- notifee (notification)

**Prohibited**:
- Any cloud-based AI services or APIs
- Analytics SDKs that transmit user data
- Third-party crash reporting with automatic uploads
- Non-encrypted storage for user metadata

## Security Requirements

**Data Protection**:
- All processed metadata encrypted at rest using AES-256
- Face embeddings stored with reversibility protections
- Keychain/Keystore for encryption keys
- Secure deletion (overwrite) for sensitive data
- No logging of user data in production builds

**Permission Handling**:
- Explain each permission with specific use case
- Graceful degradation when permissions denied

## Performance Standards

**Response Time Requirements**:
- UI interactions: <100ms feedback
- Search queries: <300ms for 10k+ photos
- Thumbnail loading: <16ms per frame
- Screen transitions: <300ms complete animation
- App launch: <2s to interactive state

**Resource Constraints**:
- Memory budget: <200MB baseline, <500MB during processing
- Storage overhead: <10% of original media size for metadata/thumbnails
- CPU thermal management: reduce processing speed at 80% thermal state

## Governance

### Amendment Procedure

Constitutional amendments require:
1. Documented rationale explaining why current principles insufficient
2. Impact assessment on existing codebase and architecture
3. Migration plan if changes affect existing features
4. Team consensus (all active contributors must approve)
5. Version increment following semantic versioning rules

### Versioning Policy

- **MAJOR**: Backward-incompatible principle changes (removing privacy guarantees, allowing cloud processing)
- **MINOR**: New principle additions, substantial expansions (new performance requirements, additional security measures)
- **PATCH**: Clarifications, wording improvements, correcting ambiguities

### Compliance Review

All code changes MUST verify constitutional compliance:
- PRs include constitutional checklist confirming relevant principles followed
- Architecture decisions documented with principle references
- Performance benchmarks validated against standards
- Security reviews for data-handling code
- Quarterly constitution audits to identify drift

Complexity that violates principles MUST be justified with:
- Specific problem being solved
- Why simpler constitutional approach insufficient
- Mitigations to minimize principle violations
- Timeline for bringing code into compliance

**Version**: 1.0.0 | **Ratified**: 2025-10-05 | **Last Amended**: 2025-10-05
