import { moondreamOCR } from '../ai/moondreamOCR';
import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { documentProcessor } from '../ai/documentProcessor';
import { documentStorage } from '../database/documentStorage';
import { useScannerStore } from '../../stores/scannerStore';
import BackgroundService from 'react-native-background-actions';

export class MemoryAwareBatchProcessor {
  private readonly BATCH_SIZE = 3;
  private readonly MEMORY_CHECK_INTERVAL = 5;
  private readonly MIN_MEMORY_MB = 200;
  private readonly PAUSE_DURATION = 3000;
  private processedCount = 0;
  private isProcessing = false;
  
  static getInstance(): MemoryAwareBatchProcessor {
    return new MemoryAwareBatchProcessor();
  }
  
  async processBatchWithMemoryManagement(
    images: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (this.isProcessing) {
      console.log('[BatchProcessor] Already processing, skipping');
      return;
    }
    
    this.isProcessing = true;
    this.processedCount = 0;
    
    console.log(`[BatchProcessor] Starting processing of ${images.length} images`);
    
    try {
      await moondreamOCR.initialize();
      
      for (let i = 0; i < images.length; i += this.BATCH_SIZE) {
        const batch = images.slice(i, i + this.BATCH_SIZE);
        
        if (!(await this.checkMemory())) {
          console.log('[BatchProcessor] Low memory, performing deep cleanup');
          await this.performDeepCleanup();
          await this.pause(5000);
        }
        
        for (const imageUri of batch) {
          try {
            await this.processSingleImage(imageUri);
            this.processedCount++;
            
            if (onProgress) {
              onProgress(this.processedCount, images.length);
            }
            
            if (this.processedCount % this.MEMORY_CHECK_INTERVAL === 0) {
              await this.performLightCleanup();
            }
            
          } catch (error) {
            console.error(`[BatchProcessor] Failed to process ${imageUri}:`, error);
          }
        }
        
        await this.performBatchCleanup();
        await this.pause(this.PAUSE_DURATION);
      }
      
      console.log('[BatchProcessor] Completed all processing');
    } finally {
      this.isProcessing = false;
    }
  }
  
  private async processSingleImage(imageUri: string): Promise<void> {
    const result = await documentProcessor.processImage(imageUri, {
      skipDuplicateCheck: false,
      generateThumbnail: true,
    });
    
    await documentStorage.saveDocument(result);
  }
  
  private async checkMemory(): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && NativeModules.MemoryInfo) {
        const memInfo = await NativeModules.MemoryInfo.getMemoryInfo();
        const availableMB = memInfo.availableMemory / (1024 * 1024);
        console.log(`[BatchProcessor] Available memory: ${availableMB.toFixed(0)}MB`);
        return availableMB > this.MIN_MEMORY_MB;
      }
      
      // iOS or fallback - implement iOS memory check if needed
      return true;
    } catch (error) {
      console.error('[BatchProcessor] Memory check failed:', error);
      return true;
    }
  }
  
  private async performLightCleanup(): Promise<void> {
    console.log('[BatchProcessor] Performing light cleanup');
    
    moondreamOCR.clearTensorCache();
    
    if (global.gc) {
      global.gc();
    }
  }
  
  private async performBatchCleanup(): Promise<void> {
    console.log('[BatchProcessor] Performing batch cleanup');
    
    await this.performLightCleanup();
    
    const tempDir = `${RNFS.CachesDirectoryPath}/resized`;
    try {
      if (await RNFS.exists(tempDir)) {
        const files = await RNFS.readDir(tempDir);
        for (const file of files) {
          if (file.isFile()) {
            await RNFS.unlink(file.path);
          }
        }
      }
    } catch (e) {
      console.log('[BatchProcessor] Failed to clean temp dir:', e);
    }
    
    if (Platform.OS === 'android' && NativeModules.MemoryManager) {
      try {
        await NativeModules.MemoryManager.runGC();
      } catch (e) {
        console.log('[BatchProcessor] Native GC not available');
      }
    }
  }
  
  private async performDeepCleanup(): Promise<void> {
    console.log('[BatchProcessor] Performing deep cleanup');
    
    await moondreamOCR.cleanup();
    await this.performBatchCleanup();
    
    await this.pause(2000);
    
    await moondreamOCR.initialize();
  }
  
  private pause(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async stopProcessing(): void {
    this.isProcessing = false;
    await moondreamOCR.cleanup();
  }
  
  getProgress(): { processed: number; isProcessing: boolean } {
    return {
      processed: this.processedCount,
      isProcessing: this.isProcessing,
    };
  }
}

export const memoryAwareBatchProcessor = MemoryAwareBatchProcessor.getInstance();