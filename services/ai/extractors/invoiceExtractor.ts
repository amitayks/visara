import { DocumentType, EntityType } from '../types/hybridTypes';
import type {
  DocumentExtractor,
  ContextualResult,
  InvoiceData,
  ValidationResult,
  Entity,
  LineItem
} from '../types/hybridTypes';

export class InvoiceExtractor implements DocumentExtractor<InvoiceData> {
  async initialize?(): Promise<void> {
    console.log('Invoice extractor initialized');
  }

  canHandle(documentType: DocumentType): boolean {
    return documentType === DocumentType.INVOICE;
  }

  async extract(context: ContextualResult): Promise<InvoiceData> {
    console.log('Extracting invoice data...');
    
    const text = context.rawOCR?.text || '';
    const entities = context.context?.entities || [];

    return {
      invoiceNumber: this.extractInvoiceNumber(text, entities),
      issueDate: this.extractIssueDate(text, entities),
      dueDate: this.extractDueDate(text, entities),
      vendor: this.extractVendor(text, entities),
      customer: this.extractCustomer(text, entities),
      items: this.extractLineItems(text, entities),
      totals: this.extractTotals(text, entities),
      paymentTerms: this.extractPaymentTerms(text),
      notes: this.extractNotes(text)
    };
  }

  private extractInvoiceNumber(text: string, entities: Entity[]): string {
    // Look for document number entities first
    const docNumEntity = entities.find(e => e.type === EntityType.DOCUMENT_NUMBER);
    if (docNumEntity) {
      return docNumEntity.value;
    }

    // Pattern matching for invoice numbers
    const patterns = [
      /invoice\s*(?:number|#|no)[\s:]*([A-Z0-9-]+)/gi,
      /inv[\s#:]*([A-Z0-9-]+)/gi,
      /(?:^|\n)([A-Z0-9]{3,})\s*(?:invoice|inv)/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return 'Unknown';
  }

  private extractIssueDate(text: string, entities: Entity[]): Date {
    // Look for date entities
    const dateEntities = entities.filter(e => e.type === EntityType.DATE);
    
    // Find invoice date specifically
    const invoiceDatePattern = /(?:invoice\s+date|date\s+of\s+invoice|issued)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/gi;
    const match = text.match(invoiceDatePattern);
    
    if (match) {
      try {
        return new Date(match[1]);
      } catch {
        // Continue to other methods
      }
    }

    // Use first date entity as fallback
    if (dateEntities.length > 0 && dateEntities[0].normalizedValue instanceof Date) {
      return dateEntities[0].normalizedValue;
    }

    return new Date(); // Default to current date
  }

  private extractDueDate(text: string, entities: Entity[]): Date | undefined {
    const dueDatePattern = /(?:due\s+date|payment\s+due)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/gi;
    const match = text.match(dueDatePattern);
    
    if (match) {
      try {
        return new Date(match[1]);
      } catch {
        // Continue to other methods
      }
    }

    // Look for "Net X days" terms to calculate due date
    const netTermsPattern = /net\s+(\d+)\s+days?/gi;
    const netMatch = text.match(netTermsPattern);
    
    if (netMatch) {
      const days = parseInt(netMatch[1]);
      const issueDate = this.extractIssueDate(text, entities);
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + days);
      return dueDate;
    }

    return undefined;
  }

  private extractVendor(text: string, entities: Entity[]): InvoiceData['vendor'] {
    // Look for organization entity
    const orgEntity = entities.find(e => e.type === EntityType.ORGANIZATION);
    
    // Extract vendor from "From:" or "Bill From:" sections
    const fromPattern = /(?:from|bill\s+from)[\s:]*\n?([^\n]+(?:\n[^\n]*)*?)(?:\n\s*\n|bill\s+to|customer|total)/gi;
    const fromMatch = text.match(fromPattern);
    
    let vendorBlock = '';
    if (fromMatch && fromMatch[1]) {
      vendorBlock = fromMatch[1].trim();
    } else if (orgEntity && orgEntity.value) {
      vendorBlock = orgEntity.value;
    } else {
      // Use first few lines as vendor info
      const lines = text.split('\n').slice(0, 5);
      vendorBlock = lines.join('\n');
    }

    return this.parseBusinessInfo(vendorBlock, 'vendor');
  }

  private extractCustomer(text: string, entities: Entity[]): InvoiceData['customer'] {
    // Extract customer from "Bill To:" section
    const billToPattern = /(?:bill\s+to|customer|ship\s+to)[\s:]*\n?([^\n]+(?:\n[^\n]*)*?)(?:\n\s*\n|invoice|total|items?)/gi;
    const billToMatch = text.match(billToPattern);
    
    let customerBlock = '';
    if (billToMatch && billToMatch[1]) {
      customerBlock = billToMatch[1].trim();
    }

    return this.parseBusinessInfo(customerBlock, 'customer');
  }

  private parseBusinessInfo(infoBlock: string, type: 'vendor' | 'customer'): InvoiceData['vendor'] | InvoiceData['customer'] {
    const lines = infoBlock.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let name = '';
    let address = '';
    let taxId: string | undefined;
    let phone: string | undefined;
    let email: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // First non-address line is usually the name
      if (i === 0 || (!name && !this.looksLikeAddress(line))) {
        name = line;
        continue;
      }

      // Extract tax ID
      const taxIdMatch = line.match(/(?:tax\s+id|vat|ein|ssn)[\s:]*([A-Z0-9-]+)/gi);
      if (taxIdMatch) {
        taxId = taxIdMatch[1];
        continue;
      }

      // Extract phone
      const phoneMatch = line.match(/(?:\+\d{1,3}\s?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        phone = phoneMatch[0];
        continue;
      }

      // Extract email
      const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        email = emailMatch[0];
        continue;
      }

      // Everything else is address
      if (address) {
        address += '\n' + line;
      } else {
        address = line;
      }
    }

    const result: InvoiceData['vendor'] = {
      name: name || 'Unknown',
      address: address || '',
      taxId,
      contact: {}
    };

    if (phone) result.contact!.phone = phone;
    if (email) result.contact!.email = email;

    return result;
  }

  private extractLineItems(text: string, entities: Entity[]): LineItem[] {
    const items: LineItem[] = [];
    
    // Look for line item entities first
    const lineItemEntities = entities.filter(e => e.type === EntityType.LINE_ITEM);
    for (const entity of lineItemEntities) {
      if (entity.normalizedValue) {
        items.push({
          description: entity.normalizedValue.description,
          quantity: entity.normalizedValue.quantity || 1,
          unitPrice: entity.normalizedValue.unitPrice,
          totalPrice: entity.normalizedValue.amount
        });
      }
    }

    // If no line items found, extract from patterns
    if (items.length === 0) {
      items.push(...this.extractLineItemsFromPattern(text));
    }

    return items;
  }

  private extractLineItemsFromPattern(text: string): LineItem[] {
    const items: LineItem[] = [];
    const lines = text.split('\n');

    // Look for table-like structure
    let inItemSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect start of items section
      if (/(?:description|item|product|service).*(?:qty|quantity|price|amount)/i.test(trimmed)) {
        inItemSection = true;
        continue;
      }

      // Detect end of items section
      if (inItemSection && /(?:subtotal|total|tax|amount due)/i.test(trimmed)) {
        inItemSection = false;
        continue;
      }

      if (inItemSection) {
        const item = this.parseInvoiceLineItem(trimmed);
        if (item) {
          items.push(item);
        }
      }
    }

    return items;
  }

  private parseInvoiceLineItem(line: string): LineItem | null {
    // Pattern 1: Description Qty UnitPrice Total
    // Example: "Web Development Services    5    $100.00    $500.00"
    const pattern1 = /^(.+?)\s+(\d+)\s+\$?(\d+\.?\d*)\s+\$?(\d+\.?\d*)\s*$/;
    const match1 = line.match(pattern1);
    
    if (match1) {
      return {
        description: match1[1].trim(),
        quantity: parseInt(match1[2]),
        unitPrice: parseFloat(match1[3]),
        totalPrice: parseFloat(match1[4])
      };
    }

    // Pattern 2: Description followed by total amount
    // Example: "Consulting Services                    $1,500.00"
    const pattern2 = /^(.+?)\s+\$?([\d,]+\.?\d*)\s*$/;
    const match2 = line.match(pattern2);
    
    if (match2 && !this.looksLikeTotal(match2[1])) {
      const totalPrice = parseFloat(match2[2].replace(/,/g, ''));
      return {
        description: match2[1].trim(),
        quantity: 1,
        totalPrice
      };
    }

    return null;
  }

  private extractTotals(text: string, entities: Entity[]): InvoiceData['totals'] {
    let subtotal = 0;
    let tax = 0;
    let total = 0;
    let currency = 'USD';

    // Look for total entities
    const totalEntity = entities.find(e => e.type === EntityType.TOTAL);
    if (totalEntity && typeof totalEntity.normalizedValue === 'number') {
      total = totalEntity.normalizedValue;
    }

    // Pattern matching for amounts
    const amountPatterns = [
      { name: 'subtotal', pattern: /(?:subtotal|sub-total|net amount)[\s:]*\$?([\d,]+\.?\d*)/gi },
      { name: 'tax', pattern: /(?:tax|vat|gst|hst)[\s:]*\$?([\d,]+\.?\d*)/gi },
      { name: 'total', pattern: /(?:total|amount due|balance|grand total)[\s:]*\$?([\d,]+\.?\d*)/gi }
    ];

    for (const { name, pattern } of amountPatterns) {
      const matches = Array.from(text.matchAll(pattern));
      if (matches.length > 0) {
        const value = parseFloat(matches[matches.length - 1][1].replace(/,/g, ''));
        switch (name) {
          case 'subtotal':
            subtotal = value;
            break;
          case 'tax':
            tax = value;
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

    return {
      subtotal,
      tax,
      total,
      currency
    };
  }

  private extractPaymentTerms(text: string): string | undefined {
    const patterns = [
      /(?:payment terms?|terms?)[\s:]*([^\n.]+)/gi,
      /(?:net \d+ days?|due (?:on receipt|upon receipt|immediately))/gi,
      /(?:cash on delivery|cod|prepaid|credit card only)/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    return undefined;
  }

  private extractNotes(text: string): string | undefined {
    const patterns = [
      /(?:notes?|comments?|remarks?)[\s:]*([^\n]+(?:\n[^\n]*)*?)(?:\n\s*\n|$)/gi,
      /(?:terms and conditions?)[\s:]*([^\n]+(?:\n[^\n]*)*?)(?:\n\s*\n|$)/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  // Helper methods
  private looksLikeAddress(text: string): boolean {
    return /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)/i.test(text) ||
           /\d{5}(?:-\d{4})?/.test(text) || // ZIP code
           /[A-Z]{2}\s+\d{5}/.test(text); // State ZIP
  }

  private looksLikeTotal(text: string): boolean {
    const totalWords = ['total', 'subtotal', 'tax', 'amount', 'balance', 'due', 'net', 'gross'];
    return totalWords.some(word => text.toLowerCase().includes(word));
  }

  async validate(data: InvoiceData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;

    // Validate invoice number
    if (!data.invoiceNumber || data.invoiceNumber === 'Unknown') {
      warnings.push('Invoice number not found');
      confidence -= 0.1;
    }

    // Validate vendor
    if (!data.vendor.name || data.vendor.name === 'Unknown') {
      errors.push('Vendor name is required');
      confidence -= 0.2;
    }

    if (!data.vendor.address) {
      warnings.push('Vendor address not found');
      confidence -= 0.1;
    }

    // Validate customer
    if (!data.customer.name || data.customer.name === 'Unknown') {
      warnings.push('Customer information not found');
      confidence -= 0.1;
    }

    // Validate totals
    if (data.totals.total <= 0) {
      errors.push('Total amount must be greater than 0');
      confidence -= 0.3;
    }

    // Validate total calculation
    const calculatedTotal = data.totals.subtotal + data.totals.tax;
    if (data.totals.subtotal > 0 && Math.abs(calculatedTotal - data.totals.total) > 0.1) {
      warnings.push('Total amount does not match subtotal + tax');
      confidence -= 0.1;
      suggestions.push('Verify the calculation of total amount');
    }

    // Validate dates
    if (data.dueDate && data.dueDate < data.issueDate) {
      warnings.push('Due date is before issue date');
      confidence -= 0.1;
    }

    // Validate items
    if (data.items.length === 0) {
      warnings.push('No line items found');
      confidence -= 0.2;
      suggestions.push('Consider manual review for missing items');
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