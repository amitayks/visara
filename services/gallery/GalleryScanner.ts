import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { documentStorage } from '../database/documentStorage';
import { documentProcessor } from '../ai/documentProcessor';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export interface ScanProgress {
  totalImages: number;
  processedImages: number;
  lastScanDate: Date | null;
  lastProcessedAssetId: string | null;
  isScanning: boolean;
}

export interface ScanOptions {
  batchSize?: number;
  minFileSize?: number; // in KB
  maxAspectRatio?: number;
  wifiOnly?: boolean;
  batteryThreshold?: number; // percentage
}

const DEFAULT_OPTIONS: ScanOptions = {
  batchSize: 20,
  minFileSize: 100, // 100KB minimum
  maxAspectRatio: 3, // Skip panoramas
  wifiOnly: false,
  batteryThreshold: 20,
};

const SCAN_PROGRESS_KEY = 'gallery_scan_progress';
const PROCESSED_HASHES_KEY = 'processed_image_hashes';

export class GalleryScanner {
  private isScanning = false;
  private shouldStop = false;
  private progress: ScanProgress = {
    totalImages: 0,
    processedImages: 0,
    lastScanDate: null,
    lastProcessedAssetId: null,
    isScanning: false,
  };
  private processedHashes = new Set<string>();
  private onProgressCallback?: (progress: ScanProgress) => void;

  constructor() {
    this.loadProgress();
    this.loadProcessedHashes();
  }

  async requestPermissions(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  }

  async startScan(options: ScanOptions = {}, onProgress?: (progress: ScanProgress) => void) {
    if (this.isScanning) {
      console.log('Scan already in progress');
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Gallery permission denied');
    }

    this.isScanning = true;
    this.shouldStop = false;
    this.onProgressCallback = onProgress;
    
    const scanOptions = { ...DEFAULT_OPTIONS, ...options };
    
    try {
      await this.performScan(scanOptions);
    } finally {
      this.isScanning = false;
      this.progress.isScanning = false;
      await this.saveProgress();
    }
  }

  async stopScan() {
    this.shouldStop = true;
  }

  private async performScan(options: ScanOptions) {
    const albums = await MediaLibrary.getAlbumsAsync();
    
    // Get all photos from all albums
    let allAssets: MediaLibrary.Asset[] = [];
    
    for (const album of albums) {
      const albumAssets = await MediaLibrary.getAssetsAsync({
        album: album.id,
        mediaType: 'photo',
        sortBy: MediaLibrary.SortBy.creationTime,
        first: 10000, // Large batch to get all
      });
      
      allAssets = allAssets.concat(albumAssets.assets);
    }

    // Remove duplicates based on asset id
    const uniqueAssets = Array.from(
      new Map(allAssets.map(asset => [asset.id, asset])).values()
    );

    // Sort by creation time (newest first)
    uniqueAssets.sort((a, b) => b.creationTime - a.creationTime);

    // Resume from last position if available
    let startIndex = 0;
    if (this.progress.lastProcessedAssetId) {
      const lastIndex = uniqueAssets.findIndex(
        asset => asset.id === this.progress.lastProcessedAssetId
      );
      if (lastIndex !== -1) {
        startIndex = lastIndex + 1;
      }
    }

    this.progress.totalImages = uniqueAssets.length;
    this.progress.processedImages = startIndex;
    this.progress.isScanning = true;
    
    // Process in batches
    const batchSize = options.batchSize || DEFAULT_OPTIONS.batchSize!;
    
    for (let i = startIndex; i < uniqueAssets.length && !this.shouldStop; i += batchSize) {
      const batch = uniqueAssets.slice(i, i + batchSize);
      
      await this.processBatch(batch, options);
      
      this.progress.processedImages = Math.min(i + batchSize, uniqueAssets.length);
      this.progress.lastProcessedAssetId = batch[batch.length - 1].id;
      
      // Save progress after each batch
      await this.saveProgress();
      
      if (this.onProgressCallback) {
        this.onProgressCallback(this.progress);
      }
    }

    this.progress.lastScanDate = new Date();
    await this.saveProgress();
  }

  private async processBatch(assets: MediaLibrary.Asset[], options: ScanOptions) {
    const promises = assets.map(asset => this.processAsset(asset, options));
    
    // Process with error handling for individual assets
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to process asset ${assets[index].id}:`, result.reason);
      }
    });
  }

  private async processAsset(asset: MediaLibrary.Asset, options: ScanOptions): Promise<void> {
    try {
      // Apply smart filtering
      if (!await this.shouldProcessAsset(asset, options)) {
        return;
      }

      // Get asset info with location
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
      
      // Generate hash for duplicate detection
      const hash = await this.generateAssetHash(assetInfo);
      
      // Skip if already processed
      if (this.processedHashes.has(hash)) {
        return;
      }

      // Check if document already exists in database
      const existingDoc = await documentStorage.checkDuplicateByHash(hash);
      if (existingDoc) {
        this.processedHashes.add(hash);
        return;
      }

      // Process the image
      const result = await documentProcessor.processImage(assetInfo.localUri || assetInfo.uri);
      
      if (result && result.confidence > 0.8) {
        // Save to database
        await documentStorage.saveDocument({
          ...result,
          imageUri: assetInfo.localUri || assetInfo.uri,
          imageHash: hash,
          imageTakenDate: new Date(asset.creationTime),
        });

        this.processedHashes.add(hash);
        await this.saveProcessedHashes();
      }
    } catch (error) {
      console.error(`Error processing asset ${asset.id}:`, error);
    }
  }

  private async shouldProcessAsset(asset: MediaLibrary.Asset, options: ScanOptions): Promise<boolean> {
    // Priority for filenames containing document keywords
    const documentKeywords = ['doc', 'receipt', 'scan', 'invoice', 'id', 'form', 'contract', 'pdf'];
    const filename = asset.filename.toLowerCase();
    const hasDocumentKeyword = documentKeywords.some(keyword => filename.includes(keyword));
    
    if (hasDocumentKeyword) {
      return true; // Always process if filename suggests it's a document
    }

    // Check aspect ratio
    if (options.maxAspectRatio && asset.width && asset.height) {
      const aspectRatio = Math.max(asset.width, asset.height) / Math.min(asset.width, asset.height);
      if (aspectRatio > options.maxAspectRatio) {
        return false;
      }
    }

    // For other checks, we need to get the file info
    if (options.minFileSize && Platform.OS === 'ios') {
      // On iOS, we can check file size
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        if (assetInfo.localUri) {
          const fileInfo = await FileSystem.getInfoAsync(assetInfo.localUri);
          if (fileInfo.exists && 'size' in fileInfo) {
            const sizeInKB = fileInfo.size / 1024;
            if (sizeInKB < options.minFileSize) {
              return false;
            }
          }
        }
      } catch (error) {
        // If we can't get file size, process anyway
      }
    }

    return true;
  }

  private async generateAssetHash(assetInfo: MediaLibrary.AssetInfo): Promise<string> {
    // Create a unique identifier based on asset properties
    const identifier = `${assetInfo.id}-${assetInfo.creationTime}-${assetInfo.width}x${assetInfo.height}`;
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identifier);
  }

  private async loadProgress() {
    try {
      const savedProgress = await AsyncStorage.getItem(SCAN_PROGRESS_KEY);
      if (savedProgress) {
        const parsed = JSON.parse(savedProgress);
        this.progress = {
          ...parsed,
          lastScanDate: parsed.lastScanDate ? new Date(parsed.lastScanDate) : null,
        };
      }
    } catch (error) {
      console.error('Failed to load scan progress:', error);
    }
  }

  private async saveProgress() {
    try {
      await AsyncStorage.setItem(SCAN_PROGRESS_KEY, JSON.stringify(this.progress));
    } catch (error) {
      console.error('Failed to save scan progress:', error);
    }
  }

  private async loadProcessedHashes() {
    try {
      const saved = await AsyncStorage.getItem(PROCESSED_HASHES_KEY);
      if (saved) {
        this.processedHashes = new Set(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load processed hashes:', error);
    }
  }

  private async saveProcessedHashes() {
    try {
      await AsyncStorage.setItem(
        PROCESSED_HASHES_KEY,
        JSON.stringify(Array.from(this.processedHashes))
      );
    } catch (error) {
      console.error('Failed to save processed hashes:', error);
    }
  }

  getProgress(): ScanProgress {
    return { ...this.progress };
  }

  async clearProgress() {
    this.progress = {
      totalImages: 0,
      processedImages: 0,
      lastScanDate: null,
      lastProcessedAssetId: null,
      isScanning: false,
    };
    this.processedHashes.clear();
    
    await AsyncStorage.removeItem(SCAN_PROGRESS_KEY);
    await AsyncStorage.removeItem(PROCESSED_HASHES_KEY);
  }
}

export const galleryScanner = new GalleryScanner();