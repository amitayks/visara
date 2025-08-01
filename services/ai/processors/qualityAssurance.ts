import { DocumentType } from '../types/hybridTypes';
import type {
  OCRResult,
  ContextualResult,
  StructuredData,
  QualityMetrics,
  Check,
  ReceiptData,
  InvoiceData,
  IDData,
  PassportData,
  GenericDocumentData
} from '../types/hybridTypes';

export interface QualityAssessmentInput {
  ocrResult: OCRResult;
  contextualResult: ContextualResult;
  structuredData: StructuredData;
}

export class QualityAssurance {
  async assessQuality(input: QualityAssessmentInput): Promise<QualityMetrics> {
    console.log('Assessing extraction quality...');

    // Run all quality checks
    const checks = await this.runAllChecks(input);
    
    // Calculate overall metrics
    const ocrQuality = this.calculateOCRQuality(input.ocrResult);
    const completeness = this.calculateCompleteness(input.contextualResult, input.structuredData);
    const consistency = this.calculateConsistency(input.ocrResult, input.contextualResult, input.structuredData);
    const confidence = this.calculateOverallConfidence(checks, ocrQuality, completeness, consistency);
    
    // Collect warnings
    const warnings = checks
      .filter(check => !check.passed)
      .map(check => check.message);

    return {
      ocrQuality,
      completeness,
      consistency,
      confidence,
      warnings
    };
  }

  private async runAllChecks(input: QualityAssessmentInput): Promise<Check[]> {
    const checks: Check[] = [];

    // OCR Quality Checks
    checks.push(...this.checkOCRQuality(input.ocrResult));
    
    // Context Understanding Checks
    checks.push(...this.checkContextUnderstanding(input.contextualResult));
    
    // Structured Data Checks
    checks.push(...this.checkStructuredData(input.structuredData, input.contextualResult.documentType));
    
    // Cross-validation Checks
    checks.push(...this.checkConsistencyAcrossLayers(input));

    return checks;
  }

  private checkOCRQuality(ocrResult: OCRResult): Check[] {
    const checks: Check[] = [];

    // Check overall OCR confidence
    checks.push({
      name: 'OCR Confidence',
      passed: ocrResult.confidence >= 0.7,
      confidence: ocrResult.confidence,
      message: ocrResult.confidence >= 0.7 
        ? 'OCR confidence is acceptable' 
        : `OCR confidence is low: ${(ocrResult.confidence * 100).toFixed(1)}%`,
      suggestion: ocrResult.confidence < 0.7 
        ? 'Consider image preprocessing or using a different OCR engine'
        : undefined
    });

    // Check text length
    const textLength = ocrResult.text.trim().length;
    checks.push({
      name: 'Text Length',
      passed: textLength > 10,
      confidence: Math.min(1, textLength / 100),
      message: textLength > 10 
        ? 'Adequate text extracted' 
        : 'Very little text extracted',
      suggestion: textLength <= 10 
        ? 'Check image quality and OCR settings'
        : undefined
    });

    // Check block quality
    const avgBlockConfidence = ocrResult.blocks.reduce((sum, block) => sum + block.confidence, 0) / ocrResult.blocks.length;
    checks.push({
      name: 'Block Quality',
      passed: avgBlockConfidence >= 0.6,
      confidence: avgBlockConfidence,
      message: avgBlockConfidence >= 0.6 
        ? 'Text blocks have good confidence' 
        : 'Many text blocks have low confidence',
      suggestion: avgBlockConfidence < 0.6 
        ? 'Review individual text blocks for accuracy'
        : undefined
    });

    // Check for suspicious patterns
    const suspiciousChars = (ocrResult.text.match(/[^\w\s\u0590-\u05FF\u0600-\u06FF.,!?;:()"'-]/g) || []).length;
    const suspiciousRatio = suspiciousChars / ocrResult.text.length;
    checks.push({
      name: 'Character Quality',
      passed: suspiciousRatio < 0.05,
      confidence: 1 - suspiciousRatio,
      message: suspiciousRatio < 0.05 
        ? 'Text contains mostly valid characters' 
        : 'Text contains many suspicious characters',
      suggestion: suspiciousRatio >= 0.05 
        ? 'OCR may have issues with image quality or font recognition'
        : undefined
    });

    return checks;
  }

  private checkContextUnderstanding(contextualResult: ContextualResult): Check[] {
    const checks: Check[] = [];

    // Check document type confidence
    checks.push({
      name: 'Document Classification',
      passed: contextualResult.confidence >= 0.6,
      confidence: contextualResult.confidence,
      message: contextualResult.confidence >= 0.6 
        ? `Document classified as ${contextualResult.documentType}` 
        : `Low confidence in document type: ${contextualResult.documentType}`,
      suggestion: contextualResult.confidence < 0.6 
        ? 'Consider manual review of document type classification'
        : undefined
    });

    // Check entity extraction
    const entityCount = contextualResult.context.entities.length;
    checks.push({
      name: 'Entity Extraction',
      passed: entityCount > 0,
      confidence: Math.min(1, entityCount / 5), // Expect at least 5 entities for good score
      message: entityCount > 0 
        ? `Extracted ${entityCount} entities` 
        : 'No entities extracted',
      suggestion: entityCount === 0 
        ? 'Review text for key information that may have been missed'
        : undefined
    });

    // Check relationship detection
    const relationshipCount = contextualResult.context.relationships.length;
    checks.push({
      name: 'Relationship Detection',
      passed: relationshipCount > 0,
      confidence: Math.min(1, relationshipCount / 3),
      message: relationshipCount > 0 
        ? `Found ${relationshipCount} relationships` 
        : 'No relationships detected between entities',
      suggestion: relationshipCount === 0 
        ? 'Manual review may be needed to establish data relationships'
        : undefined
    });

    // Check layout analysis
    const layout = contextualResult.context.layout;
    const layoutConfidence = layout.confidence ?? 0.8; // Default to 0.8 if confidence is undefined
    checks.push({
      name: 'Layout Analysis',
      passed: layoutConfidence >= 0.5,
      confidence: layoutConfidence,
      message: layoutConfidence >= 0.5 
        ? 'Layout analysis successful' 
        : 'Layout analysis has low confidence',
      suggestion: layoutConfidence < 0.5 
        ? 'Document structure may be complex or unclear'
        : undefined
    });

    return checks;
  }

  private checkStructuredData(data: StructuredData, documentType: DocumentType): Check[] {
    const checks: Check[] = [];

    switch (documentType) {
      case DocumentType.RECEIPT:
        checks.push(...this.checkReceiptData(data as ReceiptData));
        break;
      case DocumentType.INVOICE:
        checks.push(...this.checkInvoiceData(data as InvoiceData));
        break;
      case DocumentType.ID_CARD:
      case DocumentType.DRIVERS_LICENSE:
        checks.push(...this.checkIDData(data as IDData));
        break;
      case DocumentType.PASSPORT:
        checks.push(...this.checkPassportData(data as PassportData));
        break;
      default:
        checks.push(...this.checkGenericData(data as GenericDocumentData));
        break;
    }

    return checks;
  }

  private checkReceiptData(data: ReceiptData): Check[] {
    const checks: Check[] = [];

    // Check if data has the expected structure
    if (!data || !('vendor' in data) || !data.vendor) {
      checks.push({
        name: 'Data Structure',
        passed: false,
        confidence: 0,
        message: 'Receipt data structure is invalid or missing',
        suggestion: 'Extraction failed - check document quality'
      });
      return checks;
    }

    // Check vendor information
    checks.push({
      name: 'Vendor Information',
      passed: data.vendor.name !== 'Unknown Vendor',
      confidence: data.vendor.name !== 'Unknown Vendor' ? 0.8 : 0.2,
      message: data.vendor.name !== 'Unknown Vendor' 
        ? 'Vendor name extracted' 
        : 'Vendor name not found',
      suggestion: data.vendor.name === 'Unknown Vendor' 
        ? 'Check the top of the receipt for business name'
        : undefined
    });

    // Check total amount
    if (data.totals) {
      checks.push({
        name: 'Total Amount',
        passed: data.totals.total > 0,
        confidence: data.totals.total > 0 ? 0.9 : 0,
        message: data.totals.total > 0 
          ? `Total: ${data.totals.currency} ${data.totals.total}` 
          : 'Total amount not found or invalid',
        suggestion: data.totals.total <= 0 
          ? 'Look for total, amount due, or balance on the receipt'
          : undefined
      });
    }

    // Check line items
    if (data.items) {
      checks.push({
        name: 'Line Items',
        passed: data.items.length > 0,
        confidence: Math.min(1, data.items.length / 3),
        message: data.items.length > 0 
          ? `Found ${data.items.length} line items` 
          : 'No line items found',
        suggestion: data.items.length === 0 
          ? 'Check for itemized purchases between header and total'
          : undefined
      });
    }

    // Check calculation consistency
    if (data.items && data.totals) {
      const itemsTotal = data.items.reduce((sum, item) => sum + item.totalPrice, 0);
      const calculationDiff = Math.abs(itemsTotal - data.totals.subtotal);
      checks.push({
        name: 'Calculation Consistency',
        passed: calculationDiff < 1.0, // Allow small rounding differences
        confidence: calculationDiff < 0.1 ? 1 : (calculationDiff < 1.0 ? 0.7 : 0.3),
        message: calculationDiff < 1.0 
          ? 'Item totals match subtotal' 
          : `Item totals don't match subtotal (diff: ${calculationDiff.toFixed(2)})`,
        suggestion: calculationDiff >= 1.0 
          ? 'Review line items and subtotal for accuracy'
          : undefined
      });
    }

    return checks;
  }

  private checkInvoiceData(data: InvoiceData): Check[] {
    const checks: Check[] = [];

    // Check if data has the expected structure
    if (!data || !('vendor' in data) || !data.vendor || !('customer' in data) || !data.customer) {
      checks.push({
        name: 'Data Structure',
        passed: false,
        confidence: 0,
        message: 'Invoice data structure is invalid or missing',
        suggestion: 'Extraction failed - check document quality'
      });
      return checks;
    }

    // Check invoice number
    checks.push({
      name: 'Invoice Number',
      passed: data.invoiceNumber !== 'Unknown',
      confidence: data.invoiceNumber !== 'Unknown' ? 0.8 : 0.2,
      message: data.invoiceNumber !== 'Unknown' 
        ? `Invoice #${data.invoiceNumber}` 
        : 'Invoice number not found'
    });

    // Check vendor and customer
    checks.push({
      name: 'Vendor Information',
      passed: data.vendor.name !== 'Unknown',
      confidence: data.vendor.name !== 'Unknown' ? 0.8 : 0.2,
      message: data.vendor.name !== 'Unknown' 
        ? 'Vendor information extracted' 
        : 'Vendor information incomplete'
    });

    checks.push({
      name: 'Customer Information',
      passed: data.customer.name !== 'Unknown',
      confidence: data.customer.name !== 'Unknown' ? 0.7 : 0.3,
      message: data.customer.name !== 'Unknown' 
        ? 'Customer information extracted' 
        : 'Customer information incomplete'
    });

    // Check dates
    const now = new Date();
    checks.push({
      name: 'Date Validity',
      passed: data.issueDate <= now && (!data.dueDate || data.dueDate >= data.issueDate),
      confidence: data.issueDate <= now ? 0.8 : 0.2,
      message: data.issueDate <= now 
        ? 'Invoice dates are valid' 
        : 'Invoice date appears to be in the future'
    });

    return checks;
  }

  private checkIDData(data: IDData): Check[] {
    const checks: Check[] = [];

    // Check if data has the expected structure
    if (!data || !('personalInfo' in data) || !data.personalInfo || !('documentInfo' in data) || !data.documentInfo) {
      checks.push({
        name: 'Data Structure',
        passed: false,
        confidence: 0,
        message: 'ID data structure is invalid or missing',
        suggestion: 'Extraction failed - check document quality'
      });
      return checks;
    }

    // Check personal information
    checks.push({
      name: 'Personal Information',
      passed: data.personalInfo.firstName.length > 0 && data.personalInfo.lastName.length > 0,
      confidence: (data.personalInfo.firstName.length > 0 && data.personalInfo.lastName.length > 0) ? 0.9 : 0.3,
      message: (data.personalInfo.firstName.length > 0 && data.personalInfo.lastName.length > 0) 
        ? 'Full name extracted' 
        : 'Incomplete name information'
    });

    // Check document number
    checks.push({
      name: 'Document Number',
      passed: data.documentInfo.documentNumber.length > 0,
      confidence: data.documentInfo.documentNumber.length > 3 ? 0.8 : 0.3,
      message: data.documentInfo.documentNumber.length > 0 
        ? 'Document number extracted' 
        : 'Document number not found'
    });

    // Check expiry date
    const now = new Date();
    const isExpired = data.documentInfo.expiryDate && data.documentInfo.expiryDate < now;
    checks.push({
      name: 'Document Validity',
      passed: !isExpired,
      confidence: !isExpired ? 0.8 : 0.5,
      message: !isExpired 
        ? 'Document is valid' 
        : 'Document appears to be expired',
      suggestion: isExpired 
        ? 'Verify expiry date on the document'
        : undefined
    });

    return checks;
  }

  private checkPassportData(data: PassportData): Check[] {
    const checks: Check[] = [];

    // Check MRZ validity
    checks.push({
      name: 'MRZ Validity',
      passed: data.validity.isValid,
      confidence: data.validity.isValid ? 0.9 : 0.3,
      message: data.validity.isValid 
        ? 'MRZ data is valid' 
        : `MRZ validation failed: ${data.validity.errors.join(', ')}`,
      suggestion: !data.validity.isValid 
        ? 'Review the machine-readable zone at the bottom of the passport'
        : undefined
    });

    // Check data consistency
    const mrzName = `${data.mrzData.givenNames} ${data.mrzData.surname}`.trim();
    const visualName = `${data.visualData.firstName} ${data.visualData.lastName}`.trim();
    const namesMatch = mrzName.toLowerCase().includes(visualName.toLowerCase()) || 
                      visualName.toLowerCase().includes(mrzName.toLowerCase());
    
    checks.push({
      name: 'Data Consistency',
      passed: namesMatch || visualName.length === 0,
      confidence: namesMatch ? 0.8 : 0.4,
      message: namesMatch || visualName.length === 0 
        ? 'MRZ and visual data are consistent' 
        : 'Potential mismatch between MRZ and visual data'
    });

    return checks;
  }

  private checkGenericData(data: GenericDocumentData): Check[] {
    const checks: Check[] = [];

    // Check content extraction
    checks.push({
      name: 'Content Extraction',
      passed: data.content.length > 50,
      confidence: Math.min(1, data.content.length / 500),
      message: data.content.length > 50 
        ? 'Document content extracted' 
        : 'Limited content extracted'
    });

    // Check entity extraction
    checks.push({
      name: 'Entity Extraction',
      passed: data.entities.length > 0,
      confidence: Math.min(1, data.entities.length / 5),
      message: data.entities.length > 0 
        ? `Found ${data.entities.length} entities` 
        : 'No entities extracted'
    });

    // Check structure detection
    checks.push({
      name: 'Structure Detection',
      passed: data.keyValuePairs.length > 0,
      confidence: Math.min(1, data.keyValuePairs.length / 10),
      message: data.keyValuePairs.length > 0 
        ? `Found ${data.keyValuePairs.length} key-value pairs` 
        : 'No structured data detected'
    });

    return checks;
  }

  private checkConsistencyAcrossLayers(input: QualityAssessmentInput): Check[] {
    const checks: Check[] = [];

    // Check language consistency (simplified for English-only)
    const ocrLanguages = input.ocrResult.language || ['en'];
    const contextDirection = input.contextualResult.context.layout.textDirection;
    const directionMatch = contextDirection === 'ltr';

    checks.push({
      name: 'Language Consistency',
      passed: directionMatch,
      confidence: directionMatch ? 0.8 : 0.6,
      message: directionMatch 
        ? 'Language detection is consistent across layers' 
        : 'Potential language/direction mismatch between OCR and context analysis'
    });

    // Check confidence correlation
    const ocrConf = input.ocrResult.confidence;
    const contextConf = input.contextualResult.confidence;
    const confDiff = Math.abs(ocrConf - contextConf);
    
    checks.push({
      name: 'Confidence Correlation',
      passed: confDiff < 0.3,
      confidence: 1 - confDiff,
      message: confDiff < 0.3 
        ? 'OCR and context confidence levels are aligned' 
        : 'Large difference between OCR and context confidence levels',
      suggestion: confDiff >= 0.3 
        ? 'One processing layer may have issues - review both OCR and context results'
        : undefined
    });

    return checks;
  }

  private calculateOCRQuality(ocrResult: OCRResult): number {
    const factors = [
      ocrResult.confidence * 0.4,
      Math.min(1, ocrResult.text.length / 100) * 0.2,
      Math.min(1, ocrResult.blocks.length / 10) * 0.2,
      ((ocrResult.language || ['en']).length > 0 ? 1 : 0) * 0.2
    ];

    return factors.reduce((sum, factor) => sum + factor, 0);
  }

  private calculateCompleteness(contextualResult: ContextualResult, structuredData: StructuredData): number {
    let score = 0;

    // Base score from context understanding
    score += contextualResult.confidence * 0.3;

    // Entity extraction completeness
    const entityCount = contextualResult.context.entities.length;
    score += Math.min(1, entityCount / 5) * 0.3;

    // Relationship detection completeness
    const relationshipCount = contextualResult.context.relationships.length;
    score += Math.min(1, relationshipCount / 3) * 0.2;

    // Structured data completeness (document-type specific)
    score += this.calculateStructuredDataCompleteness(structuredData, contextualResult.documentType) * 0.2;

    return Math.min(1, score);
  }

  private calculateStructuredDataCompleteness(data: StructuredData, documentType: DocumentType): number {
    switch (documentType) {
      case DocumentType.RECEIPT:
        const receiptData = data as ReceiptData;
        if (!receiptData || !('vendor' in receiptData)) return 0;
        return (
          (receiptData.vendor?.name !== 'Unknown Vendor' ? 0.3 : 0) +
          (receiptData.totals?.total > 0 ? 0.3 : 0) +
          (receiptData.items?.length > 0 ? 0.4 : 0)
        );

      case DocumentType.INVOICE:
        const invoiceData = data as InvoiceData;
        if (!invoiceData || !('vendor' in invoiceData)) return 0;
        return (
          (invoiceData.invoiceNumber !== 'Unknown' ? 0.2 : 0) +
          (invoiceData.vendor?.name !== 'Unknown' ? 0.2 : 0) +
          (invoiceData.customer?.name !== 'Unknown' ? 0.2 : 0) +
          (invoiceData.totals?.total > 0 ? 0.2 : 0) +
          (invoiceData.items?.length > 0 ? 0.2 : 0)
        );

      case DocumentType.ID_CARD:
      case DocumentType.DRIVERS_LICENSE:
        const idData = data as IDData;
        if (!idData || !('personalInfo' in idData) || !('documentInfo' in idData)) return 0;
        return (
          (idData.personalInfo?.firstName?.length > 0 ? 0.3 : 0) +
          (idData.personalInfo?.lastName?.length > 0 ? 0.3 : 0) +
          (idData.documentInfo?.documentNumber?.length > 0 ? 0.4 : 0)
        );

      case DocumentType.PASSPORT:
        const passportData = data as PassportData;
        if (!passportData || !('validity' in passportData)) return 0;
        return passportData.validity?.isValid ? 1.0 : 0.3;

      default:
        const genericData = data as GenericDocumentData;
        return (
          (genericData.content.length > 50 ? 0.4 : 0) +
          (genericData.entities.length > 0 ? 0.3 : 0) +
          (genericData.keyValuePairs.length > 0 ? 0.3 : 0)
        );
    }
  }

  private calculateConsistency(ocrResult: OCRResult, contextualResult: ContextualResult, structuredData: StructuredData): number {
    let score = 1.0;

    // Check confidence consistency between layers
    const ocrConf = ocrResult.confidence;
    const contextConf = contextualResult.confidence;
    const confDiff = Math.abs(ocrConf - contextConf);
    score -= confDiff * 0.3;

    // Check language/direction consistency (simplified for English-only)
    const contextDirection = contextualResult.context.layout.textDirection;
    
    if (contextDirection !== 'ltr') {
      score -= 0.2;
    }

    // Document-specific consistency checks
    score -= this.checkDocumentSpecificConsistency(structuredData, contextualResult.documentType);

    return Math.max(0, score);
  }

  private checkDocumentSpecificConsistency(data: StructuredData, documentType: DocumentType): number {
    let penalty = 0;

    switch (documentType) {
      case DocumentType.RECEIPT:
        const receiptData = data as ReceiptData;
        // Check if items total matches subtotal
        const itemsTotal = receiptData.items.reduce((sum, item) => sum + item.totalPrice, 0);
        if (receiptData.totals.subtotal > 0 && Math.abs(itemsTotal - receiptData.totals.subtotal) > 1.0) {
          penalty += 0.2;
        }
        break;

      case DocumentType.INVOICE:
        const invoiceData = data as InvoiceData;
        // Check if due date is after issue date
        if (invoiceData.dueDate && invoiceData.dueDate < invoiceData.issueDate) {
          penalty += 0.1;
        }
        break;

      case DocumentType.PASSPORT:
        const passportData = data as PassportData;
        // Check if MRZ data is consistent with visual data
        if (!passportData.validity.isValid) {
          penalty += 0.3;
        }
        break;
    }

    return penalty;
  }

  private calculateOverallConfidence(checks: Check[], ocrQuality: number, completeness: number, consistency: number): number {
    // Calculate weighted average of all metrics
    const weights = {
      checks: 0.3,
      ocrQuality: 0.25,
      completeness: 0.25,
      consistency: 0.2
    };

    // Average confidence from checks
    const avgCheckConfidence = checks.reduce((sum, check) => sum + check.confidence, 0) / checks.length;

    const overallConfidence = (
      avgCheckConfidence * weights.checks +
      ocrQuality * weights.ocrQuality +
      completeness * weights.completeness +
      consistency * weights.consistency
    );

    return Math.max(0, Math.min(1, overallConfidence));
  }

  // Utility method for generating quality reports
  generateQualityReport(metrics: QualityMetrics, checks: Check[]): string {
    const report = [
      '=== DOCUMENT PROCESSING QUALITY REPORT ===',
      '',
      `Overall Confidence: ${(metrics.confidence * 100).toFixed(1)}%`,
      `OCR Quality: ${(metrics.ocrQuality * 100).toFixed(1)}%`,
      `Completeness: ${(metrics.completeness * 100).toFixed(1)}%`,
      `Consistency: ${(metrics.consistency * 100).toFixed(1)}%`,
      '',
      '=== DETAILED CHECKS ===',
      ...checks.map(check => 
        `${check.passed ? '✓' : '✗'} ${check.name}: ${check.message}` +
        (check.suggestion ? ` (${check.suggestion})` : '')
      ),
      '',
      '=== WARNINGS ===',
      ...metrics.warnings.map(warning => `⚠ ${warning}`)
    ];

    return report.join('\n');
  }
}