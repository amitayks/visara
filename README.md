# Visara - AI Document Scanner

A React Native app that automatically finds and organizes documents in your photo gallery using on-device AI.

## Features

### 🔍 Smart Document Detection
- Automatically scans your photo gallery for documents
- Identifies receipts, invoices, IDs, forms, and letters
- Uses ML Kit for accurate OCR text extraction
- Processes everything locally on your device

### 💬 Natural Language Search
- Chat interface to find documents instantly
- Search by date: "receipts from last week"
- Search by amount: "invoices over $100"
- Search by vendor: "documents from Amazon"
- Full Hebrew support: "קבלות מהחודש האחרון"

### 📱 Key Capabilities
- Background gallery scanning
- Document metadata extraction (dates, amounts, vendors)
- Thumbnail generation for quick previews
- Permanent storage for processed documents
- RTL support for Hebrew text

## Quick Start

### Prerequisites
- Node.js 18+
- Android Studio / Xcode
- Expo CLI (`npm install -g expo-cli`)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/visara.git
cd visara

# Install dependencies
npm install --legacy-peer-deps

# Start the development server
npx expo start
```

### Running the App
```bash
# Android
npx expo run:android # better option

# iOS
npx expo run:ios

# Development with Expo Go
npx expo start
```

## Testing & Saving Documents

### Method 1: OCR Test Screen
1. Tap the scan icon (top right)
2. Choose "Pick from Gallery" or "Take Photo"
3. Review OCR results
4. Tap "Save to Documents"

### Method 2: Search & Discover
1. Use the chat interface
2. Type queries like "show all receipts"
3. Discovered documents are already saved

## Production Build

### Using EAS Build (Recommended)
```bash
# Install EAS CLI
npm install -g eas-cli

# Configure your project
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

### Local Build
```bash
# Android APK
npx expo build:android -t apk

# iOS
npx expo build:ios
```

## App Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Startup   │────▶│ Permissions  │────▶│ Chat Screen  │
└─────────────┘     └──────────────┘     └──────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌──────────────┐
                    │Gallery Access│     │Natural Lang. │
                    └──────────────┘     │   Search     │
                           │             └──────────────┘
                           ▼                      │
                    ┌──────────────┐              ▼
                    │ Background   │     ┌──────────────┐
                    │   Scanner    │────▶│  Document    │
                    └──────────────┘     │   Results    │
                           │             └──────────────┘
                           ▼                      │
                    ┌──────────────┐              ▼
                    │ML Processing │     ┌──────────────┐
                    │OCR + Metadata│     │Document View │
                    └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Database    │
                    │  Storage     │
                    └──────────────┘
```

## Tech Stack
- React Native + Expo
- TypeScript
- WatermelonDB (local storage)
- ML Kit (OCR)
- Zustand (state management)
- Date-fns (date parsing)

## License
MIT

*the app ui still not perfect (for week long project :). 

future task are 
- ejecting from expo 
- upgrade ai kit for OCR
- upgrade chat search
- refactor the code base for better performance and clean code view
- doc backround scaning