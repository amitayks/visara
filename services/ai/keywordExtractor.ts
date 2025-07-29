export class KeywordExtractor {
  // Common stop words to filter out
  private stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were',
    'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'to',
    'of', 'in', 'for', 'with', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'it', 'its', 'itself',
    'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'whose', 'if', 'or',
    'because', 'until', 'while', 'by', 'via', 'per', 'upon'
  ]);

  // Date patterns for various formats
  private datePatterns = [
    // ISO formats
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{4}\/\d{2}\/\d{2}\b/g,
    
    // US formats (MM/DD/YYYY, MM-DD-YYYY)
    /\b(?:0[1-9]|1[0-2])[\/-](?:0[1-9]|[12]\d|3[01])[\/-](?:19|20)\d{2}\b/g,
    
    // European formats (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY)
    /\b(?:0[1-9]|[12]\d|3[01])([\/\-\.])(?:0[1-9]|1[0-2])\1(?:19|20)\d{2}\b/g,
    
    // Written formats (January 1, 2024 or Jan 1, 2024)
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi,
    
    // Relative dates
    /\b(?:today|yesterday|tomorrow)\b/gi,
  ];

  extractKeywords(text: string, limit: number = 20): string[] {
    if (!text) return [];

    // Convert to lowercase and split into words
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2); // Filter short words

    // Count word frequency
    const wordFreq = new Map<string, number>();
    
    for (const word of words) {
      if (!this.stopWords.has(word) && isNaN(Number(word))) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    // Extract special keywords
    const specialKeywords = this.extractSpecialKeywords(text);
    
    // Sort by frequency and get top keywords
    const sortedWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit - specialKeywords.length)
      .map(([word]) => word);

    // Combine and deduplicate
    return [...new Set([...specialKeywords, ...sortedWords])];
  }

  private extractSpecialKeywords(text: string): string[] {
    const keywords: string[] = [];

    // Extract amounts with currency
    const amountPattern = /(?:[$€£¥₹₪]|USD|EUR|GBP|NIS|ILS)\s*[\d,]+\.?\d*/gi;
    const amounts = text.match(amountPattern) || [];
    keywords.push(...amounts.map(a => a.trim()));

    // Extract phone numbers
    const phonePattern = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;
    const phones = text.match(phonePattern) || [];
    keywords.push(...phones.filter(p => p.length >= 10));

    // Extract email addresses
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailPattern) || [];
    keywords.push(...emails);

    // Extract invoice/order numbers
    const numberPattern = /\b(?:invoice|order|receipt|ref|reference|bill|no\.?|#)\s*:?\s*[\w-]+\b/gi;
    const numbers = text.match(numberPattern) || [];
    keywords.push(...numbers.map(n => n.trim()));

    // Extract company names (capitalized words)
    const companyPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|LLC|Ltd|Corp|Company|Co\.?)\b/g;
    const companies = text.match(companyPattern) || [];
    keywords.push(...companies);

    return keywords;
  }

  extractDocumentDate(text: string): Date | null {
    if (!text) return null;

    // Check for "today", "yesterday", "tomorrow"
    const lowerText = text.toLowerCase();
    const today = new Date();
    
    if (lowerText.includes('today')) {
      return today;
    } else if (lowerText.includes('yesterday')) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    } else if (lowerText.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    // Try each date pattern
    for (const pattern of this.datePatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Try to parse the first match
        const dateStr = matches[0];
        const parsedDate = this.parseDate(dateStr);
        if (parsedDate && !isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }

    return null;
  }

  private parseDate(dateStr: string): Date | null {
    try {
      // Direct parse attempt
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date;
      }

      // Try different formats manually
      // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      const ddmmyyyy = dateStr.match(/(\d{1,2})([\/\-\.])(\d{1,2})\2(\d{4})/);
      if (ddmmyyyy) {
        const [_, day, separator, month, year] = ddmmyyyy;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      // MM/DD/YYYY or MM-DD-YYYY
      const mmddyyyy = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if (mmddyyyy) {
        const [_, month, day, year] = mmddyyyy;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      // Month name formats
      const monthNames = {
        'january': 0, 'jan': 0,
        'february': 1, 'feb': 1,
        'march': 2, 'mar': 2,
        'april': 3, 'apr': 3,
        'may': 4,
        'june': 5, 'jun': 5,
        'july': 6, 'jul': 6,
        'august': 7, 'aug': 7,
        'september': 8, 'sep': 8, 'sept': 8,
        'october': 9, 'oct': 9,
        'november': 10, 'nov': 10,
        'december': 11, 'dec': 11
      };

      // "January 1, 2024" or "1 January 2024"
      const writtenDate = dateStr.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})|(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (writtenDate) {
        let day, month, year;
        if (writtenDate[1]) {
          // "1 January 2024" format
          day = parseInt(writtenDate[1]);
          month = monthNames[writtenDate[2] as keyof typeof monthNames];
          year = parseInt(writtenDate[3]);
        } else {
          // "January 1, 2024" format
          month = monthNames[writtenDate[4] as keyof typeof monthNames];
          day = parseInt(writtenDate[5]);
          year = parseInt(writtenDate[6]);
        }
        
        if (month !== undefined) {
          return new Date(year, month, day);
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing date:', dateStr, error);
      return null;
    }
  }

  // Simple vector generation for similarity search (using TF-IDF-like approach)
  generateSearchVector(text: string, keywords: string[]): number[] {
    if (!text) return [];

    // Create a simple vector based on keyword presence and frequency
    const vector: number[] = [];
    const lowerText = text.toLowerCase();
    
    // Use top 50 most common document-related terms as features
    const features = [
      'receipt', 'invoice', 'bill', 'payment', 'total', 'amount', 'date', 'tax',
      'subtotal', 'paid', 'due', 'order', 'customer', 'vendor', 'service', 'product',
      'price', 'quantity', 'discount', 'shipping', 'address', 'phone', 'email',
      'reference', 'number', 'cash', 'credit', 'card', 'bank', 'transfer',
      'id', 'license', 'passport', 'form', 'application', 'signature', 'document',
      'certificate', 'contract', 'agreement', 'letter', 'statement', 'report',
      'purchase', 'sale', 'transaction', 'balance', 'account', 'item', 'fee'
    ];

    // Calculate TF for each feature
    for (const feature of features) {
      const count = (lowerText.match(new RegExp(`\\b${feature}\\b`, 'gi')) || []).length;
      const tf = count > 0 ? 1 + Math.log(count) : 0;
      vector.push(tf);
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return vector.map(val => val / magnitude);
    }

    return vector;
  }
}

export const keywordExtractor = new KeywordExtractor();