import RNFS from 'react-native-fs';
import { EmbeddingModel } from './searchTypes';

// Conditional import for ONNX Runtime with error handling
let InferenceSession: any = null;
let Tensor: any = null;
let onnxAvailable = false;

try {
  const onnxModule = require('onnxruntime-react-native');
  if (onnxModule) {
    InferenceSession = onnxModule.InferenceSession;
    Tensor = onnxModule.Tensor;
    onnxAvailable = true;
    console.log('ONNX Runtime module loaded successfully');
  }
} catch (error) {
  console.log('ONNX Runtime not available, will use fallback embeddings');
  onnxAvailable = false;
}

/**
 * Semantic Search Service using ONNX Runtime React Native
 * 
 * This service provides semantic search capabilities using a quantized BERT model
 * optimized for mobile devices. It generates embeddings for text and calculates
 * similarity scores between documents and queries.
 * 
 * Recommended model: all-MiniLM-L6-v2 quantized to ~25MB
 */
export class SemanticSearchService implements EmbeddingModel {
  private session: any | null = null; // InferenceSession type when available
  private tokenizer: any = null;
  public modelPath: string;
  public inputSize: number = 128; // Max sequence length
  public outputSize: number = 384; // Embedding dimension for MiniLM-L6
  public isLoaded: boolean = false;
  private modelUrl: string = '';
  private vocabUrl: string = '';

  constructor() {
    // Model will be stored in app's document directory
    this.modelPath = `${RNFS.DocumentDirectoryPath}/miniLM-L6-v2-quantized.onnx`;
  }

  /**
   * Initialize the semantic search service
   * Downloads model if needed and loads it into memory
   */
  async initialize(): Promise<void> {
    // Skip initialization if ONNX is not available
    if (!onnxAvailable || !InferenceSession) {
      console.log('ONNX Runtime not available, using fallback mode');
      this.isLoaded = false;
      return;
    }
    
    try {
      // Check if model exists locally
      const modelExists = await RNFS.exists(this.modelPath);
      
      if (!modelExists) {
        console.log('Model not found locally, would download in production');
        // In production, you would download or bundle the model
        // For now, we'll just use fallback
        this.isLoaded = false;
        return;
      }

      // Load the ONNX model
      console.log('Loading ONNX model...');
      this.session = await InferenceSession.create(this.modelPath);
      
      // Initialize tokenizer
      await this.initializeTokenizer();
      
      this.isLoaded = true;
      console.log('Semantic search service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize semantic search:', error);
      this.isLoaded = false;
      // Don't throw, just use fallback
    }
  }

  /**
   * Download the model from a CDN or bundled resource
   * In production, you would bundle this with the app or download from your CDN
   */
  private async downloadModel(): Promise<void> {
    // For production, replace with actual model URL or bundle with app
    this.modelUrl = 'https://your-cdn.com/models/miniLM-L6-v2-quantized.onnx';
    
    try {
      // In a real implementation, download the model
      // For now, we'll create a placeholder
      console.log('Model download would happen here');
      
      // Alternative: Copy from bundled assets
      // await RNFS.copyFileAssets('models/miniLM-L6-v2-quantized.onnx', this.modelPath);
    } catch (error) {
      console.error('Failed to download model:', error);
      throw error;
    }
  }

  /**
   * Initialize the tokenizer for text preprocessing
   */
  private async initializeTokenizer(): Promise<void> {
    // Simple tokenizer implementation
    // In production, use a proper BERT tokenizer
    this.tokenizer = new SimpleTokenizer();
  }

  /**
   * Generate embedding for a text string
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isLoaded || !this.session || !Tensor) {
      // Fallback to simple embedding if model not loaded or ONNX not available
      return this.generateFallbackEmbedding(text);
    }

    try {
      // Tokenize the input text
      const tokens = this.tokenizer.tokenize(text, this.inputSize);
      
      // Create input tensors
      const inputIds = new Tensor('int64', tokens.inputIds, [1, this.inputSize]);
      const attentionMask = new Tensor('int64', tokens.attentionMask, [1, this.inputSize]);
      
      // Run inference
      const feeds = {
        input_ids: inputIds,
        attention_mask: attentionMask,
      };
      
      const output = await this.session.run(feeds);
      
      // Extract embeddings (usually the pooler_output or last_hidden_state mean)
      const embeddings = output.embeddings || output.pooler_output || output.last_hidden_state;
      const embeddingArray = embeddings.data as Float32Array;
      
      // Convert to regular array and normalize
      const embedding = Array.from(embeddingArray);
      return this.normalizeEmbedding(embedding);
      
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Fallback to simple embedding
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      console.warn('Embedding dimensions do not match');
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    // Process in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      embeddings.push(...batchEmbeddings);
    }
    
    return embeddings;
  }

  /**
   * Generate a simple fallback embedding using TF-IDF-like approach
   * This is used when the ONNX model is not available
   */
  private generateFallbackEmbedding(text: string): number[] {
    // Simple character-level hashing for fallback
    const embedding = new Array(this.outputSize).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    
    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        const index = (charCode * (i + 1)) % this.outputSize;
        embedding[index] += 1 / words.length;
      }
    }
    
    return this.normalizeEmbedding(embedding);
  }

  /**
   * Normalize an embedding vector to unit length
   */
  private normalizeEmbedding(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    
    if (norm === 0) return embedding;
    
    return embedding.map(val => val / norm);
  }

  /**
   * Calculate relevance score between query and document
   */
  calculateRelevanceScore(
    queryEmbedding: number[],
    documentEmbedding: number[],
    keywordMatchScore: number = 0
  ): number {
    // Combine semantic similarity with keyword matching
    const semanticScore = this.calculateSimilarity(queryEmbedding, documentEmbedding);
    
    // Weighted combination (70% semantic, 30% keyword)
    return semanticScore * 0.7 + keywordMatchScore * 0.3;
  }

  /**
   * Find top K similar documents
   */
  findTopSimilar(
    queryEmbedding: number[],
    documentEmbeddings: Map<string, number[]>,
    k: number = 10
  ): Array<{ id: string; score: number }> {
    const scores: Array<{ id: string; score: number }> = [];
    
    for (const [id, docEmbedding] of documentEmbeddings) {
      const score = this.calculateSimilarity(queryEmbedding, docEmbedding);
      scores.push({ id, score });
    }
    
    // Sort by score descending and take top K
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, k);
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.isLoaded = false;
  }
}

/**
 * Simple tokenizer for text preprocessing
 * In production, use a proper BERT tokenizer with WordPiece
 */
class SimpleTokenizer {
  private vocabSize: number = 30000;
  private padToken: number = 0;
  private clsToken: number = 101;
  private sepToken: number = 102;
  
  tokenize(text: string, maxLength: number): { inputIds: bigint[]; attentionMask: bigint[] } {
    // Simple word-level tokenization
    const words = text.toLowerCase().split(/\s+/).slice(0, maxLength - 2);
    
    // Create input IDs (simplified - in production use proper vocab)
    const inputIds: bigint[] = [BigInt(this.clsToken)];
    const attentionMask: bigint[] = [BigInt(1)];
    
    for (const word of words) {
      // Simple hash-based token ID (in production, use vocab lookup)
      const tokenId = this.hashWord(word) % this.vocabSize;
      inputIds.push(BigInt(tokenId));
      attentionMask.push(BigInt(1));
    }
    
    // Add SEP token
    inputIds.push(BigInt(this.sepToken));
    attentionMask.push(BigInt(1));
    
    // Pad to max length
    while (inputIds.length < maxLength) {
      inputIds.push(BigInt(this.padToken));
      attentionMask.push(BigInt(0));
    }
    
    return {
      inputIds: inputIds.slice(0, maxLength),
      attentionMask: attentionMask.slice(0, maxLength),
    };
  }
  
  private hashWord(word: string): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Export singleton instance
export const semanticSearchService = new SemanticSearchService();