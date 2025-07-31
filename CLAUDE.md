# Visara - Document Intelligence App

## Project Overview
Visara is a React Native mobile application that uses on-device AI to automatically identify documents in users' photo galleries, extract metadata, and provide intelligent search capabilities through a conversational interface.

## Core Concept
- **Purpose**: Enhance document management without replacing the native gallery
- **Key Feature**: AI-powered document recognition and metadata extraction
- **User Interface**: Minimal chat-based interface for querying documents
- **Privacy First**: All processing happens on-device using local LLMs

## Architecture & Tech Stack

### Core Framework
- **React Native** (bare workflow - v0.74.5)
- **TypeScript** for type safety
- **React Navigation** for navigation
- **Biome** for linting 

### UI Libraries
- **React Native Vector Icons** - For icon components
- **React Native Reanimated 3** - For smooth animations
- **React Native Gesture Handler** - For gesture interactions
- **React Native Safe Area Context** - For safe area handling

### AI & ML
- **ONNX Runtime React Native** - For running lightweight models on device
- **TensorFlow Lite React Native** - Alternative for model inference
- **Transformers.js** - For running smaller transformer models in React Native

### Storage & State
- **Zustand** - Lightweight state management
- **WatermelonDB** - Fast, reactive database for metadata storage
- **React Native Keychain** - For sensitive data storage
- **React Query (TanStack Query)** - For data fetching and caching
- **AsyncStorage** - For persistent key-value storage

### Media & Permissions
- **@react-native-camera-roll/camera-roll** - Gallery access
- **React Native Image Picker** - Image selection
- **React Native Image Crop Picker** - Advanced image selection and cropping
- **React Native FS** - File system operations
- **@bam.tech/react-native-image-resizer** - Image resizing

## Project Structure
```
visara/
├── app/                      # Screen components
│   ├── (tabs)/              # Tab navigation screens
│   │   ├── index.tsx        # Chat interface
│   │   ├── documents.tsx    # Document grid view
│   │   └── settings.tsx     # App settings
│   ├── _layout.tsx          # Root layout
│   └── document/[id].tsx    # Document detail view
├── components/              
│   ├── chat/               # Chat UI components
│   ├── document/           # Document-related components
│   └── ui/                 # Reusable UI components
├── services/               
│   ├── ai/                 # AI model services
│   ├── gallery/            # Gallery scanning services
│   └── database/           # Database operations
├── stores/                 # Zustand stores
├── hooks/                  # Custom React hooks
├── utils/                  # Utility functions
└── constants/              # App constants
```

## UI Design System

### Color Palette
```typescript
const colors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  primary: '#000000',
  secondary: '#666666',
  accent: '#0066FF',
  error: '#FF3B30',
  success: '#34C759',
  border: '#E5E5E7',
  chat: {
    user: '#007AFF',
    ai: '#F2F2F7'
  }
}
```

### Typography
- **Font**: System fonts (SF Pro on iOS, Roboto on Android)
- **Sizes**: 12, 14, 16, 20, 24, 32
- **Weights**: 400 (regular), 500 (medium), 600 (semibold)

### Layout Principles
1. **Minimal Chrome**: Hide UI elements when not needed
2. **Content First**: Maximize content visibility
3. **Gesture-Driven**: Swipe gestures for navigation
4. **Adaptive**: Respond to device size and orientation

## Feature Implementation

### 1. Gallery Scanning
```typescript
// Background task to scan gallery
- Use React Native background services for processing
- Utilize @react-native-camera-roll/camera-roll for gallery access
- Scan in batches to avoid memory issues
- Skip already processed images (check hash)
- Queue new images for AI processing
```

### 2. Document Detection AI
```typescript
// On-device model pipeline
- Use MobileNet or EfficientNet for initial classification
- Fine-tuned model to detect document types:
  - Receipts
  - Invoices
  - IDs
  - Letters
  - Forms
  - Screenshots with text
- Confidence threshold: 0.8
```

### 3. Metadata Extraction
```typescript
// OCR and information extraction
- Use @react-native-ml-kit/text-recognition for on-device OCR
- Extract key fields:
  - Date
  - Amount (for receipts/invoices)
  - Names/Organizations
  - Document type
  - Key terms
- Store in structured format in WatermelonDB
```

### 4. Chat Interface
```typescript
// Conversational search
- Natural language query processing
- Vector similarity search on metadata
- Return relevant documents with confidence scores
- Display image thumbnails in chat
- Quick actions (share, delete, edit metadata)
```

### 5. Privacy & Security
- All processing on-device
- No cloud uploads
- Optional encryption for sensitive documents
- Biometric lock for app access

## Development Guidelines

### Code Style
```typescript
// Use functional components with TypeScript
interface DocumentCardProps {
  document: Document;
  onPress: (id: string) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({ 
  document, 
  onPress 
}) => {
  // Component logic
};
```

### State Management Pattern
```typescript
// Zustand store example
interface DocumentStore {
  documents: Document[];
  isScanning: boolean;
  addDocument: (doc: Document) => void;
  startScanning: () => void;
}
```

### Error Handling
- Use error boundaries for component crashes
- Graceful degradation for AI features
- User-friendly error messages
- Offline-first approach

### Performance Optimization
- Lazy load heavy components
- Use React.memo for list items
- Virtualized lists for large datasets
- Image caching and optimization
- Debounce search queries

## Testing Strategy
- **Unit Tests**: Jest + React Native Testing Library
- **Integration Tests**: Detox for E2E testing
- **AI Model Tests**: Validate accuracy on test dataset
- **Performance Tests**: Monitor memory and CPU usage

## Build & Deployment
- **Development**: `npx react-native start`
- **iOS Build**: `npx react-native run-ios` (development) / Xcode Archive (production)
- **Android Build**: `npx react-native run-android` (development) / `./gradlew assembleRelease` (production)
- **Metro Bundler**: `npx react-native start --reset-cache` (clear cache)

## Security Considerations
- Implement certificate pinning
- Obfuscate AI models
- Secure storage for sensitive metadata
- Regular security audits
- GDPR compliance for data handling

## Accessibility
- VoiceOver/TalkBack support
- Dynamic text sizing
- High contrast mode
- Haptic feedback
- Screen reader descriptions for images

## Future Enhancements
1. Multi-language OCR support
2. Cloud backup option (encrypted)
3. Document sharing features
4. Advanced filters and sorting
5. Export to PDF/CSV
6. Integration with cloud storage services

## Commands for Claude Code
When implementing features:
1. Always check existing code patterns first
2. Follow the established architecture
3. Write TypeScript with proper types
4. Include error handling
5. Add appropriate comments for complex logic
6. Test on both iOS and Android
7. Optimize for performance
8. Ensure accessibility compliance