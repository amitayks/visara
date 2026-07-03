# Visara

**Privacy-first, AI-powered photo gallery for iOS and Android.**

Visara automatically discovers photos and documents on your device, processes them using on-device AI to extract searchable labels and text, and provides natural language search and smart album organization. All processing happens locally — no data ever leaves your device.

## Features

- **On-Device AI Labeling** — Google ML Kit detects objects, scenes, and concepts in your photos with confidence scoring
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
| UI Components | React Native Paper (Material Design) |
| Animations | React Native Reanimated 4 (react-native-worklets) |
| Gestures | React Native Gesture Handler |
| Virtualized Lists | Shopify FlashList |
| Images | expo-image |
| Database | WatermelonDB (SQLCipher encrypted) |
| Fast Storage | React Native MMKV |
| Search | MiniSearch (fuzzy full-text) |
| ML - Labeling | Google ML Kit Image Labeling |
| ML - OCR | Google ML Kit Text Recognition |
| Media Access | Camera Roll |
| Camera | Vision Camera |
| Background Tasks | React Native Background Actions |
| Notifications | Notifee |
| Encryption | React Native Quick Crypto + Keychain |
| Linting/Formatting | Biome |
| Testing | Jest + Testing Library |

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                     Screens                            │
│   Onboarding  |  Main (Gallery)  |  Albums  | Settings │
├────────────────────────────────────────────────────────┤
│                   Navigation                           │
│   HorizontalPageContainer + AnimatedBottomNav          │
│   (custom swipe-based page system)                     │
├────────────────────────────────────────────────────────┤
│             Components (Atomic Design)                 │
│   Templates  ->  Organisms  ->  Molecules  ->  Atoms   │
├────────────────────────────────────────────────────────┤
│            State Management (Contexts)                 │
│  Gallery | Navigation | Processing | Search | Settings │
├────────────────────────────────────────────────────────┤
│                 Service Layer                          │
│  ML Services     | Search   | Background  | Security   │
│  (Label + OCR)   | (Mini   | (Tasks +    | (Encrypt   │
│                  | Search) | Notifs)     | + Keychain) │
├────────────────────────────────────────────────────────┤
│                  Data Layer                            │
│  WatermelonDB (SQLCipher)  |  MMKV (fast KV store)    │
│  Repositories: Media, Label, OCR, Album, Queue, etc.  │
├────────────────────────────────────────────────────────┤
│                 Native Layer                           │
│  Camera Roll | ML Kit | Filesystem | Crypto | Notifee  │
└────────────────────────────────────────────────────────┘
```

**Key patterns:**
- **Atomic Design** for component hierarchy (atoms, molecules, organisms, templates, screens)
- **Repository Pattern** for database access abstraction
- **Context + useReducer** for unidirectional state management
- **Service Layer** with static class services for ML, search, background processing, and encryption

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
├── App.tsx                        # Root component with provider hierarchy
├── assets/                        # Static assets (logos)
├── components/
│   ├── atoms/                     # Button, Thumbnail, Badge, Icon, LabelTag, ProgressBar
│   ├── molecules/                 # AnimatedBottomNav, AlbumCard, SearchBar, DateSectionHeader
│   ├── organisms/                 # PhotoGrid, PhotoViewerModal, InfoDrawer, AlbumList, SettingsDrawer
│   └── templates/                 # MainTemplate, OnboardingTemplate
├── contexts/                      # React Context state management
│   ├── GalleryContext.tsx         # Photo data, selection, grid state
│   ├── NavigationContext.tsx       # Page state, search mode, drawers
│   ├── ProcessingContext.tsx       # AI processing pipeline state
│   ├── SearchContext.tsx           # Search queries and results
│   └── SettingsContext.tsx         # User preferences and theme
├── models/                        # WatermelonDB models
│   ├── MediaFile.ts               # Photos and documents
│   ├── Label.ts                   # AI-generated labels
│   ├── OcrText.ts                 # Extracted text
│   ├── Album.ts                   # Albums (manual and smart)
│   ├── AlbumMedia.ts              # Album-media junction
│   ├── ProcessingQueue.ts         # Processing pipeline queue
│   └── AppSettings.ts             # Key-value settings
├── native-modules/
│   └── NativeMediaObserver.ts     # TurboModule spec for native media watching
├── navigation/
│   ├── RootNavigator.tsx          # Top-level navigation (onboarding vs main)
│   ├── MainNavigator.tsx          # Custom swipeable page navigation
│   ├── OnboardingNavigator.tsx    # First-launch flow
│   └── ModalNavigator.tsx         # Full-screen modals
├── screens/
│   ├── Main/MainScreen.tsx        # Photo gallery grid
│   ├── Albums/AlbumsScreen.tsx    # Album management
│   ├── Settings/SettingsScreen.tsx # App settings
│   └── Onboarding/               # First-launch onboarding
├── services/
│   ├── background/                # BackgroundTaskService, NotificationService
│   ├── database/                  # Database init, schema, 6 repository classes
│   ├── media/                     # MediaDiscoveryService, ThumbnailService
│   ├── ml/                        # ImageLabelingService, TextRecognitionService, ProcessingService
│   ├── search/                    # SearchService (MiniSearch integration)
│   ├── security/                  # EncryptionService (AES-256)
│   └── storage/                   # MMKV key-value store setup
├── shared-types/                  # Shared TypeScript types
├── theme/                         # Color system and useTheme hook
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
