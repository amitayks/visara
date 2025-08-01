import type { MultilingualText, LanguageResult, TextBlock } from '../types/hybridTypes';

export class MultilingualProcessor {
  async processText(text: string, blocks: TextBlock[]): Promise<MultilingualText> {
    return {
      segments: [{
        text: text,
        language: 'en',
        direction: 'ltr',
        startIndex: 0,
        endIndex: text.length
      }],
      primaryLanguage: 'en',
      detectedLanguages: ['en']
    };
  }

  async detectLanguages(text: string): Promise<LanguageResult[]> {
    // Always return English
    return [{
      language: 'en',
      confidence: 1.0,
      script: 'latin',
      direction: 'ltr'
    }];
  }
}