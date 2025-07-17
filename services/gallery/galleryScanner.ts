import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { DocumentModel } from '../database/schema';

export interface ScanOptions {
  batchSize?: number;
  albumName?: string;
  includeVideos?: boolean;
  maxAge?: number; // days
}

export interface ScanProgress {
  total: number;
  processed: number;
  current?: string; // current file being processed
  errors: number;
}

export class GalleryScanner {
  private isScanning = false;
  private shouldStop = false;
  
  async requestPermissions(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  }
  
  async scanGallery(
    onProgress?: (progress: ScanProgress) => void,
    onDocumentFound?: (asset: MediaLibrary.Asset, hash: string) => void,
    options: ScanOptions = {}
  ): Promise<MediaLibrary.Asset[]> {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }
    
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Media library permission denied');
    }
    
    this.isScanning = true;
    this.shouldStop = false;
    
    try {
      const {
        batchSize = 50,
        albumName,
        includeVideos = false,
        maxAge
      } = options;
      
      // Get media assets
      const mediaType = includeVideos 
        ? [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video]
        : [MediaLibrary.MediaType.photo];
      
      let album: MediaLibrary.Album | undefined;
      if (albumName) {
        const albums = await MediaLibrary.getAlbumsAsync();
        album = albums.find(a => a.title === albumName);
      }
      
      // Get all assets
      let allAssets: MediaLibrary.Asset[] = [];
      let after: string | undefined;
      let hasNextPage = true;
      
      while (hasNextPage && !this.shouldStop) {
        const assetsPage = await MediaLibrary.getAssetsAsync({
          first: batchSize,
          after,
          mediaType,
          album: album?.id,
          sortBy: MediaLibrary.SortBy.creationTime,
        });
        
        allAssets = [...allAssets, ...assetsPage.assets];
        after = assetsPage.endCursor;
        hasNextPage = assetsPage.hasNextPage;
      }
      
      // Filter by age if specified
      if (maxAge) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAge);
        allAssets = allAssets.filter(asset => 
          new Date(asset.creationTime) >= cutoffDate
        );
      }
      
      // Process assets in batches
      const potentialDocuments: MediaLibrary.Asset[] = [];
      const progress: ScanProgress = {
        total: allAssets.length,
        processed: 0,
        errors: 0,
      };
      
      for (let i = 0; i < allAssets.length; i += batchSize) {
        if (this.shouldStop) break;
        
        const batch = allAssets.slice(i, i + batchSize);
        
        for (const asset of batch) {
          if (this.shouldStop) break;
          
          try {
            progress.current = asset.filename;
            onProgress?.(progress);
            
            // Get file hash to check if already processed
            const hash = await this.getFileHash(asset.uri);
            
            // Basic heuristics to identify potential documents
            if (await this.isPotentialDocument(asset)) {
              potentialDocuments.push(asset);
              onDocumentFound?.(asset, hash);
            }
            
            progress.processed++;
          } catch (error) {
            console.error(`Error processing ${asset.filename}:`, error);
            progress.errors++;
            progress.processed++;
          }
        }
        
        onProgress?.(progress);
        
        // Small delay to prevent blocking UI
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      return potentialDocuments;
      
    } finally {
      this.isScanning = false;
      this.shouldStop = false;
    }
  }
  
  async getFileHash(uri: string): Promise<string> {
    try {
      // For performance, we'll use file info instead of content hash
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }
      
      // Create hash from file size + modification time + uri
      const hashInput = `${fileInfo.size}-${fileInfo.modificationTime}-${uri}`;
      return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hashInput
      );
    } catch (error) {
      console.error('Error creating file hash:', error);
      throw error;
    }
  }
  
  private async isPotentialDocument(asset: MediaLibrary.Asset): Promise<boolean> {
    try {
      // Skip videos for now
      if (asset.mediaType !== MediaLibrary.MediaType.photo) {
        return false;
      }
      
      // Basic filename checks
      const filename = asset.filename.toLowerCase();
      const documentKeywords = [
        'receipt', 'invoice', 'bill', 'statement', 'document', 'scan',
        'pdf', 'doc', 'form', 'license', 'id', 'card', 'ticket',
        'contract', 'agreement', 'letter', 'memo', 'report'
      ];
      
      // Check if filename contains document keywords
      if (documentKeywords.some(keyword => filename.includes(keyword))) {
        return true;
      }
      
      // Check file size (documents are usually smaller than photos)
      // This is a rough heuristic - actual ML will be more accurate
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      if (fileInfo.exists && fileInfo.size) {
        // Skip very small images (likely thumbnails)
        if (fileInfo.size < 50000) { // 50KB
          return false;
        }
        
        // Documents are often between 50KB and 5MB
        if (fileInfo.size > 5000000) { // 5MB
          // Large files could still be scanned documents, but lower priority
          return false;
        }
      }
      
      // Check image dimensions (documents are often rectangular)
      if (asset.width && asset.height) {
        const aspectRatio = asset.width / asset.height;
        // Documents often have aspect ratios between 0.5 and 2.0
        if (aspectRatio < 0.3 || aspectRatio > 3.0) {
          return false;
        }
      }
      
      // If none of the exclusion criteria match, consider it a potential document
      return true;
      
    } catch (error) {
      console.error('Error checking if asset is potential document:', error);
      return false;
    }
  }
  
  stopScanning(): void {
    this.shouldStop = true;
  }
  
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }
  
  async getRecentAssets(limit: number = 50): Promise<MediaLibrary.Asset[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return [];
    }
    
    const result = await MediaLibrary.getAssetsAsync({
      first: limit,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: MediaLibrary.SortBy.creationTime,
    });
    
    return result.assets;
  }
  
  async getAssetsByAlbum(albumName: string): Promise<MediaLibrary.Asset[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return [];
    }
    
    const albums = await MediaLibrary.getAlbumsAsync();
    const album = albums.find(a => a.title === albumName);
    
    if (!album) {
      return [];
    }
    
    const result = await MediaLibrary.getAssetsAsync({
      album: album.id,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: MediaLibrary.SortBy.creationTime,
    });
    
    return result.assets;
  }
}

// Singleton instance
export const galleryScanner = new GalleryScanner();