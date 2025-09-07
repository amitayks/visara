# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Visara is a React Native mobile application for document management and OCR (Optical Character Recognition). The app scans images from the device gallery, extracts text using multiple OCR engines, and provides intelligent search and categorization of documents.

## Key Technologies

- **React Native 0.74.5** with TypeScript
- **WatermelonDB** (@nozbe/watermelondb) - Local database for document storage
- **Zustand** - State management
- **React Navigation** - Navigation system
- **Multiple OCR Engines**: MLKit, Tesseract, VisionCamera
- **TanStack React Query** - Data fetching and caching
- **React Native Reanimated** - Animations
- **Biome** - Linting and formatting

## Development Commands

```bash
# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Build APK (Android)
npm run build-apk

# Type checking
npm run typecheck

# Linting and formatting
npm run lint
npm run check
npm run format

# Clean cache
npm run clean
```

## Project Architecture

### Core Structure
- `app/` - Screen components and UI (React Navigation)
  - `index.tsx` - Home screen with document grid and scanning
  - `settings.tsx` - Settings screen
  - `_layout.tsx` - Root navigation layout
  - `components/` - Reusable UI components
- `services/` - Business logic and external integrations
- `stores/` - Zustand state management stores
- `utils/` - Utility functions
- `types/` - TypeScript type definitions
- `contexts/` - React contexts (theme)
- `constants/` - Application constants

### Key Services

#### Database (`services/database/`)
- Uses WatermelonDB for local SQLite storage
- `models/Document.ts` - Main document model with OCR text, metadata, keywords
- `index.ts` - Database initialization and connection
- `schema.ts` and `migrations.ts` - Database structure

#### AI/OCR (`services/ai/`)
- `OCREngineManager.ts` - Manages multiple OCR engines (MLKit, Tesseract, VisionCamera)
- `documentProcessor.ts` - Processes documents and extracts metadata
- `keywordExtractor.ts` - Extracts keywords for search
- `visualDocumentDetector.ts` - Detects document types from images

#### Gallery (`services/gallery/`)
- `GalleryScanner.ts` - Scans device gallery for document images
- Background scanning with progress tracking
- Permission handling

#### Other Services
- `services/search/` - Document search functionality
- `services/cache/` - Caching mechanisms
- `services/memory/` - Memory management
- `services/permissions/` - Permission handling

### State Management (`stores/`)
- `documentStore.ts` - Document CRUD operations and real-time updates
- `settingsStore.ts` - App settings and user preferences
- `searchStore.ts` - Search state and results
- `scannerStore.ts` - Gallery scanning state

### Path Aliases (configured in tsconfig.json)
- `@/*` - Root directory
- `@services/*` - Services directory
- `@stores/*` - Stores directory
- `@utils/*` - Utils directory
- `@constants/*` - Constants directory
- `@types/*` - Types directory

## Code Style and Configuration

- **Biome** is used for linting and formatting
- **Tab indentation** (configured in biome.json)
- **Double quotes** for JavaScript/TypeScript
- **Strict TypeScript** configuration
- Decorators enabled for WatermelonDB models

## Key Features

1. **Document Scanning**: Automatically scans device gallery for document images
2. **OCR Processing**: Multiple OCR engines with confidence-based selection
3. **Smart Search**: Keyword-based search with semantic capabilities
4. **Document Classification**: Automatic document type detection
5. **Memory Management**: Intelligent memory handling for OCR engines
6. **Background Processing**: Batch processing with progress tracking
7. **Theme Support**: Dark/light theme switching

## Development Notes

- The app uses React Native's new architecture with Fabric enabled
- WatermelonDB requires specific decorator configuration in babel.config.js
- OCR engines are managed with memory optimization (Tesseract reinitialization)
- Gallery scanning uses background tasks and permission handling
- State management follows reactive patterns with Zustand and WatermelonDB observables