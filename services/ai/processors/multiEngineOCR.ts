import { MLKitEngine } from '../engines/MLKitEngine';
import { TesseractEngine } from '../engines/TesseractEngine';
import { ImagePreprocessor } from './imagePreprocessor';
import type { 
  OCRResult, 
  TextBlock, 
  ProcessedImage,
  LanguageResult 
} from '../types/hybridTypes';
import type { LocalOCREngine, OCREngineName } from '../ocrTypes';

export interface OCREngineResult {
  engineName: OCREngineName;
  result: OCRResult;
  processingTime: number;
  memoryUsage: number;
}

export class MultiEngineOCR {
  private engines: Map<string, LocalOCREngine> = new Map();
  private preprocessor: ImagePreprocessor;
  private initialized = false;
  private usedEngines: string[] = [];

  constructor() {
    this.preprocessor = ImagePreprocessor.getInstance();
    
    // Register available engines - English only
    this.registerEngine(new MLKitEngine());
    this.registerEngine(new TesseractEngine());
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
      
      // Step 2: Run OCR with available engines
      const engineResults = await this.runEngines(preprocessedImage);
      
      // Step 3: Use best result or merge if multiple
      const finalResult = engineResults.length === 1 
        ? engineResults[0].result 
        : await this.selectBestResult(engineResults);
      
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
        targetLanguages: ['en'] // English only
      });
    } catch (error) {
      console.warn('Image preprocessing failed, using original:', error);
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

  private async runEngines(processedImage: ProcessedImage): Promise<OCREngineResult[]> {
    const availableEngines = this.getAvailableEngines();
    const results: OCREngineResult[] = [];

    // Run engines in parallel for speed
    const enginePromises = availableEngines.map(async (engine) => {
      const engineStartTime = Date.now();
      
      try {
        const result = await engine.processImage(processedImage.uri);
        const processingTime = Date.now() - engineStartTime;
        
        if (!result || typeof result !== 'object') {
          console.warn(`Engine ${engine.name} returned invalid result:`, result);
          return null; 
        }
        
        // Convert OCRBlock[] to TextBlock[] if needed
        const convertedBlocks: TextBlock[] = Array.isArray(result.blocks) 
          ? result.blocks.map((block: any) => ({
              text: block.text || '',
              confidence: block.confidence || 0,
              boundingBox: {
                x: block.boundingBox?.x || 0,
                y: block.boundingBox?.y || 0,
                width: block.boundingBox?.width || 0,
                height: block.boundingBox?.height || 0
              },
              language: block.language || 'en'
            }))
          : [];
        
        const validatedResult: OCRResult = {
          text: result.text || '',
          blocks: convertedBlocks,
          confidence: typeof result.confidence === 'number' ? result.confidence : 0,
          processingTime: typeof result.processingTime === 'number' ? result.processingTime : 0,
          language: [typeof result.language === 'string' ? result.language : 'en'],
          engine: result.engine || engine.name
        };
        
        this.usedEngines.push(engine.name);
        
        return {
          engineName: engine.name as OCREngineName,
          result: validatedResult,
          processingTime,
          memoryUsage: 0
        };
      } catch (error) {
        console.warn(`Engine ${engine.name} failed:`, error);
        return null;
      }
    });

    const engineResults = await Promise.all(enginePromises);
    
    return engineResults.filter((result): result is OCREngineResult => result !== null) as OCREngineResult[];
  }

  private async selectBestResult(engineResults: OCREngineResult[]): Promise<OCRResult> {
    if (engineResults.length === 0) {
      throw new Error('No OCR engines produced results');
    }

    // Sort by confidence and select best
    const sortedResults = engineResults.sort((a, b) => b.result.confidence - a.result.confidence);
    return sortedResults[0].result;
  }

  private async fallbackSingleEngine(imageUri: string): Promise<OCRResult> {
    console.log('Attempting fallback with single engine...');
    
    const availableEngines = this.getAvailableEngines();
    
    if (availableEngines.length === 0) {
      throw new Error('No OCR engines available');
    }

    const engine = availableEngines[0];
    this.usedEngines = [engine.name];
    
    try {
      const result = await engine.processImage(imageUri);
      
      if (!result || typeof result !== 'object') {
        throw new Error(`Fallback engine ${engine.name} returned invalid result`);
      }
      
      return {
        text: result.text || '',
        blocks: Array.isArray(result.blocks) ? result.blocks : [],
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        processingTime: typeof result.processingTime === 'number' ? result.processingTime : 0,
        language: ['en'],
        engine: result.engine || engine.name
      };
    } catch (error) {
      throw new Error(`All OCR engines failed. Last error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Public utility methods
  getAvailableEngines(): LocalOCREngine[] {
    const engines = Array.from(this.engines.values()).filter(engine => 
      engine.isInitialized && engine.isInitialized()
    );
    
    // Prioritize Tesseract engine
    return engines.sort((a, b) => {
      if (a.name === 'tesseract') return -1;
      if (b.name === 'tesseract') return 1;
      return 0;
    });
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
}