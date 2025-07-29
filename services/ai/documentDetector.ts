import RNFS from 'react-native-fs';
import { Image } from 'react-native';

export interface DocumentDetectionResult {
  isDocument: boolean;
  confidence: number;
  type: 'receipt' | 'invoice' | 'id' | 'letter' | 'form' | 'screenshot' | 'unknown';
  metadata?: {
    hasText: boolean;
    textDensity: number;
    aspectRatio: number;
    dominantColors: string[];
  };
}

export interface OCRResult {
  text: string;
  confidence: number;
  boundingBoxes: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
}

export interface ExtractedMetadata {
  date?: Date;
  amount?: number;
  currency?: string;
  organization?: string;
  personName?: string;
  documentNumber?: string;
  keyTerms: string[];
  summary?: string;
}

export class DocumentDetector {
  private confidenceThreshold = 0.8;
  
  async detectDocument(imageUri: string): Promise<DocumentDetectionResult> {
    try {
      // For now, we'll implement rule-based detection
      // In production, this would use an on-device ML model
      
      const basicAnalysis = await this.analyzeImageBasics(imageUri);
      const textAnalysis = await this.analyzeForText(imageUri);
      
      // Combine analysis results
      const confidence = this.calculateConfidence(basicAnalysis, textAnalysis);
      const type = this.determineDocumentType(basicAnalysis, textAnalysis);
      const isDocument = confidence >= this.confidenceThreshold;
      
      return {
        isDocument,
        confidence,
        type,
        metadata: {
          hasText: textAnalysis.hasText,
          textDensity: textAnalysis.textDensity,
          aspectRatio: basicAnalysis.aspectRatio,
          dominantColors: basicAnalysis.dominantColors,
        },
      };
      
    } catch (error) {
      console.error('Error detecting document:', error);
      return {
        isDocument: false,
        confidence: 0,
        type: 'unknown',
      };
    }
  }
  
  private async analyzeImageBasics(imageUri: string) {
    try {
      // Get image dimensions
      const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(
          imageUri,
          (width, height) => resolve({ width, height }),
          reject
        );
      });
      
      const aspectRatio = width / height;
      
      // Analyze file size
      let fileSize = 0;
      try {
        const fileInfo = await RNFS.stat(imageUri);
        fileSize = fileInfo.size;
      } catch (e) {
        // File might not exist
      }
      
      // Mock dominant colors analysis
      // In production, this would analyze actual image colors
      const dominantColors = ['#FFFFFF', '#000000', '#808080'];
      
      return {
        width,
        height,
        aspectRatio,
        fileSize,
        dominantColors,
      };
      
    } catch (error) {
      console.error('Error analyzing image basics:', error);
      throw error;
    }
  }
  
  private async analyzeForText(imageUri: string) {
    try {
      // Mock text analysis
      // In production, this would use actual OCR
      
      // Simulate text detection based on filename and basic heuristics
      const filename = imageUri.split('/').pop()?.toLowerCase() || '';
      const textKeywords = ['scan', 'document', 'receipt', 'invoice', 'bill', 'statement'];
      
      const hasText = textKeywords.some(keyword => filename.includes(keyword));
      const textDensity = hasText ? Math.random() * 0.5 + 0.3 : Math.random() * 0.2; // 0.3-0.8 for docs, 0-0.2 for photos
      
      return {
        hasText,
        textDensity,
        dominantTextColor: '#000000',
        backgroundComplexity: Math.random(),
      };
      
    } catch (error) {
      console.error('Error analyzing text:', error);
      return {
        hasText: false,
        textDensity: 0,
        dominantTextColor: '#000000',
        backgroundComplexity: 1,
      };
    }
  }
  
  private calculateConfidence(basicAnalysis: any, textAnalysis: any): number {
    let confidence = 0;
    
    // Aspect ratio check (documents are often rectangular)
    const { aspectRatio } = basicAnalysis;
    if (aspectRatio >= 0.5 && aspectRatio <= 2.0) {
      confidence += 0.2;
    }
    
    // Text density check
    if (textAnalysis.textDensity > 0.3) {
      confidence += 0.4;
    } else if (textAnalysis.textDensity > 0.1) {
      confidence += 0.2;
    }
    
    // File size check (documents are usually in a certain size range)
    const { fileSize } = basicAnalysis;
    if (fileSize > 50000 && fileSize < 5000000) { // 50KB - 5MB
      confidence += 0.2;
    }
    
    // Dominant colors check (documents often have high contrast)
    const { dominantColors } = basicAnalysis;
    if (dominantColors.includes('#FFFFFF') && dominantColors.includes('#000000')) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }
  
  private determineDocumentType(basicAnalysis: any, textAnalysis: any): DocumentDetectionResult['type'] {
    // This is a simplified rule-based approach
    // In production, this would use ML classification
    
    const { aspectRatio } = basicAnalysis;
    const { textDensity } = textAnalysis;
    
    // Very rough heuristics
    if (aspectRatio > 1.5 && textDensity > 0.5) {
      return 'receipt'; // Wide, text-heavy
    } else if (aspectRatio < 0.8 && textDensity > 0.4) {
      return 'invoice'; // Tall, structured text
    } else if (aspectRatio > 1.2 && aspectRatio < 1.8) {
      return 'id'; // Card-like aspect ratio
    } else if (textDensity > 0.6) {
      return 'form'; // High text density
    } else if (textDensity > 0.3) {
      return 'letter'; // Moderate text density
    } else if (aspectRatio > 0.5) {
      return 'screenshot'; // Screen-like aspect ratio
    }
    
    return 'unknown';
  }
  
  async performOCR(imageUri: string): Promise<OCRResult> {
    try {
      // Mock OCR implementation
      // In production, this would use actual OCR like ML Kit or Tesseract
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing time
      
      const mockText = "Sample OCR text from document\nLine 2 of extracted text\nAmount: $123.45\nDate: 2024-01-15";
      
      return {
        text: mockText,
        confidence: 0.85,
        boundingBoxes: [
          {
            text: "Sample OCR text from document",
            x: 10,
            y: 10,
            width: 300,
            height: 20,
            confidence: 0.9,
          },
          {
            text: "Amount: $123.45",
            x: 10,
            y: 50,
            width: 150,
            height: 20,
            confidence: 0.95,
          },
        ],
      };
      
    } catch (error) {
      console.error('Error performing OCR:', error);
      return {
        text: '',
        confidence: 0,
        boundingBoxes: [],
      };
    }
  }
  
  async extractMetadata(ocrResult: OCRResult, documentType: string): Promise<ExtractedMetadata> {
    try {
      const { text } = ocrResult;
      const metadata: ExtractedMetadata = {
        keyTerms: [],
      };
      
      // Extract dates
      const dateRegex = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g;
      const dateMatches = text.match(dateRegex);
      if (dateMatches && dateMatches.length > 0) {
        try {
          metadata.date = new Date(dateMatches[0]);
        } catch (e) {
          // Ignore invalid dates
        }
      }
      
      // Extract amounts
      const amountRegex = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
      const amountMatches = text.match(amountRegex);
      if (amountMatches && amountMatches.length > 0) {
        const amount = parseFloat(amountMatches[0].replace(/[$,]/g, ''));
        if (!isNaN(amount)) {
          metadata.amount = amount;
          metadata.currency = 'USD'; // Default, could be improved with currency detection
        }
      }
      
      // Extract organization names (basic approach)
      const lines = text.split('\n');
      if (lines.length > 0) {
        // First non-empty line is often the organization name
        const firstLine = lines.find(line => line.trim().length > 0);
        if (firstLine && firstLine.length < 50) {
          metadata.organization = firstLine.trim();
        }
      }
      
      // Extract key terms
      const words = text.toLowerCase().split(/\s+/);
      const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
      metadata.keyTerms = words
        .filter(word => word.length > 3 && !stopWords.has(word))
        .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
        .slice(0, 10); // Limit to top 10 terms
      
      // Generate simple summary
      if (text.length > 0) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        metadata.summary = sentences.slice(0, 2).join('. ').substring(0, 200) + '...';
      }
      
      return metadata;
      
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return { keyTerms: [] };
    }
  }
  
  async processDocument(imageUri: string): Promise<{
    detection: DocumentDetectionResult;
    ocr?: OCRResult;
    metadata?: ExtractedMetadata;
  }> {
    try {
      // Step 1: Detect if it's a document
      const detection = await this.detectDocument(imageUri);
      
      if (!detection.isDocument) {
        return { detection };
      }
      
      // Step 2: Perform OCR
      const ocr = await this.performOCR(imageUri);
      
      // Step 3: Extract metadata
      const metadata = await this.extractMetadata(ocr, detection.type);
      
      return {
        detection,
        ocr,
        metadata,
      };
      
    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  }
  
  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}

// Singleton instance
export const documentDetector = new DocumentDetector();