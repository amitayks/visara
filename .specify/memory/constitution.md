<!--
Sync Impact Report

Version change: N/A → 1.0.0
Modified principles: N/A (initial adoption)
Added sections:
- Privacy & Security First
- Performance & Optimization Standards
- User Experience Excellence
- Code Quality & Architecture
- Testing Requirements
- AI Processing Guidelines
- Accessibility Standards
- Data Management Principles
- Development Workflow Standards
- Platform-Specific Optimizations
- Quality Gates & Metrics
- Technology Baseline
Removed sections: None
Templates requiring updates:
- .specify/templates/plan-template.md → ✅ updated (footer references Constitution v1.0.0 at .specify/memory/constitution.md)
- .specify/templates/spec-template.md → ✅ aligned (no constitution version reference)
- .specify/templates/tasks-template.md → ✅ aligned (no constitution version reference)
- .specify/templates/commands/*.md → ⚠ pending (directory not present; nothing to update)
Follow-up TODOs:
- None
-->

# Visara Constitution

## Core Principles

### Privacy & Security First
- All AI processing MUST occur on-device. No cloud uploads or external data transmission of user media or derived sensitive data.
- User media files MUST never leave the device unless the user explicitly initiates a share/export action.
- All processed metadata MUST be stored securely using encrypted local databases.
- No telemetry or analytics that could compromise user privacy. Anonymized, aggregate metrics MAY be added only via explicit opt-in.
- Permission requests MUST be clear and transparent, with precise justifications and usage scopes.
Rationale: Visara demonstrates that privacy-first, AI-powered apps can deliver excellent UX without compromising user trust or data safety.

### Performance & Optimization Standards
- Target React Native New Architecture (0.76.1) with fabric/turbo modules for native performance.
- Use virtualized lists to handle thousands of images with zero jank; scrolling MUST sustain 60fps.
- Background processing MUST be non-blocking and respect device resources (idle scheduling, OS constraints).
- Memory usage MUST be managed via batching and cleanup to prevent overflow and OOM crashes.
- The app MUST remain responsive during AI processing (no main-thread blocking >16ms).
- Implement thumbnail caching and lazy loading for instant UI responsiveness.
Rationale: Smooth performance is foundational for media-heavy apps and reduces user friction at scale.

### User Experience Excellence
- Gesture-based interactions MUST feel native and responsive, with 60fps animations.
- Use progressive disclosure to introduce advanced features without overwhelming new users.
- Provide seamless transitions between view modes and states with consistent navigation.
- Give immediate visual feedback for all user interactions and long-running operations.
- Offline-first: full core functionality MUST work without internet connectivity.
- Ship intelligent defaults that work well without configuration; preferences remain optional.
Rationale: A delightful, predictable UX increases adoption and reduces support burden.

### Code Quality & Architecture
- Use strict TypeScript across the entire codebase for type safety and maintainability.
- Apply Atomic Design principles for components; keep small, testable units.
- Wrap critical trees with error boundaries and show graceful fallback UI on failures.
- Enforce unidirectional data flow and clear separation of concerns.
- Prefer modular architecture to enable incremental feature addition and independent iteration.
- Maintain comprehensive documentation for AI pipelines, models, and data flows.
Rationale: Intentional architecture reduces regressions and accelerates feature delivery.

### Testing Requirements
- Maintain ≥80% code coverage on critical paths; coverage gates enforced in CI.
- Unit tests MUST exist for all utilities and data transformations.
- Integration tests MUST cover AI processing pipelines and data persistence.
- E2E tests MUST validate core user journeys using Detox on real/simulated devices.
- Include performance benchmarks for list rendering and search operations.
- Test device compatibility across target Android/iOS versions and hardware tiers.
Rationale: A robust test suite enables safe refactoring and reliable releases.

### AI Processing Guidelines
- Use Google ML Kit for consistent, on-device AI processing.
- Display clear visual indicators for processing status and progress.
- Support resume for interrupted processing (app restarts, backgrounding, power events).
- Maintain incremental index updates to keep search results fresh without full reprocessing.
Rationale: Deterministic, resumable processing preserves UX quality and device health.

### Accessibility Standards
- Comply with WCAG 2.1 AA for all UI elements.
- Ensure full screen reader compatibility and appropriate accessibility labels.
- Maintain sufficient color contrast in light and dark themes.
- Touch targets MUST be ≥44x44 points.
- Provide alternative text for all images and icons.
- Support keyboard navigation where applicable (TV/desktop contexts).
Rationale: Accessibility is a first-class quality attribute and expands user reach.

### Data Management Principles
- Use WatermelonDB for reactive, performant local storage.
- Use MMKV for ultra-fast key–value caching of non-sensitive data; encrypt when sensitive.
- Automatically clean up temporary files and intermediate artifacts.
- Build efficient search indexing with MiniSearch for low-latency queries.
- Provide user-controlled data export with clear scope and formats.
- Implement clear, irreversible data deletion with confirmations and undo where safe.
Rationale: Thoughtful data handling balances performance, privacy, and user control.

### Development Workflow Standards
- Practice mobile-first development with device-centric testing.
- Use feature flags for progressive rollout and safe experimentation.
- Follow Semantic Versioning for releases; maintain a comprehensive changelog.
- Require code reviews for all changes; enforce status checks in CI.
- Run continuous integration with automated tests on every PR and main.
Rationale: Guardrails ensure predictable, auditable delivery.

### Platform-Specific Optimizations
- Leverage platform capabilities (e.g., PhotoKit, MediaStore) when beneficial.
- Ensure consistent UX across platforms while respecting platform conventions.
- Integrate native modules for performance-critical paths where necessary.
- Use platform-appropriate navigation patterns (e.g., iOS tab bars, Android navigation).
- Utilize device hardware optimally (GPU, Neural Engine, DSP) for on-device AI.
Rationale: Native affordances deliver superior performance and familiarity.

## Quality Gates & Metrics
- Animations and scrolling sustain 60fps; no main-thread blocks >16ms.
- Virtualized rendering of large galleries (10k+ images) without frame drops.
- Critical-path test coverage ≥80%; CI enforces thresholds.
- Offline-first: core features function without network; no unexpected network calls.
- Privacy: no telemetry or external transmission without explicit opt-in and local disclosure.
- Accessibility: automated checks and manual audits meet WCAG 2.1 AA.

## Technology Baseline
- Framework: React Native New Architecture 0.76.1 (Fabric/TurboModules).
- On-device AI: Google ML Kit.
- Storage: WatermelonDB (encrypted where applicable), MMKV (with encryption for sensitive keys).
- Search Index: MiniSearch.
- Testing: Jest/RTL (unit), integration tests, Detox (E2E), performance benchmarks.
- Languages: TypeScript (strict mode enforced).

## Governance
- Scope & Supremacy: This constitution supersedes other practice docs where conflicting.
- Amendment Procedure: Propose an RFC in `docs/rfcs/` describing changes, rationale, and migration plan. Team consensus required to merge.
- Versioning Policy: MAJOR for breaking governance changes; MINOR for new principles/sections; PATCH for clarifications.
- Compliance Reviews: Every PR MUST include a “Constitution Check” in the description. CI gates verify privacy, tests, and coverage. Violations require explicit justification and an approved RFC or a temporary exemption with a tracking issue.
- Audits: At least once per minor release, perform a privacy/security audit and an accessibility/performance review.

**Version**: 1.0.0 | **Ratified**: 2025-10-02 | **Last Amended**: 2025-10-02