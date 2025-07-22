import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';

interface ThumbnailResult {
  thumbnailUri: string;
  originalSize: number;
  thumbnailSize: number;
  compressionRatio: number;
}

interface ImageInfo {
  width: number;
  height: number;
  size: number;
  takenDate?: Date;
}

export class ThumbnailService {
  private thumbnailDir: string;

  constructor() {
    this.thumbnailDir = `${FileSystem.documentDirectory}thumbnails/`;
    this.ensureThumbnailDirectory();
  }

  private async ensureThumbnailDirectory() {
    const dirInfo = await FileSystem.getInfoAsync(this.thumbnailDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.thumbnailDir, { intermediates: true });
    }
  }

  async createThumbnail(imageUri: string): Promise<ThumbnailResult> {
    try {
      // Get original file info
      const originalInfo = await FileSystem.getInfoAsync(imageUri);
      const originalSize = originalInfo.exists && 'size' in originalInfo ? originalInfo.size : 0;

      // Generate thumbnail
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 150, height: 150 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      // Generate unique filename based on image hash
      const hash = await this.calculateImageHash(imageUri);
      const thumbnailFilename = `thumb_${hash}.jpg`;
      const thumbnailPath = `${this.thumbnailDir}${thumbnailFilename}`;

      // Move thumbnail to permanent location
      await FileSystem.moveAsync({
        from: manipulatedImage.uri,
        to: thumbnailPath,
      });

      // Get thumbnail size
      const thumbnailInfo = await FileSystem.getInfoAsync(thumbnailPath);
      const thumbnailSize = thumbnailInfo.exists && 'size' in thumbnailInfo ? thumbnailInfo.size : 0;

      return {
        thumbnailUri: thumbnailPath,
        originalSize,
        thumbnailSize,
        compressionRatio: originalSize > 0 ? (originalSize - thumbnailSize) / originalSize : 0,
      };
    } catch (error) {
      console.error('Error creating thumbnail:', error);
      throw error;
    }
  }

  async calculateImageHash(imageUri: string): Promise<string> {
    try {
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Calculate SHA256 hash
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        base64,
        { encoding: Crypto.CryptoEncoding.HEX }
      );
      
      return hash;
    } catch (error) {
      console.error('Error calculating image hash:', error);
      // Fallback to timestamp-based hash
      return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${imageUri}_${Date.now()}`,
        { encoding: Crypto.CryptoEncoding.HEX }
      );
    }
  }

  async getImageInfo(imageUri: string): Promise<ImageInfo> {
    try {
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      
      // Get image dimensions
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [], // No manipulations, just get info
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      // Try to get EXIF data if it's from media library
      let takenDate: Date | undefined;
      
      if (imageUri.includes('asset')) {
        try {
          const assetId = imageUri.split('/').pop()?.split('.')[0];
          if (assetId) {
            const asset = await MediaLibrary.getAssetInfoAsync(assetId);
            takenDate = new Date(asset.creationTime);
          }
        } catch (e) {
          console.log('Could not get EXIF date:', e);
        }
      }

      // Fallback to file modification time
      if (!takenDate && fileInfo.exists && 'modificationTime' in fileInfo) {
        takenDate = new Date(fileInfo.modificationTime * 1000);
      }

      return {
        width: manipulatedImage.width,
        height: manipulatedImage.height,
        size: fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0,
        takenDate,
      };
    } catch (error) {
      console.error('Error getting image info:', error);
      return {
        width: 0,
        height: 0,
        size: 0,
      };
    }
  }

  async cleanupUnusedThumbnails(usedThumbnailUris: string[]): Promise<number> {
    try {
      const thumbnails = await FileSystem.readDirectoryAsync(this.thumbnailDir);
      let deletedCount = 0;

      for (const thumbnail of thumbnails) {
        const thumbnailPath = `${this.thumbnailDir}${thumbnail}`;
        if (!usedThumbnailUris.includes(thumbnailPath)) {
          await FileSystem.deleteAsync(thumbnailPath, { idempotent: true });
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up thumbnails:', error);
      return 0;
    }
  }

  async getThumbnailStorageSize(): Promise<number> {
    try {
      const thumbnails = await FileSystem.readDirectoryAsync(this.thumbnailDir);
      let totalSize = 0;

      for (const thumbnail of thumbnails) {
        const info = await FileSystem.getInfoAsync(`${this.thumbnailDir}${thumbnail}`);
        totalSize += info.exists && 'size' in info ? info.size : 0;
      }

      return totalSize;
    } catch (error) {
      console.error('Error calculating thumbnail storage:', error);
      return 0;
    }
  }
}

export const thumbnailService = new ThumbnailService();