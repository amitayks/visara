# first task 

1: Set Up the OCR Service
Create a React Native service for document detection and OCR in the Visara app. 

Requirements:
1. Create a new service file: services/ai/documentProcessor.ts
2. Implement a DocumentProcessor class that:
   - Uses @react-native-ml-kit/text-recognition for OCR (better for mobile than Tesseract)
   - Includes image preprocessing using expo-image-manipulator (resize, enhance contrast)
   - Extracts structured data from receipts/invoices using regex patterns
   - Returns metadata: document type, date, amounts, vendor name, items with prices
3. Add TypeScript interfaces:
   - DocumentResult: { id, imageUri, ocrText, metadata, documentType, confidence, processedAt }
   - ExtractedMetadata: { vendor?, amounts?, items?, dates?, location?, confidence }
4. Include methods:
   - processImage(imageUri: string): Promise<DocumentResult>
   - extractReceiptMetadata(text: string): ExtractedMetadata
   - extractInvoiceMetadata(text: string): ExtractedMetadata
5. Handle errors gracefully with try-catch and return partial results
6. Add a batch processing method for gallery scanning
7. Include confidence scoring based on extracted fields

Make sure to follow the project's TypeScript conventions and integrate with the existing architecture.

# seconed task
2: Integrate Document Detection
Add document detection to the DocumentProcessor service:

1. Implement a lightweight on-device classifier using TensorFlow.js or ONNX Runtime React Native
2. Create a method to classify images as: receipt, invoice, document, or non-document
3. Use a pre-trained mobile model (like MobileNet) fine-tuned for document classification
4. Add confidence thresholds (>0.8 for processing)
5. Skip non-document images during gallery scanning
6. Add performance monitoring to track processing speed

# third task
3: Create Background Scanner
Implement the background gallery scanner for Visara:

1. Create services/gallery/backgroundScanner.ts
2. Use expo-media-library to access photos
3. Implement batch processing (10 images at a time)
4. Check image hash to skip already processed images
5. Queue new images for AI processing
6. Use expo-task-manager for background execution
7. Add progress tracking and pause/resume functionality
8. Store scan history in WatermelonDB
9. Respect device memory limits

# four task
4: Metadata Extraction Logic
Enhance the DocumentProcessor with advanced metadata extraction:

1. For receipts: extract store name, date, total amount, items with prices
2. For invoices: extract invoice number, due date, vendor, amount
3. Use regex patterns for common formats (dates, amounts, phone numbers)
4. Implement fuzzy matching for vendor names
5. Add a confidence score for each extracted field
6. Support multiple date formats and currencies
7. Create a method to update/correct extracted data manually

# fifth task
5: Create the Chat Interface
Implement the chat interface for document search in Visara:

1. Create components/chat/DocumentChat.tsx
2. Use natural language processing to parse queries like "show receipts from last week"
3. Implement vector similarity search on metadata
4. Display image thumbnails in chat bubbles
5. Add quick actions: share, delete, edit metadata
6. Use Tamagui components for minimal UI as specified
7. Add swipe gestures for navigation
8. Implement "typing" animation while searching