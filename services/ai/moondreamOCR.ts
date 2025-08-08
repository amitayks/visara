import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';

export interface MoondreamOutput {
  vendor?: string;
  date?: string;
  total_amount?: number;
  currency?: string;
  items?: Array<{
    name: string;
    quantity?: number;
    price?: number;
  }>;
  document_type?: string;
  confidence?: number;
  raw_text?: string;
}

export class MoondreamOCRService {
  private static instance: MoondreamOCRService;
  private session: InferenceSession | null = null;
  private modelPath: string;
  private isInitializing = false;
  private tensorCache: Map<string, Tensor> = new Map();
  
  private readonly MODEL_INPUT_SIZE = 384;
  private readonly MODEL_URL = 'https://huggingface.co/vikhyatk/moondream2/resolve/main/moondream2-onnx-int8-model.onnx';
  private readonly MODEL_SIZE = 500 * 1024 * 1024; // 500MB approximation
  
  static getInstance(): MoondreamOCRService {
    if (!MoondreamOCRService.instance) {
      MoondreamOCRService.instance = new MoondreamOCRService();
    }
    return MoondreamOCRService.instance;
  }
  
  constructor() {
    this.modelPath = `${RNFS.DocumentDirectoryPath}/models/moondream_05b.onnx`;
  }
  
  async initialize(): Promise<void> {
    if (this.session || this.isInitializing) return;
    
    this.isInitializing = true;
    
    try {
      console.log('[Moondream] Initializing...');
      
      const modelDir = `${RNFS.DocumentDirectoryPath}/models`;
      if (!(await RNFS.exists(modelDir))) {
        await RNFS.mkdir(modelDir);
      }
      
      if (!(await RNFS.exists(this.modelPath))) {
        await this.downloadModel();
      }
      
      this.session = await InferenceSession.create(this.modelPath, {
        executionProviders: Platform.OS === 'android' ? ['nnapi', 'cpu'] : ['cpu'],
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        logSeverityLevel: 0,
        intraOpNumThreads: 2,
      });
      
      console.log('[Moondream] Initialized successfully');
    } catch (error) {
      console.error('[Moondream] Initialization failed:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }
  
  private async downloadModel(): Promise<void> {
    console.log('[Moondream] Downloading model...');
    
    return new Promise((resolve, reject) => {
      RNBlobUtil.config({
        fileCache: true,
        path: this.modelPath,
      })
        .fetch('GET', this.MODEL_URL)
        .progress((received, total) => {
          const progress = (received / total) * 100;
          console.log(`[Moondream] Download progress: ${progress.toFixed(1)}%`);
        })
        .then((res) => {
          console.log('[Moondream] Model downloaded successfully');
          resolve();
        })
        .catch(reject);
    });
  }
  
  async processDocument(imageUri: string, prompt?: string): Promise<MoondreamOutput> {
    if (!this.session) {
      await this.initialize();
    }
    
    try {
      console.log('[Moondream] Processing document:', imageUri);
      
      const processedImageUri = await this.preprocessImage(imageUri);
      const imageTensor = await this.imageToTensor(processedImageUri);
      
      const extractionPrompt = prompt || 
        "Extract text from this document and return as JSON with fields: vendor, date, total_amount, currency, items (array with name, quantity, price), document_type. Be precise and accurate.";
      
      const outputs = await this.runInference(imageTensor, extractionPrompt);
      const result = this.parseOutput(outputs);
      
      imageTensor.dispose();
      this.clearTensorCache();
      
      if (processedImageUri !== imageUri) {
        try {
          await RNFS.unlink(processedImageUri);
        } catch (e) {
          console.log('[Moondream] Failed to clean up processed image:', e);
        }
      }
      
      return result;
    } catch (error) {
      console.error('[Moondream] Processing failed:', error);
      throw error;
    }
  }
  
  private async preprocessImage(uri: string): Promise<string> {
    const resized = await ImageResizer.createResizedImage(
      uri,
      this.MODEL_INPUT_SIZE,
      this.MODEL_INPUT_SIZE,
      'JPEG',
      85,
      0,
      undefined,
      false,
      { mode: 'cover' }
    );
    
    return resized.uri;
  }
  
  private async imageToTensor(imageUri: string): Promise<Tensor> {
    const imageData = await RNFS.readFile(imageUri, 'base64');
    const pixels = await this.decodeAndNormalizeImage(imageData);
    
    return new Tensor('float32', pixels, [1, 3, this.MODEL_INPUT_SIZE, this.MODEL_INPUT_SIZE]);
  }
  
  private async decodeAndNormalizeImage(base64: string): Promise<Float32Array> {
    const size = this.MODEL_INPUT_SIZE;
    const channels = 3;
    const totalPixels = size * size * channels;
    const normalized = new Float32Array(totalPixels);
    
    // Basic normalization for placeholder
    // In production, this would decode the base64 image and normalize pixel values
    for (let i = 0; i < totalPixels; i++) {
      normalized[i] = Math.random(); // Placeholder normalization
    }
    
    return normalized;
  }
  
  private async runInference(imageTensor: Tensor, prompt: string): Promise<any> {
    if (!this.session) throw new Error('Session not initialized');
    
    const promptTokens = this.tokenizePrompt(prompt);
    const promptTensor = new Tensor('int64', promptTokens, [1, promptTokens.length]);
    
    const feeds = {
      'pixel_values': imageTensor,
      'input_ids': promptTensor,
    };
    
    const outputs = await this.session.run(feeds);
    
    promptTensor.dispose();
    
    return outputs;
  }
  
  private tokenizePrompt(prompt: string): BigInt64Array {
    // Simplified tokenization - in production, use proper tokenizer
    const tokens = new BigInt64Array(128);
    for (let i = 0; i < Math.min(prompt.length, 128); i++) {
      tokens[i] = BigInt(prompt.charCodeAt(i));
    }
    return tokens;
  }
  
  private parseOutput(outputs: any): MoondreamOutput {
    try {
      const outputText = this.decodeOutput(outputs);
      
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
          vendor: parsed.vendor || 'Unknown',
          date: parsed.date,
          total_amount: parsed.total_amount,
          currency: parsed.currency || '$',
          items: parsed.items || [],
          document_type: parsed.document_type || 'unknown',
          confidence: 0.85,
          raw_text: outputText
        };
      }
    } catch (error) {
      console.error('[Moondream] Failed to parse JSON output:', error);
    }
    
    return this.fallbackParsing(outputs);
  }
  
  private decodeOutput(outputs: any): string {
    // Placeholder for actual output decoding
    // In production, this would decode the model's output tokens
    if (outputs?.output?.data) {
      return outputs.output.data.toString();
    }
    return '';
  }
  
  private fallbackParsing(text: any): MoondreamOutput {
    const textStr = typeof text === 'string' ? text : JSON.stringify(text);
    
    const vendorMatch = textStr.match(/vendor[:\s]+([^\n]+)/i);
    const amountMatch = textStr.match(/total[:\s]+\$?([\d,]+\.?\d*)/i);
    const dateMatch = textStr.match(/date[:\s]+([^\n]+)/i);
    
    return {
      vendor: vendorMatch?.[1]?.trim(),
      total_amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined,
      date: dateMatch?.[1]?.trim(),
      document_type: 'unknown',
      confidence: 0.5,
      raw_text: textStr
    };
  }
  
  clearTensorCache(): void {
    this.tensorCache.forEach(tensor => tensor.dispose());
    this.tensorCache.clear();
  }
  
  async cleanup(): Promise<void> {
    this.clearTensorCache();
    
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    
    console.log('[Moondream] Cleanup completed');
  }
}

export const moondreamOCR = MoondreamOCRService.getInstance();