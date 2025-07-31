import { DocumentType, EntityType } from '../types/hybridTypes';
import type {
  DocumentExtractor,
  ContextualResult,
  ReceiptData,
  ValidationResult,
  Entity,
  LineItem
} from '../types/hybridTypes';

export class ReceiptExtractor implements DocumentExtractor<ReceiptData> {
  async initialize?(): Promise<void> {
    // Receipt extractor initialization if needed
    console.log('Receipt extractor initialized');
  }

  canHandle(documentType: DocumentType): boolean {
    return documentType === DocumentType.RECEIPT;
  }

  async extract(context: ContextualResult): Promise<ReceiptData> {
    console.log('Extracting receipt data...');
    
    const text = context.rawOCR?.text || '';
    const entities = context.context?.entities || [];
    const blocks = context.rawOCR?.blocks || [];

    // Extract vendor information
    const vendor = await this.extractVendor(text, entities, blocks);
    
    // Extract line items
    const items = await this.extractLineItems(text, entities, blocks);
    
    // Extract totals
    const totals = await this.extractTotals(text, entities);
    
    // Extract payment method
    const paymentMethod = this.extractPaymentMethod(text);
    
    // Extract date
    const date = this.extractDate(text, entities);
    
    // Extract transaction ID
    const transactionId = this.extractTransactionId(text, entities);
    
    // Extract metadata
    const metadata = this.extractMetadata(text, entities);

    return {
      vendor,
      items,
      totals,
      paymentMethod,
      date,
      transactionId,
      metadata
    };
  }

  private async extractVendor(
    text: string, 
    entities: Entity[], 
    blocks: typeof context.rawOCR.blocks
  ): Promise<ReceiptData['vendor']> {
    // Find vendor name (usually first few lines)
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    let vendorName = '';
    
    // Look for organization entities first
    const orgEntity = entities.find(e => e.type === EntityType.ORGANIZATION);
    if (orgEntity) {
      vendorName = orgEntity.value;
    } else {
      // Fallback: use first non-empty line that looks like a business name
      for (const line of lines.slice(0, 5)) {
        const trimmed = line.trim();
        if (trimmed.length > 2 && 
            !this.looksLikeAddress(trimmed) &&
            !this.looksLikeAmount(trimmed) &&
            !this.looksLikeDate(trimmed)) {
          vendorName = trimmed;
          break;
        }
      }
    }

    // Extract address
    let address: string | undefined;
    const addressEntity = entities.find(e => e.type === EntityType.ADDRESS);
    if (addressEntity) {
      address = addressEntity.value;
    } else {
      // Look for address patterns in text
      const addressMatch = text.match(/\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)[^\n]*/i);
      if (addressMatch) {
        address = addressMatch[0].trim();
      }
    }

    // Extract phone
    let phone: string | undefined;
    const phoneEntity = entities.find(e => e.type === EntityType.PHONE);
    if (phoneEntity) {
      phone = phoneEntity.value;
    }

    // Extract website
    let website: string | undefined;
    const urlEntity = entities.find(e => e.type === EntityType.URL);
    if (urlEntity) {
      website = urlEntity.value;
    }

    return {
      name: vendorName || 'Unknown Vendor',
      address,
      phone,
      website
    };
  }

  private async extractLineItems(
    text: string, 
    entities: Entity[], 
    blocks: typeof context.rawOCR.blocks
  ): Promise<LineItem[]> {
    const items: LineItem[] = [];
    
    // Look for line item entities first
    const lineItemEntities = entities.filter(e => e.type === EntityType.LINE_ITEM);
    for (const entity of lineItemEntities) {
      if (entity.normalizedValue) {
        items.push({
          description: entity.normalizedValue.description,
          quantity: entity.normalizedValue.quantity || 1,
          unitPrice: entity.normalizedValue.unitPrice,
          totalPrice: entity.normalizedValue.amount,
          category: this.categorizeItem(entity.normalizedValue.description)
        });
      }
    }

    // If no line items found through entities, use pattern matching
    if (items.length === 0) {
      items.push(...this.extractLineItemsFromPattern(text));
    }

    return items;
  }

  private extractLineItemsFromPattern(text: string): LineItem[] {
    const items: LineItem[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and lines that look like headers/footers
      if (!trimmed || this.isHeaderFooterLine(trimmed)) {
        continue;
      }

      // Pattern 1: Description followed by amount
      // Example: "Coffee Large                   $4.50"
      const pattern1 = /^(.+?)\s+\$?(\d+\.?\d*)\s*$/;
      const match1 = trimmed.match(pattern1);
      
      if (match1 && !this.looksLikeTotal(match1[1])) {
        const description = match1[1].trim();
        const price = parseFloat(match1[2]);
        
        if (description.length > 1 && price > 0 && price < 1000) {
          items.push({
            description,
            quantity: 1,
            totalPrice: price,
            category: this.categorizeItem(description)
          });
          continue;
        }
      }

      // Pattern 2: Quantity, Description, Unit Price, Total
      // Example: "2  Coffee Large    $2.25    $4.50"
      const pattern2 = /^(\d+)\s+(.+?)\s+\$?(\d+\.?\d*)\s+\$?(\d+\.?\d*)\s*$/;
      const match2 = trimmed.match(pattern2);
      
      if (match2) {
        const quantity = parseInt(match2[1]);
        const description = match2[2].trim();
        const unitPrice = parseFloat(match2[3]);
        const totalPrice = parseFloat(match2[4]);
        
        items.push({
          description,
          quantity,
          unitPrice,
          totalPrice,
          category: this.categorizeItem(description)
        });
        continue;
      }

      // Pattern 3: Description with @ price
      // Example: "Coffee Large @ $2.25"
      const pattern3 = /^(.+?)\s+@\s+\$?(\d+\.?\d*)\s*$/;
      const match3 = trimmed.match(pattern3);
      
      if (match3) {
        const description = match3[1].trim();
        const unitPrice = parseFloat(match3[2]);
        
        items.push({
          description,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
          category: this.categorizeItem(description)
        });
      }
    }

    return items;
  }

  private async extractTotals(text: string, entities: Entity[]): Promise<ReceiptData['totals']> {
    let subtotal = 0;
    let tax = 0;
    let tip = 0;
    let total = 0;
    let currency = 'USD';

    // Look for total entities
    const totalEntity = entities.find(e => e.type === EntityType.TOTAL);
    if (totalEntity && typeof totalEntity.normalizedValue === 'number') {
      total = totalEntity.normalizedValue;
    }

    // Look for tax entities
    const taxEntity = entities.find(e => e.type === EntityType.TAX);
    if (taxEntity && typeof taxEntity.normalizedValue === 'number') {
      tax = taxEntity.normalizedValue;
    }

    // Pattern matching for amounts
    const amountPatterns = [
      { name: 'subtotal', pattern: /(?:subtotal|sub-total)[\s:]*\$?(\d+\.?\d*)/gi },
      { name: 'tax', pattern: /(?:tax|hst|gst|pst)[\s:]*\$?(\d+\.?\d*)/gi },
      { name: 'tip', pattern: /(?:tip|gratuity)[\s:]*\$?(\d+\.?\d*)/gi },
      { name: 'total', pattern: /(?:total|amount due|balance)[\s:]*\$?(\d+\.?\d*)/gi }
    ];

    for (const { name, pattern } of amountPatterns) {
      const matches = Array.from(text.matchAll(pattern));
      if (matches.length > 0) {
        const value = parseFloat(matches[matches.length - 1][1]); // Use last match
        switch (name) {
          case 'subtotal':
            subtotal = value;
            break;
          case 'tax':
            tax = value;
            break;
          case 'tip':
            tip = value;
            break;
          case 'total':
            total = value;
            break;
        }
      }
    }

    // Detect currency
    if (text.includes('₪') || text.includes('ILS') || text.includes('שקל')) {
      currency = 'ILS';
    } else if (text.includes('€') || text.includes('EUR')) {
      currency = 'EUR';
    } else if (text.includes('£') || text.includes('GBP')) {
      currency = 'GBP';
    }

    // Validate and calculate missing values
    if (subtotal > 0 && tax > 0 && total === 0) {
      total = subtotal + tax + tip;
    } else if (total > 0 && subtotal === 0 && tax > 0) {
      subtotal = total - tax - tip;
    }

    return {
      subtotal,
      tax,
      tip: tip > 0 ? tip : undefined,
      total,
      currency
    };
  }

  private extractPaymentMethod(text: string): string | undefined {
    const paymentMethods = [
      'cash', 'credit', 'debit', 'visa', 'mastercard', 'amex', 'american express',
      'discover', 'paypal', 'apple pay', 'google pay', 'contactless', 'chip'
    ];

    const lowerText = text.toLowerCase();
    
    for (const method of paymentMethods) {
      if (lowerText.includes(method)) {
        return method.charAt(0).toUpperCase() + method.slice(1);
      }
    }

    // Check for card number pattern (partially masked)
    if (/\*{4}\d{4}|\d{4}\*{4}|\*+\d{4}/.test(text)) {
      return 'Credit Card';
    }

    return undefined;
  }

  private extractDate(text: string, entities: Entity[]): Date {
    // Look for date entities first
    const dateEntity = entities.find(e => e.type === EntityType.DATE);
    if (dateEntity && dateEntity.normalizedValue instanceof Date) {
      return dateEntity.normalizedValue;
    }

    // Pattern matching for dates
    const datePatterns = [
      /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/g,
      /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g,
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi
    ];

    for (const pattern of datePatterns) {
      const matches = Array.from(text.matchAll(pattern));
      if (matches.length > 0) {
        try {
          return new Date(matches[0][0]);
        } catch {
          // Continue to next pattern
        }
      }
    }

    // Default to current date if no date found
    return new Date();
  }

  private extractTransactionId(text: string, entities: Entity[]): string | undefined {
    // Look for document number entities
    const docNumEntity = entities.find(e => e.type === EntityType.DOCUMENT_NUMBER);
    if (docNumEntity) {
      return docNumEntity.value;
    }

    // Pattern matching for transaction IDs
    const patterns = [
      /(?:transaction|trans|ref|receipt)[\s#:]*([A-Z0-9-]+)/gi,
      /(?:order|confirmation)[\s#:]*([A-Z0-9-]+)/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  private extractMetadata(text: string, entities: Entity[]): ReceiptData['metadata'] {
    const metadata: ReceiptData['metadata'] = {};

    // Extract cashier info
    const cashierMatch = text.match(/(?:cashier|served by|operator)[\s:]*([A-Za-z\s]+)/i);
    if (cashierMatch) {
      metadata.cashier = cashierMatch[1].trim();
    }

    // Extract register info
    const registerMatch = text.match(/(?:register|reg|terminal)[\s#:]*(\d+)/i);
    if (registerMatch) {
      metadata.register = registerMatch[1];
    }

    // Extract store info
    const storeMatch = text.match(/(?:store|branch|location)[\s#:]*([A-Za-z0-9\s]+)/i);
    if (storeMatch) {
      metadata.store = storeMatch[1].trim();
    }

    return metadata;
  }

  // Helper methods
  private looksLikeAddress(text: string): boolean {
    return /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)/i.test(text);
  }

  private looksLikeAmount(text: string): boolean {
    return /\$?\d+\.?\d*/.test(text);
  }

  private looksLikeDate(text: string): boolean {
    return /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(text);
  }

  private looksLikeTotal(text: string): boolean {
    const totalWords = ['total', 'subtotal', 'tax', 'amount', 'balance', 'due'];
    return totalWords.some(word => text.toLowerCase().includes(word));
  }

  private isHeaderFooterLine(text: string): boolean {
    const headerFooterPatterns = [
      /^={3,}$/, // Lines of equals signs
      /^-{3,}$/, // Lines of dashes
      /thank you/i,
      /visit us/i,
      /customer copy/i,
      /merchant copy/i
    ];

    return headerFooterPatterns.some(pattern => pattern.test(text));
  }

  private categorizeItem(description: string): string | undefined {
    const categories = new Map([
      ['food', ['coffee', 'sandwich', 'burger', 'pizza', 'salad', 'soup', 'meal']],
      ['beverage', ['drink', 'soda', 'juice', 'water', 'tea', 'latte', 'cappuccino']],
      ['retail', ['shirt', 'pants', 'shoes', 'jacket', 'accessories']],
      ['grocery', ['milk', 'bread', 'eggs', 'cheese', 'meat', 'vegetables', 'fruit']],
      ['service', ['service', 'fee', 'charge', 'delivery', 'shipping']]
    ]);

    const lowerDesc = description.toLowerCase();
    
    for (const [category, keywords] of categories) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }

    return undefined;
  }

  async validate(data: ReceiptData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    // Validate vendor
    if (!data.vendor.name || data.vendor.name === 'Unknown Vendor') {
      warnings.push('Vendor name not found');
      confidence -= 0.1;
    }

    // Validate totals
    if (data.totals.total <= 0) {
      errors.push('Total amount must be greater than 0');
      confidence -= 0.3;
    }

    // Validate total calculation
    const calculatedTotal = data.totals.subtotal + data.totals.tax + (data.totals.tip || 0);
    if (data.totals.subtotal > 0 && Math.abs(calculatedTotal - data.totals.total) > 0.1) {
      warnings.push('Total amount does not match subtotal + tax + tip');
      confidence -= 0.1;
      suggestions.push('Verify the calculation of total amount');
    }

    // Validate items
    if (data.items.length === 0) {
      warnings.push('No line items found');
      confidence -= 0.2;
      suggestions.push('Consider manual review for missing items');
    }

    // Validate date
    const now = new Date();
    const receiptDate = data.date;
    if (receiptDate > now) {
      warnings.push('Receipt date is in the future');
      confidence -= 0.1;
    }

    // Calculate overall confidence
    const validationScore = Math.max(0, confidence);

    return {
      isValid: errors.length === 0,
      confidence: validationScore,
      errors,
      warnings,
      suggestions
    };
  }
}