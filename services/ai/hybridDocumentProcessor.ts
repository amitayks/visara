import { MultiEngineOCR } from './processors/multiEngineOCR';
import { LocalContextEngine } from './processors/localContextEngine';
import { DocumentExtractorFactory } from './extractors/documentExtractorFactory';
import { QualityAssurance } from './processors/qualityAssurance';
import { ImagePreprocessor } from './processors/imagePreprocessor';
import { DocumentType } from './types/hybridTypes';
import type {
  ProcessedDocument,
  OCRResult,
  ContextualResult,
  ProcessingOptions,
  HybridProcessingError,
  StructuredData,
  QualityMetrics,
  HybridProcessingResult
} from './types/hybridTypes';

export interface HybridDocumentProcessorInterface {
  processDocument(imageUri: string, options?: Partial<ProcessingOptions>): Promise<HybridProcessingResult>;
  extractText(imageUri: string): Promise<OCRResult>;
  understandContext(ocrResult: OCRResult): Promise<ContextualResult>;
  extractStructuredData(contextualResult: ContextualResult): Promise<StructuredData>;
}

export class HybridDocumentProcessor implements HybridDocumentProcessorInterface {
  private multiEngineOCR: MultiEngineOCR;
  private contextEngine: LocalContextEngine;
  private extractorFactory: DocumentExtractorFactory;
  private qualityAssurance: QualityAssurance;
  private imagePreprocessor: ImagePreprocessor;
  private initialized = false;

  private defaultOptions: ProcessingOptions = {
    enableContextUnderstanding: true,
    enableStructuredExtraction: true,
    languages: ['en'], // English only
    maxProcessingTime: 30000, // 30 seconds
    qualityThreshold: 0.7,
    enablePreprocessing: true,
    ocrEngines: ['tesseract'] // Use Tesseract engine
  };

  private config = {
    ocrEngines: ['tesseract']
  };

  constructor() {
    this.multiEngineOCR = new MultiEngineOCR();
    this.contextEngine = new LocalContextEngine();
    this.extractorFactory = new DocumentExtractorFactory();
    this.qualityAssurance = new QualityAssurance();
    this.imagePreprocessor = new ImagePreprocessor();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing Hybrid Document Processor...');
    const startTime = Date.now();

    try {
      // Initialize all components in parallel
      await Promise.all([
        this.multiEngineOCR.initialize(),
        this.contextEngine.initialize(),
        this.extractorFactory.initialize(),
        this.imagePreprocessor.initialize()
      ]);

      this.initialized = true;
      console.log(`Hybrid Document Processor initialized in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('Failed to initialize Hybrid Document Processor:', error);
      throw new Error(`Initialization failed: ${error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error)}`);
    }
  }

  async processDocument(
    imageUri: string, 
    options: Partial<ProcessingOptions> = {}
  ): Promise<HybridProcessingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const processingSteps: string[] = [];
    const warnings: string[] = [];

    try {
      console.log(`Starting hybrid document processing for: ${imageUri}`);

      // Layer 1: Text Extraction (OCR)
      processingSteps.push('Starting OCR extraction');
      const ocrResult = await this.extractText(imageUri);
      processingSteps.push(`OCR completed with ${ocrResult.confidence.toFixed(2)} confidence`);

      // Early exit if OCR quality is too low
      if (ocrResult.confidence < opts.qualityThreshold) {
        warnings.push(`Low OCR confidence: ${ocrResult.confidence.toFixed(2)}`);
      }

      // Layer 2: Context Understanding (optional)
      let contextualResult: ContextualResult;
      if (opts.enableContextUnderstanding) {
        processingSteps.push('Starting context understanding');
        contextualResult = await this.understandContext(ocrResult);
        processingSteps.push(`Context analysis completed: ${contextualResult.documentType}`);
      } else {
        // Fallback to basic document type detection
        contextualResult = await this.createBasicContextualResult(ocrResult);
        processingSteps.push('Used basic document type detection');
      }

      // Layer 3: Structured Data Extraction (optional)
      let structuredData: StructuredData;
      if (opts.enableStructuredExtraction) {
        processingSteps.push('Starting structured data extraction');
        structuredData = await this.extractStructuredData(contextualResult);
        processingSteps.push('Structured data extraction completed');
      } else {
        structuredData = await this.createGenericStructuredData(contextualResult);
        processingSteps.push('Used generic data structure');
      }

      // Quality Assessment
      const extractionQuality = await this.assessQuality(
        ocrResult,
        contextualResult,
        structuredData
      );

      const totalProcessingTime = Date.now() - startTime;
      processingSteps.push(`Total processing time: ${totalProcessingTime}ms`);

      // Check processing time limit
      if (totalProcessingTime > opts.maxProcessingTime) {
        warnings.push(`Processing exceeded time limit: ${totalProcessingTime} > ${opts.maxProcessingTime}ms`);
      }

      // Calculate image hash
      const preprocessedImage = await this.imagePreprocessor.preprocessImage(imageUri);

      const hybridResult: HybridProcessingResult = {
        ocrResult,
        contextualResult,
        structuredData,
        qualityMetrics: {
          overall: {
            ocrQuality: extractionQuality.ocrQuality,
            completeness: extractionQuality.completeness,
            consistency: extractionQuality.consistency,
            totalScore: extractionQuality.confidence,
            warnings: extractionQuality.warnings
          }
        },
        processingStats: {
          totalTime: totalProcessingTime,
          ocrEngines: this.config.ocrEngines
        },
        metadata: {
          processingTime: totalProcessingTime,
          imageHash: preprocessedImage.hash,
          timestamp: new Date(),
          processingStages: processingSteps
        }
      };

      console.log(`Document processing completed in ${totalProcessingTime}ms`);
      console.log(`Document type: ${contextualResult.documentType} (${contextualResult.confidence})`);

      return hybridResult;

    } catch (error) {
      console.error('Error in document processing pipeline:', error);
      
      // Create error result
      const processingTime = Date.now() - startTime;
      const errorResult: HybridProcessingResult = {
        ocrResult: {
          text: '',
          blocks: [],
          confidence: 0,
          processingTime: 0,
          language: ['en'],
          engine: 'mlkit'
        },
        contextualResult: {
          documentType: DocumentType.UNKNOWN,
          confidence: 0,
          rawOCR: {
            text: '',
            blocks: [],
            confidence: 0,
            processingTime: 0,
            language: ['en'],
            engine: 'mlkit'
          },
          context: {
            layout: {
              orientation: 'portrait',
              columns: 1,
              hasTable: false,
              hasHeader: false,
              hasFooter: false,
              textDirection: 'ltr',
              confidence: 0
            },
            entities: [],
            relationships: [],
            sections: [],
            confidence: 0
          }
        },
        structuredData: {
          title: 'Processing Failed',
          content: '',
          entities: [],
          keyValuePairs: [],
          metadata: { error: error instanceof Error ? error.message : String(error) }
        },
        qualityMetrics: {
          overall: {
            ocrQuality: 0,
            completeness: 0,
            consistency: 0,
            totalScore: 0,
            warnings: [`Processing error: ${error instanceof Error ? error.message : String(error)}`]
          }
        },
        processingStats: {
          totalTime: processingTime,
          ocrEngines: this.config.ocrEngines
        },
        metadata: {
          processingTime,
          imageHash: 'error',
          timestamp: new Date(),
          processingStages: [...processingSteps, `Error: ${error instanceof Error ? error.message : String(error)}`]
        }
      };

      return errorResult;
    }
  }

  async extractText(imageUri: string): Promise<OCRResult> {
    try {
      console.log('Starting OCR text extraction...');
      
      // First, try regular multi-engine OCR
      let result = await this.multiEngineOCR.extractText(imageUri);
      
      // Use standard result for English-only processing
      
      return result;
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async understandContext(ocrResult: OCRResult): Promise<ContextualResult> {
    try {
      console.log('Starting context understanding...');
      return await this.contextEngine.understandContext(ocrResult);
    } catch (error) {
      console.error('Context understanding failed:', error);
      // Fallback to basic detection
      return await this.createBasicContextualResult(ocrResult);
    }
  }

  async extractStructuredData(contextualResult: ContextualResult): Promise<StructuredData> {
    try {
      console.log(`Extracting structured data for ${contextualResult.documentType}...`);
      const extractor = this.extractorFactory.getExtractor(contextualResult.documentType);
      return await extractor.extract(contextualResult);
    } catch (error) {
      console.error('Structured data extraction failed:', error);
      // Fallback to generic extraction
      return await this.createGenericStructuredData(contextualResult);
    }
  }

  private async createBasicContextualResult(ocrResult: OCRResult): Promise<ContextualResult> {
    // Simple keyword-based document type detection
    const text = ocrResult.text.toLowerCase();
    let documentType = DocumentType.UNKNOWN;
    let confidence = 0.5;

    // Basic classification rules
    if (text.includes('receipt') || text.includes('total') || text.includes('change')) {
      documentType = DocumentType.RECEIPT;
      confidence = 0.6;
    } else if (text.includes('invoice') || text.includes('bill to') || text.includes('due date')) {
      documentType = DocumentType.INVOICE;
      confidence = 0.6;
    } else if (text.includes('passport') || text.includes('nationality')) {
      documentType = DocumentType.PASSPORT;
      confidence = 0.7;
    } else if (text.includes('driver') && text.includes('license')) {
      documentType = DocumentType.DRIVERS_LICENSE;
      confidence = 0.7;
    }

    return {
      documentType,
      confidence,
      context: {
        layout: {
          orientation: 'portrait',
          columns: 1,
          hasTable: text.includes('table') || text.split('\n').length > 10,
          hasHeader: true,
          hasFooter: ocrResult.blocks.length > 5,
          textDirection: this.detectTextDirection(ocrResult.text)
        },
        entities: [],
        relationships: [],
        sections: [],
        confidence
      },
      rawOCR: ocrResult
    };
  }

  private async createGenericStructuredData(contextualResult: ContextualResult): Promise<StructuredData> {
    return {
      title: contextualResult.documentType,
      content: contextualResult.rawOCR.text,
      entities: contextualResult.context.entities || [],
      keyValuePairs: [],
      metadata: {
        documentType: contextualResult.documentType,
        confidence: contextualResult.confidence,
        detectedLanguages: contextualResult.rawOCR.language || ['en']
      }
    };
  }

  private detectTextDirection(text: string): 'ltr' {
    // Always return LTR for English-only processing
    return 'ltr';
  }

  private async assessQuality(
    ocrResult: OCRResult,
    contextualResult: ContextualResult,
    structuredData: StructuredData
  ): Promise<QualityMetrics> {
    return this.qualityAssurance.assessQuality({
      ocrResult,
      contextualResult,
      structuredData
    });
  }

  // Utility methods
  async clearCache(): Promise<void> {
    await Promise.all([
      this.multiEngineOCR.clearCache(),
      this.contextEngine.clearCache(),
      this.imagePreprocessor.clearCache()
    ]);
  }

  getProcessingStats(): object {
    return {
      initialized: this.initialized,
      ocrEngines: this.multiEngineOCR.getAvailableEngines(),
      contextEngine: this.contextEngine.isInitialized(),
      supportedDocumentTypes: this.extractorFactory.getSupportedTypes()
    };
  }

  async validateConfiguration(): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];

    if (!this.initialized) {
      issues.push('Processor not initialized');
    }

    if (!this.multiEngineOCR.hasAvailableEngines()) {
      issues.push('No OCR engines available');
    }

    if (!this.contextEngine.isInitialized()) {
      issues.push('Context engine not initialized');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// Singleton instance
export const hybridDocumentProcessor = new HybridDocumentProcessor();