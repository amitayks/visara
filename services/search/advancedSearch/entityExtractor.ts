import { 
  ExtractedEntity, 
  AmountFilter, 
  DocumentType,
  AMOUNT_OPERATORS,
  CURRENCY_SYMBOLS,
  DOCUMENT_TYPE_KEYWORDS
} from './searchTypes';

export class EntityExtractor {
  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const normalizedText = text.toLowerCase();

    // Extract vendors
    const vendors = this.extractVendors(normalizedText);
    entities.push(...vendors);

    // Extract amounts
    const amounts = this.extractAmounts(normalizedText);
    entities.push(...amounts);

    // Extract document types
    const documentTypes = this.extractDocumentTypes(normalizedText);
    entities.push(...documentTypes);

    // Extract keywords
    const keywords = this.extractKeywords(normalizedText);
    entities.push(...keywords);

    // Extract count/limit
    const count = this.extractCount(normalizedText);
    if (count) entities.push(count);

    return entities;
  }

  private extractVendors(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Pattern 1: Quoted strings (e.g., "Walmart", 'Amazon')
    const quotedPattern = /["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = quotedPattern.exec(text)) !== null) {
      entities.push({
        type: 'vendor',
        value: match[1],
        confidence: 0.9,
        originalText: match[0]
      });
    }

    // Pattern 2: "from <vendor>" patterns
    const fromPatterns = [
      /from\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g,
      /at\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g,
      /מ([א-ת]+(?:\s+[א-ת]+)*)/g,
      /ב([א-ת]+(?:\s+[א-ת]+)*)/g,
    ];

    for (const pattern of fromPatterns) {
      const originalText = text; // Keep original for proper case extraction
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(originalText)) !== null) {
        if (match[1] && !this.isCommonWord(match[1].toLowerCase())) {
          entities.push({
            type: 'vendor',
            value: match[1],
            confidence: 0.7,
            originalText: match[0]
          });
        }
      }
    }

    // Pattern 3: Known vendor patterns (could be extended with a vendor database)
    const knownVendors = [
      'walmart', 'amazon', 'target', 'costco', 'home depot', 'lowes',
      'cvs', 'walgreens', 'starbucks', 'mcdonalds', 'uber', 'lyft',
      'google', 'apple', 'microsoft', 'netflix', 'spotify'
    ];

    for (const vendor of knownVendors) {
      if (text.includes(vendor)) {
        // Find the original case version
        const regex = new RegExp(`\\b${vendor}\\b`, 'gi');
        const vendorMatch = text.match(regex);
        if (vendorMatch) {
          entities.push({
            type: 'vendor',
            value: vendorMatch[0],
            confidence: 0.95,
            originalText: vendorMatch[0]
          });
        }
      }
    }

    // Pattern 4: Capitalized words that might be vendor names
    const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const originalText = text;
    while ((match = capitalizedPattern.exec(originalText)) !== null) {
      // Check if it's not already identified and not a common word
      const alreadyFound = entities.some(e => 
        e.type === 'vendor' && e.value === match![1]
      );
      
      if (!alreadyFound && !this.isDocumentType(match[1].toLowerCase()) && 
          !this.isCommonWord(match[1].toLowerCase()) && match[1].length > 2) {
        entities.push({
          type: 'vendor',
          value: match[1],
          confidence: 0.5,
          originalText: match[0]
        });
      }
    }

    return entities;
  }

  private extractAmounts(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Pattern for currency amounts
    const amountPatterns = [
      /(\$|€|£|₪)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(\$|€|£|₪|USD|EUR|GBP|ILS|NIS)/g,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(dollar|euro|pound|shekel|שקל)/gi,
    ];

    for (const pattern of amountPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const amount = this.parseAmount(match[1], match[2]);
        if (amount) {
          entities.push({
            type: 'amount',
            value: amount.value,
            confidence: 0.9,
            originalText: match[0]
          });
        }
      }
    }

    // Extract amount with operators
    const operatorPatterns = [
      /(over|above|more than|greater than|>)\s*(\$|€|£|₪)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
      /(under|below|less than|<)\s*(\$|€|£|₪)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
      /between\s*(\$|€|£|₪)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*and\s*(\$|€|£|₪)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
    ];

    for (const pattern of operatorPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type: 'amount',
          value: this.extractNumericValue(match[match.length - 1]),
          confidence: 0.85,
          originalText: match[0]
        });
      }
    }

    return entities;
  }

  extractAmountFilter(text: string): AmountFilter | null {
    const normalizedText = text.toLowerCase();
    
    // Check for "between" operator
    const betweenPattern = /between\s*(\$|€|£|₪)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*and\s*(\$|€|£|₪)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
    const betweenMatch = normalizedText.match(betweenPattern);
    if (betweenMatch) {
      const minValue = this.extractNumericValue(betweenMatch[2]);
      const maxValue = this.extractNumericValue(betweenMatch[4]);
      const currency = this.extractCurrency(betweenMatch[1] || betweenMatch[3]);
      
      return {
        value: minValue,
        maxValue,
        operator: 'between',
        currency
      };
    }

    // Check for other operators
    for (const [operator, keywords] of Object.entries(AMOUNT_OPERATORS)) {
      if (operator === 'between') continue; // Already handled
      
      for (const keyword of keywords) {
        const pattern = new RegExp(
          `${keyword}\\s*(\\$|€|£|₪)?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)`,
          'i'
        );
        const match = normalizedText.match(pattern);
        if (match) {
          const value = this.extractNumericValue(match[2]);
          const currency = this.extractCurrency(match[1]);
          
          return {
            value,
            operator: operator as 'equals' | 'greater' | 'less',
            currency,
            tolerance: operator === 'equals' ? 0.01 : undefined
          };
        }
      }
    }

    // Check for plain amounts (default to equals)
    const plainAmountPattern = /(\$|€|£|₪)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/;
    const plainMatch = normalizedText.match(plainAmountPattern);
    if (plainMatch) {
      const value = this.extractNumericValue(plainMatch[2]);
      const currency = this.extractCurrency(plainMatch[1]);
      
      return {
        value,
        operator: 'equals',
        currency,
        tolerance: 0.01
      };
    }

    return null;
  }

  private extractDocumentTypes(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    for (const [type, keywords] of Object.entries(DOCUMENT_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          entities.push({
            type: 'documentType',
            value: type as DocumentType,
            confidence: 0.9,
            originalText: keyword
          });
          break; // Only add each type once
        }
      }
    }

    // Check for plural forms
    const pluralMappings: Record<string, DocumentType> = {
      'receipts': 'receipt',
      'invoices': 'invoice',
      'forms': 'form',
      'letters': 'letter',
      'contracts': 'contract',
      'קבלות': 'receipt',
      'חשבוניות': 'invoice',
      'טפסים': 'form',
      'מכתבים': 'letter',
      'חוזים': 'contract',
    };

    for (const [plural, type] of Object.entries(pluralMappings)) {
      if (text.includes(plural)) {
        const exists = entities.some(e => 
          e.type === 'documentType' && e.value === type
        );
        if (!exists) {
          entities.push({
            type: 'documentType',
            value: type,
            confidence: 0.9,
            originalText: plural
          });
        }
      }
    }

    return entities;
  }

  private extractKeywords(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Remove common words and already extracted entities
    const words = text.split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isCommonWord(word))
      .filter(word => !this.isOperator(word));

    // Extract significant keywords
    const significantWords = words.filter(word => {
      // Check if it's a noun or important term
      return /^[A-Z]/.test(word) || // Capitalized
             word.length > 5 ||        // Longer words
             /[א-ת]+/.test(word);      // Hebrew words
    });

    for (const word of significantWords.slice(0, 5)) { // Limit to 5 keywords
      entities.push({
        type: 'keyword',
        value: word,
        confidence: 0.6,
        originalText: word
      });
    }

    return entities;
  }

  private extractCount(text: string): ExtractedEntity | null {
    // Extract limit/count patterns
    const countPatterns = [
      /(?:show|display|get)\s+(?:me\s+)?(?:the\s+)?(?:last|first|top)\s+(\d+)/i,
      /(?:last|first|top)\s+(\d+)/i,
      /limit\s+(?:to\s+)?(\d+)/i,
      /(\d+)\s+(?:results?|documents?|items?)/i,
    ];

    for (const pattern of countPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          type: 'count',
          value: parseInt(match[1], 10),
          confidence: 0.9,
          originalText: match[0]
        };
      }
    }

    return null;
  }

  extractVendorNames(text: string): string[] {
    const vendors = this.extractVendors(text);
    return vendors
      .filter(e => e.confidence > 0.6)
      .map(e => String(e.value));
  }

  extractDocumentTypesList(text: string): DocumentType[] {
    const types = this.extractDocumentTypes(text);
    return types.map(e => e.value as DocumentType);
  }

  private parseAmount(part1: string, part2: string): { value: number; currency?: string } | null {
    let value: number;
    let currency: string | undefined;

    // Determine which part is the amount and which is the currency
    if (/^\d/.test(part1)) {
      value = this.extractNumericValue(part1);
      currency = this.extractCurrency(part2);
    } else {
      value = this.extractNumericValue(part2);
      currency = this.extractCurrency(part1);
    }

    if (!isNaN(value)) {
      return { value, currency };
    }

    return null;
  }

  private extractNumericValue(text: string): number {
    // Remove currency symbols and commas, then parse
    const cleanedText = text.replace(/[$€£₪,]/g, '');
    return parseFloat(cleanedText) || 0;
  }

  private extractCurrency(text: string | undefined): string | undefined {
    if (!text) return undefined;

    for (const [currency, symbols] of Object.entries(CURRENCY_SYMBOLS)) {
      for (const symbol of symbols) {
        if (text.includes(symbol)) {
          return currency;
        }
      }
    }

    return undefined;
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'about', 'as', 'is', 'was', 'are', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
      'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
      'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'show', 'me',
      'get', 'find', 'search', 'look', 'display'
    ];

    return commonWords.includes(word.toLowerCase());
  }

  private isOperator(word: string): boolean {
    const operators = [
      'over', 'under', 'above', 'below', 'between', 'greater', 'less',
      'more', 'than', 'equals', 'exactly', 'from', 'to', 'and'
    ];

    return operators.includes(word.toLowerCase());
  }

  private isDocumentType(word: string): boolean {
    const allKeywords = Object.values(DOCUMENT_TYPE_KEYWORDS).flat();
    return allKeywords.some(keyword => 
      keyword.toLowerCase() === word.toLowerCase()
    );
  }

  mergeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    // Merge duplicate entities and boost confidence
    const merged = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.value}`;
      const existing = merged.get(key);
      
      if (existing) {
        // Boost confidence for duplicates
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      } else {
        merged.set(key, { ...entity });
      }
    }

    return Array.from(merged.values());
  }
}