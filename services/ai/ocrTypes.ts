export type OCREngineName = 'mlkit' | 'vision-camera' | 'mock';

export interface OCRBoundingBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface OCRBlock {
  text: string;
  confidence: number;
  boundingBox: OCRBoundingBox;
  isRTL: boolean;
  language?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: OCRBlock[];
  languages: string[];
  processingTime: number;
  engineName: OCREngineName;
  memoryUsage?: number;
}

export interface LocalOCREngine {
  name: OCREngineName;
  displayName: string;
  processImage(uri: string): Promise<OCRResult>;
  isInitialized(): boolean;
  initialize(): Promise<void>;
  supportsLanguage(lang: string): boolean;
  getMemoryUsage?(): number;
  getSupportedLanguages(): string[];
}

export interface OCRComparison {
  imageUri: string;
  timestamp: Date;
  results: OCRResult[];
  bestEngine: OCREngineName;
  processingStats: {
    totalTime: number;
    preprocessTime: number;
  };
}

export interface PreprocessingOptions {
  resize?: {
    maxWidth: number;
    maxHeight: number;
  };
  autoRotate?: boolean;
  enhanceContrast?: boolean;
  binarize?: boolean;
  noiseReduction?: boolean;
  brightnessAdjustment?: number;
  targetLanguage?: 'hebrew' | 'english' | 'mixed';
}

export interface HebrewMetadata {
  currency?: Array<{
    amount: number;
    symbol: string;
  }>;
  phones?: string[];
  vatNumbers?: string[];
  dates?: Array<{
    date: Date;
    format: string;
  }>;
  businessNumbers?: Array<{
    type: 'vat' | 'company' | 'dealer';
    number: string;
  }>;
}