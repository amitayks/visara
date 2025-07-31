import type { MultilingualText, LanguageResult, TextBlock } from '../types/hybridTypes';

export class MultilingualProcessor {
  private languageModels = new Map<string, LanguageProcessor>();
  private initialized = false;

  constructor() {
    // Register language processors
    this.languageModels.set('en', new EnglishProcessor());
    this.languageModels.set('he', new HebrewProcessor());
    this.languageModels.set('ar', new ArabicProcessor());
    this.languageModels.set('ru', new RussianProcessor());
    this.languageModels.set('zh', new ChineseProcessor());
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize all language processors
    const initPromises = Array.from(this.languageModels.values()).map(processor => 
      processor.initialize()
    );

    await Promise.all(initPromises);
    this.initialized = true;
    console.log('Multilingual processor initialized');
  }

  async processMultilingual(text: string, blocks: TextBlock[]): Promise<MultilingualText> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Detect languages present in the text
    const detectedLanguages = await this.detectLanguages(text);
    const primaryLanguage = detectedLanguages.length > 0 ? detectedLanguages[0].language : 'en';

    // Segment text by language
    const segments = await this.segmentByLanguage(text, blocks, detectedLanguages);

    // Process each segment with appropriate language processor
    const processedSegments = await Promise.all(
      segments.map(async segment => {
        const processor = this.languageModels.get(segment.language);
        if (processor) {
          return await processor.processSegment(segment);
        }
        return segment; // Return unchanged if no processor available
      })
    );

    return {
      segments: processedSegments,
      primaryLanguage,
      detectedLanguages: detectedLanguages.map(lang => lang.language)
    };
  }

  async detectLanguages(text: string): Promise<LanguageResult[]> {
    const results: LanguageResult[] = [];

    // Hebrew detection
    const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
    if (hebrewChars > 0) {
      results.push({
        language: 'he',
        confidence: Math.min(0.95, hebrewChars / text.length * 2),
        script: 'hebrew',
        direction: 'rtl'
      });
    }

    // Arabic detection
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    if (arabicChars > 0) {
      results.push({
        language: 'ar',
        confidence: Math.min(0.95, arabicChars / text.length * 2),
        script: 'arabic',
        direction: 'rtl'
      });
    }

    // English/Latin detection
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    if (latinChars > 0) {
      results.push({
        language: 'en',
        confidence: Math.min(0.9, latinChars / text.length * 1.5),
        script: 'latin',
        direction: 'ltr'
      });
    }

    // Russian detection (Cyrillic)
    const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) || []).length;
    if (cyrillicChars > 0) {
      results.push({
        language: 'ru',
        confidence: Math.min(0.9, cyrillicChars / text.length * 2),
        script: 'cyrillic',
        direction: 'ltr'
      });
    }

    // Chinese detection
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    if (chineseChars > 0) {
      results.push({
        language: 'zh',
        confidence: Math.min(0.95, chineseChars / text.length * 2),
        script: 'cjk',
        direction: 'ltr'
      });
    }

    // Sort by confidence
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private async segmentByLanguage(
    text: string, 
    blocks: TextBlock[], 
    detectedLanguages: LanguageResult[]
  ): Promise<MultilingualText['segments']> {
    const segments: MultilingualText['segments'] = [];

    for (const block of blocks) {
      const blockLanguages = await this.detectLanguages(block.text);
      const primaryLang = blockLanguages.length > 0 ? blockLanguages[0] : detectedLanguages[0];

      segments.push({
        text: block.text,
        language: primaryLang?.language || 'en',
        boundingBox: block.boundingBox,
        direction: primaryLang?.direction || 'ltr'
      });
    }

    return segments;
  }

  // Handle RTL languages specifically
  async processRTL(segments: MultilingualText['segments']): Promise<MultilingualText['segments']> {
    return segments.map(segment => {
      if (segment.direction === 'rtl') {
        // Apply RTL-specific processing
        const processor = this.languageModels.get(segment.language);
        if (processor && processor instanceof HebrewProcessor) {
          return (processor as HebrewProcessor).processRTL(segment);
        }
      }
      return segment;
    });
  }

  // Handle LTR languages
  async processLTR(segments: MultilingualText['segments']): Promise<MultilingualText['segments']> {
    return segments.map(segment => {
      if (segment.direction === 'ltr') {
        const processor = this.languageModels.get(segment.language);
        if (processor) {
          // Apply LTR-specific processing
          return processor.processLTR(segment);
        }
      }
      return segment;
    });
  }
}

// Base language processor interface
abstract class LanguageProcessor {
  abstract initialize(): Promise<void>;
  abstract processSegment(segment: MultilingualText['segments'][0]): Promise<MultilingualText['segments'][0]>;
  abstract processLTR(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0];
}

// English processor
class EnglishProcessor extends LanguageProcessor {
  async initialize(): Promise<void> {
    // Initialize English-specific resources
  }

  async processSegment(segment: MultilingualText['segments'][0]): Promise<MultilingualText['segments'][0]> {
    return {
      ...segment,
      text: this.normalizeEnglish(segment.text)
    };
  }

  processLTR(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0] {
    return segment; // English is already LTR
  }

  private normalizeEnglish(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

// Hebrew processor
class HebrewProcessor extends LanguageProcessor {
  async initialize(): Promise<void> {
    // Initialize Hebrew-specific resources
  }

  async processSegment(segment: MultilingualText['segments'][0]): Promise<MultilingualText['segments'][0]> {
    return {
      ...segment,
      text: this.normalizeHebrew(segment.text),
      direction: 'rtl'
    };
  }

  processLTR(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0] {
    return segment; // Hebrew is RTL, no LTR processing needed
  }

  processRTL(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0] {
    return {
      ...segment,
      text: this.normalizeHebrew(segment.text)
    };
  }

  private normalizeHebrew(text: string): string {
    return text
      // Normalize Hebrew characters
      .replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, '') // Remove diacritics
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractHebrewNumerals(text: string): Array<{ value: number; text: string }> {
    const results: Array<{ value: number; text: string }> = [];
    
    // Hebrew numeral patterns
    const patterns = [
      { pattern: /א׳/g, value: 1 },
      { pattern: /ב׳/g, value: 2 },
      { pattern: /ג׳/g, value: 3 },
      { pattern: /ד׳/g, value: 4 },
      { pattern: /ה׳/g, value: 5 },
      { pattern: /ו׳/g, value: 6 },
      { pattern: /ז׳/g, value: 7 },
      { pattern: /ח׳/g, value: 8 },
      { pattern: /ט׳/g, value: 9 },
      { pattern: /י׳/g, value: 10 }
    ];

    for (const { pattern, value } of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        results.push({
          value,
          text: match[0]
        });
      }
    }

    return results;
  }

  parseHebrewDates(text: string): Date[] {
    const dates: Date[] = [];
    
    // Hebrew month names
    const hebrewMonths = [
      'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול'
    ];

    // Look for Hebrew date patterns
    for (let i = 0; i < hebrewMonths.length; i++) {
      const month = hebrewMonths[i];
      const pattern = new RegExp(`(\\d+)\\s+${month}\\s+(\\d{4})`, 'g');
      const matches = Array.from(text.matchAll(pattern));
      
      for (const match of matches) {
        const day = parseInt(match[1]);
        const year = parseInt(match[2]);
        
        // Convert Hebrew calendar to Gregorian (simplified)
        // In practice, you'd use a proper Hebrew calendar library
        const date = new Date(year, i, day);
        dates.push(date);
      }
    }

    return dates;
  }

  parseIsraeliCurrency(text: string): Array<{ amount: number; currency: string; symbol: string }> {
    const results: Array<{ amount: number; currency: string; symbol: string }> = [];
    
    // Israeli currency patterns
    const patterns = [
      { pattern: /₪\s*([\d,]+\.?\d*)/g, symbol: '₪', currency: 'ILS' },
      { pattern: /([\d,]+\.?\d*)\s*₪/g, symbol: '₪', currency: 'ILS' },
      { pattern: /([\d,]+\.?\d*)\s*ש"ח/g, symbol: 'ש"ח', currency: 'ILS' },
      { pattern: /ש"ח\s*([\d,]+\.?\d*)/g, symbol: 'ש"ח', currency: 'ILS' },
      { pattern: /([\d,]+\.?\d*)\s*שקל/g, symbol: 'שקל', currency: 'ILS' },
      { pattern: /([\d,]+\.?\d*)\s*שקלים/g, symbol: 'שקלים', currency: 'ILS' }
    ];

    for (const { pattern, symbol, currency } of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount)) {
          results.push({ amount, currency, symbol });
        }
      }
    }

    return results;
  }
}

// Arabic processor
class ArabicProcessor extends LanguageProcessor {
  async initialize(): Promise<void> {
    // Initialize Arabic-specific resources
  }

  async processSegment(segment: MultilingualText['segments'][0]): Promise<MultilingualText['segments'][0]> {
    return {
      ...segment,
      text: this.normalizeArabic(segment.text),
      direction: 'rtl'
    };
  }

  processLTR(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0] {
    return segment; // Arabic is RTL
  }

  private normalizeArabic(text: string): string {
    return text
      // Normalize Arabic characters
      .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Russian processor
class RussianProcessor extends LanguageProcessor {
  async initialize(): Promise<void> {
    // Initialize Russian-specific resources
  }

  async processSegment(segment: MultilingualText['segments'][0]): Promise<MultilingualText['segments'][0]> {
    return {
      ...segment,
      text: this.normalizeRussian(segment.text)
    };
  }

  processLTR(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0] {
    return segment; // Russian is LTR
  }

  private normalizeRussian(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Chinese processor
class ChineseProcessor extends LanguageProcessor {
  async initialize(): Promise<void> {
    // Initialize Chinese-specific resources
  }

  async processSegment(segment: MultilingualText['segments'][0]): Promise<MultilingualText['segments'][0]> {
    return {
      ...segment,
      text: this.normalizeChinese(segment.text)
    };
  }

  processLTR(segment: MultilingualText['segments'][0]): MultilingualText['segments'][0] {
    return segment; // Chinese is LTR
  }

  private normalizeChinese(text: string): string {
    return text
      .replace(/\s+/g, '') // Chinese doesn't use spaces between words
      .trim();
  }
}