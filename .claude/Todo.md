# first task 
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

