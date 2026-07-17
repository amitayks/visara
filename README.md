# Visara

**Privacy-first, AI-powered photo gallery for iOS and Android.**

Visara automatically discovers photos and documents on your device, processes them using on-device AI to extract searchable labels and text, and provides natural language search and smart album organization. All processing happens locally — no data ever leaves your device.

## Features

- **On-Device AI Analysis** — an optional Gemma multimodal model (ExecuTorch runtime) captions and labels photos entirely on-device, with device-capability and thermal gating
- **On-Device OCR** — Extracts readable text from images (receipts, screenshots, documents, handwritten notes)
- **Natural Language Search** — Full-text fuzzy search across filenames, AI labels, and OCR text
- **Smart Albums** — Auto-generated albums based on AI label patterns (Receipts, Screenshots, Documents, ID Cards, Handwritten Notes)
- **Custom Albums** — Create, reorder, and manage your own albums with drag-and-drop
- **Photo Viewer** — Swipe navigation, pinch-to-zoom (1x-4x), double-tap zoom, info drawer with AI labels and OCR text
- **Background Processing** — Processes photos in the background with pause/resume and checkpoint recovery
- **Encrypted Database** — WatermelonDB with SQLCipher encryption; keys stored in iOS Keychain / Android Keystore
- **Battery Aware** — Battery saver mode and night processing mode (00:00-06:00)
- **Adaptive Grid** — Three zoom levels (3, 4, or 11 columns) with pinch gesture
- **Zero Cloud Uploads** — Fully offline, privacy-respecting architecture

## Tech Stack

| Category | Technology |
|---|---|
| Framework | React Native 0.86 (New Architecture, Hermes V1) |
| Language | TypeScript 5.9 (strict mode) |
| UI Components | Visara DS (owned design system on RN primitives) |
| Styling/Theming | react-native-unistyles 3 (C++ Fabric, zero-re-render themes) |
| State | Zustand 5 (domain stores) + WatermelonDB observables |
| Navigation | React Navigation 7 (static API, native-stack) + pager-view shell |
| Sheets/Toasts | TrueSheet (native) / sonner-native |
| Animations | React Native Reanimated 4 (react-native-worklets) |
| Gestures | React Native Gesture Handler |
| Virtualized Lists | Shopify FlashList |
| Images | expo-image |
| Database | WatermelonDB (SQLCipher encrypted) |
| Fast Storage | React Native MMKV |
| Search | MiniSearch (fuzzy full-text) |
| ML - Analysis | Gemma multimodal via react-native-executorch |
| ML - OCR | Apple Vision (iOS) / engine OCR pipeline |
| ML - Search | Semantic embeddings + hybrid (lexical/vector) search |
| Media Access | Camera Roll |
| Background Tasks | React Native Background Actions |
| Notifications | Notifee |
| Encryption | React Native Quick Crypto + Keychain |
| Linting/Formatting | Biome |
| Testing | Jest + Testing Library |

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                     Features                           │
│  Onboarding | Gallery | Viewer | Albums | Settings     │
│  (src/features/*, each owns its screens + logic)       │
├────────────────────────────────────────────────────────┤
│                  App Shell (src/app)                   │
│  RNav7 static native-stack: Onboarding gate → Shell    │
│  Shell = PagerShell (Gallery ↔ Albums, edge gestures)  │
│         + morphing BottomBar; PhotoViewer modal;       │
│         Settings push; headless bootstrap (services)   │
├────────────────────────────────────────────────────────┤
│              Design System (src/ui)                    │
│  Unistyles tokens/themes + ~18 owned primitives        │
├────────────────────────────────────────────────────────┤
│            State (src/state, Zustand 5)                │
│  settings | nav | selection | search | processing |    │
│  model | viewer  — DB entity data stays in Watermelon  │
│  observables at screen level (throttled), never in     │
│  global stores; hot progress via Reanimated SharedValue│
├────────────────────────────────────────────────────────┤
│                 Service Layer                          │
│  Orchestrator (discover→queue→ML tiers→index) | Search │
│  (hybrid lexical+vector) | Background gating | Model   │
│  delivery | facade.ts (searchMedia/removeMedia/index)  │
├────────────────────────────────────────────────────────┤
│                  Data Layer                            │
│  WatermelonDB  |  MMKV (single-owner typed keys)       │
│  Repositories: Media, Label, OCR, Album, Queue, etc.   │
├────────────────────────────────────────────────────────┤
│                 Native Layer                           │
│ MediaObserver/Thermal/VisionOCR TurboModules |         │
│ ExecuTorch | Camera Roll | Filesystem | Crypto         │
└────────────────────────────────────────────────────────┘
```

**Key patterns:**
- **Owned design system** (`src/ui`): tokens + primitives on Unistyles — theme flips never re-render the media grid
- **Domain stores** (`src/state`, Zustand): entity arrays never live in global stores; screens subscribe to WatermelonDB observables with trailing throttle
- **Headless bootstrap** (`src/app/bootstrap.ts`): the single seam wiring orchestrator events, observer batches, and settings gating into stores — orchestrator never imports React
- **Services facade** (`src/services/facade.ts`): batched search hydration, full-cleanup deletion, idempotent index lifecycle
- **Repository Pattern** for database access abstraction

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- React Native development environment:
  - **iOS**: macOS with Xcode and CocoaPods
  - **Android**: Android Studio with JDK 17, Android SDK (API 23+)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd visara

# Install dependencies
npm install

# iOS only: install CocoaPods
cd ios && pod install && cd ..
```

### Running the App

```bash
# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Project Structure

```
src/
├── app/                           # App shell
│   ├── App.tsx                    # Root component (minimal providers)
│   ├── navigation.tsx             # RNav7 static native-stack tree + navigationRef
│   ├── bootstrap.ts               # Headless services wiring (start/stop)
│   ├── gestureMath.ts             # Pure edge-swipe validity math (tested)
│   └── shell/                     # ShellScreen, PagerShell, BottomBar, back handler
├── ui/
│   ├── theme/                     # Unistyles config, tokens (colors/spacing/type/motion)
│   └── components/                # Visara DS primitives (Text, Button, Sheet, Dialog, …)
├── state/                         # Zustand stores: settings, nav, selection, search,
│   │                              #   processing (+SharedValue mirror), model, viewer
│   └── useVisibleMedia.ts         # Throttled screen-level WatermelonDB subscription
├── features/
│   ├── gallery/                   # GalleryPage: sectioned grid, zoom, selection, empty states
│   ├── viewer/                    # PhotoViewerScreen + InfoSheet + openPhotoViewer
│   ├── albums/                    # Smart + custom albums, reorder, AlbumDetail
│   ├── search/                    # searchController (debounce + stale guard)
│   ├── settings/                  # SettingsScreen + AI model section + data actions
│   ├── onboarding/                # Steps: welcome/privacy/permissions/model/complete
│   └── dev/                       # __DEV__-only ExecuTorch POC surfaces
├── assets/                        # Static assets (logos)
├── models/                        # WatermelonDB models (MediaFile, Label, OcrText, Album, …)
├── native-modules/                # TurboModule specs (MediaObserver, Thermal, VisionOCR)
├── services/
│   ├── facade.ts                  # UI-facing surface: searchMedia, removeMedia, ensureSearchIndex
│   ├── background/                # BackgroundTaskService (drain gating), NotificationService
│   ├── database/                  # Database init, schema, repository classes
│   ├── media/                     # MediaDiscoveryService, MediaPermissions, ThumbnailService
│   ├── ml/ · model/ · orchestrator/ · search/ · security/ · device/
│   └── storage/                   # MMKV singleton (single-owner typed keys)
├── shared-types/                  # Shared TypeScript types
└── utils/                         # Constants, device utilities, photo actions
```

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start the Metro bundler |
| `npm run ios` | Build and run on iOS simulator |
| `npm run android` | Build and run on Android emulator/device |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run tests with Jest |
| `npm run lint` | Check code with Biome |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Biome |
| `npm run aab` | Build Android App Bundle (release) |
| `npm run bump` | Bump app version |

## Permissions

The app requests the following permissions at runtime:

### Android

| Permission | Purpose |
|---|---|
| `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` | Access photos and videos (Android 13+) |
| `READ_EXTERNAL_STORAGE` | Access media files (Android 12 and below) |
| `MANAGE_EXTERNAL_STORAGE` | Discover PDF documents on the filesystem |
| `CAMERA` | Take new photos |
| `POST_NOTIFICATIONS` | Show processing progress notifications |
| `FOREGROUND_SERVICE` | Continue AI processing in the background |

### iOS

| Permission | Purpose |
|---|---|
| Photo Library | Access and discover photos |
| Camera | Take new photos |
| Background Modes | Continue processing when app is backgrounded |

## Platform Support

| Platform | Minimum Version |
|---|---|
| iOS | 13.0+ |
| Android | API 23 (Android 6.0+) |

## Development Status

Visara is in active development (v3.0.0). Core features are implemented:

- Photo discovery and gallery display
- AI labeling and OCR processing pipeline
- Full-text search with fuzzy matching
- Smart and custom albums
- Photo viewer with gestures
- Encrypted database
- Background processing with notifications
- Settings and theme support
- Custom swipe-based navigation

## Author

**Amitay Keisar**
