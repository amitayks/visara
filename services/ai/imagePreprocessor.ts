import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { PreprocessingOptions } from './ocrTypes';

export class ImagePreprocessor {
  private static cache = new Map<string, string>();
  private static readonly CACHE_DIR = `${FileSystem.cacheDirectory}preprocessed/`;
  private static readonly MAX_CACHE_SIZE = 50; // Maximum cached images

  static async initialize(): Promise<void> {
    // Ensure cache directory exists
    const dirInfo = await FileSystem.getInfoAsync(this.CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.CACHE_DIR, { intermediates: true });
    }
  }

  static async preprocessImage(
    imageUri: string,
    options: PreprocessingOptions = {}
  ): Promise<{ uri: string; cached: boolean; processingTime: number }> {
    const startTime = Date.now();
    
    // Generate cache key based on image URI and options
    const cacheKey = await this.generateCacheKey(imageUri, options);
    
    // Check cache
    const cachedUri = this.cache.get(cacheKey);
    if (cachedUri) {
      const cachedFileInfo = await FileSystem.getInfoAsync(cachedUri);
      if (cachedFileInfo.exists) {
        return {
          uri: cachedUri,
          cached: true,
          processingTime: Date.now() - startTime,
        };
      }
    }

    // Process image
    const actions: ImageManipulator.Action[] = [];

    // Auto-rotate based on EXIF data
    if (options.autoRotate !== false) {
      // ImageManipulator automatically handles EXIF rotation
    }

    // Resize
    if (options.resize) {
      const { maxWidth = 1024, maxHeight = 1024 } = options.resize;
      actions.push({ resize: { width: maxWidth, height: maxHeight } });
    } else {
      // Default resize for OCR optimization
      actions.push({ resize: { width: 1500 } });
    }

    // Apply Hebrew-specific preprocessing
    if (options.targetLanguage === 'hebrew' || options.targetLanguage === 'mixed') {
      // Higher contrast for thin Hebrew characters
      if (options.enhanceContrast !== false) {
        // Note: expo-image-manipulator doesn't support contrast adjustment
        // We'll handle this in the OCR engines themselves
      }
    }

    // Process the image
    const processedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      actions,
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // Additional preprocessing for binarization if requested
    let finalUri = processedImage.uri;
    if (options.binarize) {
      finalUri = await this.applyBinarization(processedImage.uri);
    }

    // Cache the processed image
    const cachedPath = `${this.CACHE_DIR}${cacheKey}.jpg`;
    await FileSystem.copyAsync({
      from: finalUri,
      to: cachedPath,
    });

    // Update cache
    this.cache.set(cacheKey, cachedPath);
    
    // Clean old cache entries if needed
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const oldPath = this.cache.get(oldestKey);
        if (oldPath) {
          await FileSystem.deleteAsync(oldPath, { idempotent: true });
        }
        this.cache.delete(oldestKey);
      }
    }

    return {
      uri: cachedPath,
      cached: false,
      processingTime: Date.now() - startTime,
    };
  }

  private static async generateCacheKey(
    imageUri: string,
    options: PreprocessingOptions
  ): Promise<string> {
    const optionsString = JSON.stringify(options);
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    const content = `${imageUri}_${fileInfo.modificationTime}_${optionsString}`;
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content);
  }

  private static async applyBinarization(imageUri: string): Promise<string> {
    // Since expo-image-manipulator doesn't support binarization,
    // we'll return the original image and let the OCR engines handle it
    // In a production app, you might use a native module for this
    return imageUri;
  }

  static async clearCache(): Promise<void> {
    try {
      await FileSystem.deleteAsync(this.CACHE_DIR, { idempotent: true });
      this.cache.clear();
      await this.initialize();
    } catch (error) {
      console.error('Error clearing preprocessing cache:', error);
    }
  }

  static async getCacheSize(): Promise<number> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.CACHE_DIR);
      let totalSize = 0;
      
      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${this.CACHE_DIR}${file}`);
        if (fileInfo.exists && 'size' in fileInfo) {
          totalSize += fileInfo.size || 0;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('Error getting cache size:', error);
      return 0;
    }
  }

  static getMemoryUsage(): number {
    // Return cache size in memory
    return this.cache.size;
  }
}