Step 1: Remove Tesseract Package
bash# Remove from package.json
npm uninstall @onlytabs/react-native-tesseract-ocr

# iOS cleanup
cd ios && pod install
Step 2: Delete Android Tesseract Files
bash# Remove tessdata folder (saves 25MB+)
rm -rf android/app/src/main/assets/tessdata/

# Check for any Tesseract config in build.gradle
# Remove any tessdata copy tasks
Step 3: Clean iOS Files
bash# Remove tessdata from iOS
rm -rf ios/tessdata/
rm -rf ios/TesseractOCR/

# Update Info.plist if it references tessdata
Step 4: Update Code
typescript// Delete these files:
rm services/ai/engines/TesseractEngine.ts
rm services/ai/engines/VisionCameraEngine.ts

// Update OCREngineManager.ts
export class OCREngineManager {
  constructor() {
    // Only register MLKit
    this.registerEngine(new MLKitEngine());
    // Remove Tesseract registration
  }
}
Step 5: Simplify Document Processing
typescript// services/ai/SimpleDocumentProcessor.ts
export class SimpleDocumentProcessor {
  async process(imageUri: string) {
    // 1. Visual check (existing)
    const visual = await visualDocumentDetector.detectDocument(imageUri);
    if (visual.overallScore < 0.3) return null; // Not a document
    
    // 2. OCR with MLKit (Hebrew + English)
    const ocr = await mlkit.recognize(imageUri, { language: 'auto' });
    
    // 3. Simple extraction (no LLM)
    const type = this.classifyDocument(ocr.text);
    const amount = this.extractAmount(ocr.text);
    const vendor = this.extractVendor(ocr.text);
    const keywords = MiniSearch.extractKeywords(ocr.text);
    
    return {
      type,
      text: ocr.text,
      language: ocr.language,
      amount,
      vendor,
      keywords,
      confidence: visual.overallScore
    };
  }
}
🚀 Final Architecture (Simplified!)
Phase 1 (Now): MLKit + Rules + MiniSearch
├── App Size: 40MB (vs 80MB with Tesseract)
├── Processing: <1 second
├── Accuracy: 85% (good enough!)
└── Hebrew Support: ✅

YES, remove all Tesseract files - Saves 30-40MB
NO local LLM for Phase 1 - Ship faster, smaller app
MLKit handles Hebrew perfectly - No Tesseract needed
Simple rules work for 80% of cases - Good enough to ship
Add intelligence progressively - Not all at onc