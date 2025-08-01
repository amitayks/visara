import { DocumentType } from '../types/hybridTypes';
import type { 
  DocumentExtractor, 
  StructuredData,
  ContextualResult 
} from '../types/hybridTypes';

import { ReceiptExtractor } from './receiptExtractor';
import { InvoiceExtractor } from './invoiceExtractor';
import { IDDocumentExtractor } from './idDocumentExtractor';
import { PassportExtractor } from './passportExtractor';
import { GenericDocumentExtractor } from './genericDocumentExtractor';

export class DocumentExtractorFactory {
  private extractors = new Map<DocumentType, DocumentExtractor<any>>();
  private genericExtractor: GenericDocumentExtractor;
  private initialized = false;

  constructor() {
    this.genericExtractor = new GenericDocumentExtractor();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing Document Extractor Factory...');

    // Register all extractors
    this.registerExtractor(DocumentType.RECEIPT, new ReceiptExtractor());
    this.registerExtractor(DocumentType.INVOICE, new InvoiceExtractor());
    this.registerExtractor(DocumentType.ID_CARD, new IDDocumentExtractor());
    this.registerExtractor(DocumentType.DRIVERS_LICENSE, new IDDocumentExtractor());
    this.registerExtractor(DocumentType.PASSPORT, new PassportExtractor());
    this.registerExtractor(DocumentType.BANK_STATEMENT, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.UTILITY_BILL, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.CONTRACT, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.MEDICAL_DOCUMENT, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.INSURANCE_CARD, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.TICKET, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.FORM, new GenericDocumentExtractor());
    this.registerExtractor(DocumentType.LETTER, new GenericDocumentExtractor());

    // Initialize all extractors
    const initPromises = Array.from(this.extractors.values()).map(async (extractor) => {
      try {
        if (extractor.initialize) {
          await extractor.initialize();
        }
        console.log(`✓ ${extractor.constructor.name} initialized`);
      } catch (error) {
        console.warn(`✗ Failed to initialize ${extractor.constructor.name}:`, error);
      }
    });

    await this.genericExtractor.initialize();
    await Promise.all(initPromises);

    this.initialized = true;
    console.log('Document Extractor Factory initialized');
  }

  private registerExtractor<T extends StructuredData>(
    documentType: DocumentType, 
    extractor: DocumentExtractor<T>
  ): void {
    this.extractors.set(documentType, extractor);
  }

  getExtractor(documentType: DocumentType): DocumentExtractor<StructuredData> {
    const extractor = this.extractors.get(documentType);
    
    if (extractor && extractor.canHandle(documentType)) {
      return extractor;
    }

    // Fallback to generic extractor
    console.log(`No specific extractor for ${documentType}, using generic extractor`);
    return this.genericExtractor;
  }

  getSupportedTypes(): DocumentType[] {
    return Array.from(this.extractors.keys());
  }

  hasExtractor(documentType: DocumentType): boolean {
    return this.extractors.has(documentType);
  }

  // Utility method to get the best extractor based on confidence
  getBestExtractor(
    contextualResult: ContextualResult
  ): { extractor: DocumentExtractor<StructuredData>; confidence: number } {
    const primaryExtractor = this.getExtractor(contextualResult.documentType);
    let bestExtractor = primaryExtractor;
    let bestConfidence = contextualResult.confidence;

    // If confidence is low, try other extractors
    if (contextualResult.confidence < 0.7) {
      const candidates = [
        DocumentType.RECEIPT,
        DocumentType.INVOICE,
        DocumentType.ID_CARD,
        DocumentType.PASSPORT
      ];

      for (const candidateType of candidates) {
        if (candidateType === contextualResult.documentType) continue;

        const candidateExtractor = this.extractors.get(candidateType);
        if (candidateExtractor) {
          // Test if this extractor can handle the document better
          const canHandle = candidateExtractor.canHandle(candidateType);
          const estimatedConfidence = this.estimateExtractorFit(
            contextualResult, 
            candidateType
          );

          if (canHandle && estimatedConfidence > bestConfidence) {
            bestExtractor = candidateExtractor;
            bestConfidence = estimatedConfidence;
          }
        }
      }
    }

    return { extractor: bestExtractor, confidence: bestConfidence };
  }

  private estimateExtractorFit(
    contextualResult: ContextualResult, 
    documentType: DocumentType
  ): number {
    const text = contextualResult.rawOCR.text.toLowerCase();
    const entities = contextualResult.context.entities;

    let score = 0;

    switch (documentType) {
      case DocumentType.RECEIPT:
        if (text.includes('receipt')) score += 0.3;
        if (text.includes('total')) score += 0.2;
        if (entities.some(e => e.type === 'amount')) score += 0.2;
        if (entities.some(e => e.type === 'line_item')) score += 0.3;
        break;

      case DocumentType.INVOICE:
        if (text.includes('invoice')) score += 0.3;
        if (text.includes('bill to')) score += 0.2;
        if (text.includes('due date')) score += 0.2;
        if (entities.some(e => e.type === 'amount')) score += 0.2;
        if (entities.some(e => e.type === 'date')) score += 0.1;
        break;

      case DocumentType.PASSPORT:
        if (text.includes('passport')) score += 0.4;
        if (text.includes('nationality')) score += 0.2;
        if (entities.some(e => e.type === 'person_name')) score += 0.2;
        if (entities.some(e => e.type === 'date')) score += 0.1;
        if (entities.some(e => e.type === 'document_number')) score += 0.1;
        break;

      case DocumentType.ID_CARD:
        if (text.includes('id') || text.includes('identification')) score += 0.3;
        if (text.includes('license')) score += 0.2;
        if (entities.some(e => e.type === 'person_name')) score += 0.2;
        if (entities.some(e => e.type === 'date')) score += 0.2;
        if (entities.some(e => e.type === 'address')) score += 0.1;
        break;
    }

    return Math.min(0.95, score);
  }

  // Method to extract with multiple extractors and compare results
  async extractWithMultipleExtractors(
    contextualResult: ContextualResult
  ): Promise<{
    primaryResult: StructuredData;
    alternativeResults: Array<{
      extractor: string;
      result: StructuredData;
      confidence: number;
    }>;
    recommendation: {
      useAlternative: boolean;
      reason: string;
    };
  }> {
    const primaryExtractor = this.getExtractor(contextualResult.documentType);
    const primaryResult = await primaryExtractor.extract(contextualResult);

    const alternativeResults: Array<{
      extractor: string;
      result: StructuredData;
      confidence: number;
    }> = [];

    // Try a few alternative extractors if confidence is low
    if (contextualResult.confidence < 0.8) {
      const alternatives = [
        DocumentType.RECEIPT,
        DocumentType.INVOICE,
        DocumentType.ID_CARD
      ].filter(type => type !== contextualResult.documentType);

      for (const altType of alternatives.slice(0, 2)) { // Max 2 alternatives
        try {
          const altExtractor = this.extractors.get(altType);
          if (altExtractor) {
            const altResult = await altExtractor.extract(contextualResult);
            const validation = await altExtractor.validate(altResult);
            
            alternativeResults.push({
              extractor: altType,
              result: altResult,
              confidence: validation.confidence
            });
          }
        } catch (error) {
          console.warn(`Alternative extraction with ${altType} failed:`, error);
        }
      }
    }

    // Determine if we should recommend an alternative
    const primaryValidation = await primaryExtractor.validate(primaryResult);
    const bestAlternative = alternativeResults.reduce<{extractor: string; result: StructuredData; confidence: number} | null>((best, current) => 
      current.confidence > (best?.confidence || 0) ? current : best
    , null);

    const useAlternative = bestAlternative && 
      bestAlternative.confidence > primaryValidation.confidence + 0.1;

    return {
      primaryResult,
      alternativeResults,
      recommendation: {
        useAlternative: !!useAlternative,
        reason: useAlternative 
          ? `Alternative extractor (${bestAlternative.extractor}) has higher confidence: ${bestAlternative.confidence.toFixed(2)} vs ${primaryValidation.confidence.toFixed(2)}`
          : 'Primary extractor is suitable'
      }
    };
  }

  // Get extraction statistics
  getExtractionStats(): {
    totalExtractors: number;
    supportedTypes: string[];
    initialized: boolean;
  } {
    return {
      totalExtractors: this.extractors.size,
      supportedTypes: Array.from(this.extractors.keys()),
      initialized: this.initialized
    };
  }

  // Method to validate extractor capabilities
  async validateExtractors(): Promise<{
    working: string[];
    failing: string[];
    details: Record<string, string>;
  }> {
    const working: string[] = [];
    const failing: string[] = [];
    const details: Record<string, string> = {};

    for (const [docType, extractor] of this.extractors) {
      try {
        const canHandle = extractor.canHandle(docType);
        if (canHandle) {
          working.push(docType);
          details[docType] = 'Working correctly';
        } else {
          failing.push(docType);
          details[docType] = 'Cannot handle document type';
        }
      } catch (error) {
        failing.push(docType);
        details[docType] = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return { working, failing, details };
  }
}