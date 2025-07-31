import { MLKitEngine } from '../engines/MLKitEngine';
import { MockEngine } from '../engines/MockEngine';
import { TesseractEngine } from '../engines/TesseractEngine';
import { ImagePreprocessor } from './imagePreprocessor';
import type { 
  OCRResult, 
  TextBlock, 
  ProcessedImage,
  LanguageResult 
} from '../types/hybridTypes';
import type { LocalOCREngine } from '../ocrTypes';

export interface OCREngineResult {
  engineName: string;
  result: OCRResult;
  processingTime: number;
  memoryUsage: number;
}

export class MultiEngineOCR {
  private engines: Map<string, LocalOCREngine> = new Map();
  private preprocessor: ImagePreprocessor;
  private initialized = false;
  private usedEngines: string[] = [];

  constructor(options: { includeMockEngine?: boolean } = {}) {
    this.preprocessor = ImagePreprocessor.getInstance();
    
    // Register available engines
    this.registerEngine(new MLKitEngine());
    
    // Only include MockEngine when explicitly requested (for testing)
    if (options.includeMockEngine) {
      this.registerEngine(new MockEngine());
    }
    
    // this.registerEngine(new TesseractEngine()); // Enable when Tesseract is available
  }

  private registerEngine(engine: LocalOCREngine): void {
    this.engines.set(engine.name, engine);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing MultiEngine OCR...');
    
    // Initialize preprocessor
    await this.preprocessor.initialize();

    // Initialize all engines in parallel
    const initPromises = Array.from(this.engines.values()).map(async (engine) => {
      try {
        await engine.initialize();
        console.log(`✓ ${engine.name} engine initialized`);
      } catch (error) {
        console.warn(`✗ Failed to initialize ${engine.name}:`, error);
        // Don't remove engine, just mark as failed
      }
    });

    await Promise.all(initPromises);
    this.initialized = true;
  }

  async extractText(imageUri: string): Promise<OCRResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    this.usedEngines = [];

    try {
      // Step 1: Preprocess image for optimal OCR
      const preprocessedImage = await this.preprocessImage(imageUri);
      
      // Step 2: Run OCR with multiple engines
      const engineResults = await this.runMultipleEngines(preprocessedImage);
      
      // Step 3: Merge results intelligently
      const mergedResult = await this.mergeOCRResults(engineResults);
      
      // Step 4: Post-process and enhance
      const finalResult = await this.postProcessResult(mergedResult);
      
      finalResult.processingTime = Date.now() - startTime;
      
      console.log(`Multi-engine OCR completed in ${finalResult.processingTime}ms`);
      console.log(`Used engines: ${this.usedEngines.join(', ')}`);
      console.log(`Final confidence: ${finalResult.confidence.toFixed(3)}`);
      
      return finalResult;

    } catch (error) {
      console.error('Multi-engine OCR failed:', error);
      
      // Fallback: try with single best available engine
      return await this.fallbackSingleEngine(imageUri);
    }
  }

  private async preprocessImage(imageUri: string): Promise<ProcessedImage> {
    try {
      return await this.preprocessor.processForOCR(imageUri, {
        autoRotate: true,
        enhanceContrast: true,
        reduceNoise: true,
        optimizeResolution: true,
        targetLanguages: ['en', 'he'] // Multi-language optimization
      });
    } catch (error) {
      console.warn('Image preprocessing failed, using original:', error);
      // Return minimal processed image info
      return {
        uri: imageUri,
        width: 0,
        height: 0,
        orientation: 0,
        enhancements: [],
        processingTime: 0
      };
    }
  }

  private async runMultipleEngines(processedImage: ProcessedImage): Promise<OCREngineResult[]> {
    const availableEngines = this.getAvailableEngines();
    const results: OCREngineResult[] = [];

    // Primary strategy: Run engines in parallel for speed
    const enginePromises = availableEngines.map(async (engine) => {
      const engineStartTime = Date.now();
      
      try {
        const result = await engine.processImage(processedImage.uri);
        const processingTime = Date.now() - engineStartTime;
        
        // Validate result
        if (!result || typeof result !== 'object') {
          console.warn(`Engine ${engine.name} returned invalid result:`, result);
          return null; 
        }
        
        // Ensure result has required properties
        const validatedResult = {
          text: result.text || '',
          blocks: Array.isArray(result.blocks) ? result.blocks : [],
          confidence: typeof result.confidence === 'number' ? result.confidence : 0,
          processingTime: typeof result.processingTime === 'number' ? result.processingTime : 0,
          detectedLanguages: Array.isArray(result.detectedLanguages) ? result.detectedLanguages : [],
          orientation: result.orientation || 0
        };
        
        this.usedEngines.push(engine.name);
        
        return {
          engineName: engine.name,
          result: validatedResult,
          processingTime,
          memoryUsage: engine.getMemoryUsage ? engine.getMemoryUsage() : 0
        };
      } catch (error) {
        console.warn(`Engine ${engine.name} failed:`, error);
        return null;
      }
    });

    const engineResults = await Promise.all(enginePromises);
    
    // Filter out failed engines
    return engineResults.filter((result): result is OCREngineResult => result !== null);
  }

  private async mergeOCRResults(engineResults: OCREngineResult[]): Promise<OCRResult> {
    if (engineResults.length === 0) {
      throw new Error('No OCR engines produced results');
    }

    if (engineResults.length === 1) {
      return engineResults[0].result;
    }

    console.log(`Merging results from ${engineResults.length} engines...`);

    // Advanced merging strategy
    return await this.intelligentMerge(engineResults);
  }

  private async intelligentMerge(engineResults: OCREngineResult[]): Promise<OCRResult> {
    // Sort engines by confidence
    const sortedResults = engineResults.sort((a, b) => b.result.confidence - a.result.confidence);
    const bestResult = sortedResults[0].result;
    
    // If best result has high confidence, use it as base
    if (bestResult.confidence > 0.8) {
      return await this.enhanceWithSecondaryResults(bestResult, sortedResults.slice(1));
    }

    // Otherwise, use voting mechanism for text blocks
    return await this.voteBasedMerge(engineResults);
  }

  private async enhanceWithSecondaryResults(
    primaryResult: OCRResult, 
    secondaryResults: OCREngineResult[]
  ): Promise<OCRResult> {
    const enhancedBlocks = [...primaryResult.blocks];
    
    // Use secondary results to fill gaps or improve low-confidence blocks
    for (const secondaryResult of secondaryResults) {
      for (const secondaryBlock of secondaryResult.result.blocks) {
        // Find corresponding block in primary result
        const correspondingBlock = this.findCorrespondingBlock(secondaryBlock, enhancedBlocks);
        
        if (!correspondingBlock) {
          // Add missing block if it has decent confidence
          if (secondaryBlock.confidence > 0.6) {
            enhancedBlocks.push(secondaryBlock);
          }
        } else if (correspondingBlock.confidence < secondaryBlock.confidence) {
          // Replace with higher confidence text
          correspondingBlock.text = secondaryBlock.text;
          correspondingBlock.confidence = secondaryBlock.confidence;
        }
      }
    }

    // Recalculate overall text and confidence
    const validBlocks = enhancedBlocks.filter(block => block && block.text);
    const fullText = validBlocks.map(block => block.text).join('\n');
    const avgConfidence = validBlocks.length > 0 
      ? validBlocks.reduce((sum, block) => sum + (block.confidence || 0), 0) / validBlocks.length
      : 0;

    return {
      text: fullText,
      blocks: enhancedBlocks,
      confidence: avgConfidence,
      processingTime: primaryResult.processingTime,
      detectedLanguages: this.mergeLanguages(primaryResult.detectedLanguages, 
        secondaryResults.map(r => r.result.detectedLanguages).flat()),
      orientation: primaryResult.orientation
    };
  }

  private async voteBasedMerge(engineResults: OCREngineResult[]): Promise<OCRResult> {
    const allBlocks: TextBlock[] = [];
    const allTexts: string[] = [];
    let totalProcessingTime = 0;
    const allLanguages: string[] = [];

    // Collect all data
    for (const engineResult of engineResults) {
      if (engineResult && engineResult.result) {
        if (engineResult.result.blocks) {
          allBlocks.push(...engineResult.result.blocks.filter(block => block && block.text));
        }
        if (engineResult.result.text) {
          allTexts.push(engineResult.result.text);
        }
        totalProcessingTime += engineResult.processingTime || 0;
        if (engineResult.result.detectedLanguages) {
          allLanguages.push(...engineResult.result.detectedLanguages);
        }
      }
    }

    // For now, use a simple approach: take the longest text with highest average block confidence
    let bestText = '';
    let bestConfidence = 0;
    let bestBlocks: TextBlock[] = [];

    for (const engineResult of engineResults) {
      if (!engineResult || !engineResult.result || !engineResult.result.blocks) continue;
      
      const validBlocks = engineResult.result.blocks.filter(block => block && typeof block.confidence === 'number');
      if (validBlocks.length === 0) continue;
      
      const avgBlockConfidence = validBlocks.reduce(
        (sum, block) => sum + block.confidence, 0
      ) / validBlocks.length;

      const textLength = engineResult.result.text ? engineResult.result.text.length : 0;
      const score = avgBlockConfidence * (textLength / 1000); // Length bonus
      
      if (score > bestConfidence || (score === bestConfidence && textLength > bestText.length)) {
        bestText = engineResult.result.text || '';
        bestConfidence = engineResult.result.confidence || 0;
        bestBlocks = validBlocks;
      }
    }

    // Fallback if no valid results found
    if (!bestText && bestBlocks.length === 0) {
      return {
        text: '',
        blocks: [],
        confidence: 0,
        processingTime: totalProcessingTime,
        detectedLanguages: [],
        orientation: 0
      };
    }

    return {
      text: bestText,
      blocks: bestBlocks,
      confidence: bestConfidence,
      processingTime: totalProcessingTime / Math.max(1, engineResults.length),
      detectedLanguages: [...new Set(allLanguages)],
      orientation: 0 // TODO: Implement orientation voting
    };
  }

  private findCorrespondingBlock(targetBlock: TextBlock, blocks: TextBlock[]): TextBlock | null {
    const threshold = 50; // pixels
    
    return blocks.find(block => {
      const xDiff = Math.abs(block.boundingBox.x - targetBlock.boundingBox.x);
      const yDiff = Math.abs(block.boundingBox.y - targetBlock.boundingBox.y);
      return xDiff < threshold && yDiff < threshold;
    }) || null;
  }

  private mergeLanguages(primary: string[], secondary: string[]): string[] {
    const combined = [...primary, ...secondary];
    return [...new Set(combined)]; // Remove duplicates
  }

  private async postProcessResult(result: OCRResult): Promise<OCRResult> {
    // Post-processing improvements
    const cleanedText = this.cleanText(result.text);
    const enhancedBlocks = this.enhanceTextBlocks(result.blocks);

    return {
      ...result,
      text: cleanedText,
      blocks: enhancedBlocks
    };
  }

  private cleanText(text: string): string {
    return text
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Fix common OCR errors
      .replace(/\b0\b/g, 'O') // Zero to O in some contexts
      .replace(/\bl\b/g, 'I') // l to I in some contexts
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Trim
      .trim();
  }

  private enhanceTextBlocks(blocks: TextBlock[]): TextBlock[] {
    return blocks.map(block => ({
      ...block,
      text: this.cleanText(block.text),
      // Enhance confidence based on text characteristics
      confidence: this.adjustConfidence(block)
    }));
  }

  private adjustConfidence(block: TextBlock): number {
    let confidence = block.confidence;
    
    // Boost confidence for longer text blocks
    if (block.text.length > 10) {
      confidence += 0.05;
    }
    
    // Reduce confidence for very short or suspicious text
    if (block.text.length < 2 || /[^\w\s\u0590-\u05FF\u0600-\u06FF]/.test(block.text)) {
      confidence -= 0.1;
    }
    
    // Ensure confidence stays in valid range
    return Math.max(0, Math.min(1, confidence));
  }

  private async fallbackSingleEngine(imageUri: string): Promise<OCRResult> {
    console.log('Attempting fallback with single engine...');
    
    const availableEngines = this.getAvailableEngines();
    
    if (availableEngines.length === 0) {
      throw new Error('No OCR engines available');
    }

    // Use the first available engine
    const engine = availableEngines[0];
    this.usedEngines = [engine.name];
    
    try {
      const result = await engine.processImage(imageUri);
      
      // Validate fallback result too
      if (!result || typeof result !== 'object') {
        throw new Error(`Fallback engine ${engine.name} returned invalid result`);
      }
      
      return {
        text: result.text || '',
        blocks: Array.isArray(result.blocks) ? result.blocks : [],
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        processingTime: typeof result.processingTime === 'number' ? result.processingTime : 0,
        detectedLanguages: Array.isArray(result.detectedLanguages) ? result.detectedLanguages : [],
        orientation: result.orientation || 0
      };
    } catch (error) {
      throw new Error(`All OCR engines failed. Last error: ${error.message}`);
    }
  }

  // Public utility methods
  getAvailableEngines(): LocalOCREngine[] {
    return Array.from(this.engines.values()).filter(engine => 
      engine.isInitialized && engine.isInitialized()
    );
  }

  hasAvailableEngines(): boolean {
    return this.getAvailableEngines().length > 0;
  }

  getUsedEngines(): string[] {
    return [...this.usedEngines];
  }

  async clearCache(): Promise<void> {
    await this.preprocessor.clearCache();
  }

  // Language detection utility
  async detectLanguages(text: string): Promise<LanguageResult[]> {
    // Simple language detection based on character sets
    const languages: LanguageResult[] = [];
    
    if (/[a-zA-Z]/.test(text)) {
      languages.push({
        language: 'en',
        confidence: 0.8,
        script: 'latin',
        direction: 'ltr'
      });
    }
    
    if (/[\u0590-\u05FF]/.test(text)) {
      languages.push({
        language: 'he',
        confidence: 0.9,
        script: 'hebrew',
        direction: 'rtl'
      });
    }
    
    if (/[\u0600-\u06FF]/.test(text)) {
      languages.push({
        language: 'ar',
        confidence: 0.9,
        script: 'arabic',
        direction: 'rtl'
      });
    }
    
    return languages;
  }
}