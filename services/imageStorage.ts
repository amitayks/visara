import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const DOCUMENTS_DIR = `${FileSystem.documentDirectory}visara_documents/`;
const THUMBNAILS_DIR = `${FileSystem.documentDirectory}visara_thumbnails/`;

export class ImageStorageService {
  constructor() {
    console.log('ImageStorageService initializing...');
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    try {
      const docsDirInfo = await FileSystem.getInfoAsync(DOCUMENTS_DIR);
      if (!docsDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(DOCUMENTS_DIR, { intermediates: true });
        console.log('Created documents directory:', DOCUMENTS_DIR);
      }

      const thumbsDirInfo = await FileSystem.getInfoAsync(THUMBNAILS_DIR);
      if (!thumbsDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(THUMBNAILS_DIR, { intermediates: true });
        console.log('Created thumbnails directory:', THUMBNAILS_DIR);
      }
    } catch (error) {
      console.error('Error creating directories:', error);
    }
  }

  async copyImageToPermanentStorage(tempUri: string, imageHash?: string): Promise<string> {
    try {
      console.log('Copying image to permanent storage from:', tempUri);
      
      // First ensure directories exist
      await this.ensureDirectories();
      
      // Generate a unique filename using hash or crypto
      const hash = imageHash || await this.generateHash(tempUri);
      const extension = this.getFileExtension(tempUri);
      const filename = `${hash}${extension}`;
      const permanentUri = `${DOCUMENTS_DIR}${filename}`;

      // Check if file already exists
      const fileInfo = await FileSystem.getInfoAsync(permanentUri);
      if (fileInfo.exists) {
        console.log('Image already exists in permanent storage:', permanentUri);
        return permanentUri;
      }

      // Check if source file exists
      const sourceInfo = await FileSystem.getInfoAsync(tempUri);
      if (!sourceInfo.exists) {
        console.error('Source file does not exist:', tempUri);
        return tempUri;
      }

      // Copy the file to permanent storage
      await FileSystem.copyAsync({
        from: tempUri,
        to: permanentUri
      });

      console.log('Image successfully copied to:', permanentUri);
      return permanentUri;
    } catch (error) {
      console.error('Error copying image to permanent storage:', error);
      console.error('Error details:', JSON.stringify(error));
      // Return original URI if copy fails
      return tempUri;
    }
  }

  async copyThumbnailToPermanentStorage(tempUri: string, imageHash?: string): Promise<string> {
    try {
      console.log('Copying thumbnail to permanent storage from:', tempUri);
      
      // First ensure directories exist
      await this.ensureDirectories();
      
      const hash = imageHash || await this.generateHash(tempUri);
      const extension = this.getFileExtension(tempUri);
      const filename = `${hash}_thumb${extension}`;
      const permanentUri = `${THUMBNAILS_DIR}${filename}`;

      // Check if file already exists
      const fileInfo = await FileSystem.getInfoAsync(permanentUri);
      if (fileInfo.exists) {
        console.log('Thumbnail already exists in permanent storage:', permanentUri);
        return permanentUri;
      }

      // Check if source file exists
      const sourceInfo = await FileSystem.getInfoAsync(tempUri);
      if (!sourceInfo.exists) {
        console.error('Source thumbnail does not exist:', tempUri);
        return tempUri;
      }

      // Copy the file to permanent storage
      await FileSystem.copyAsync({
        from: tempUri,
        to: permanentUri
      });

      console.log('Thumbnail successfully copied to:', permanentUri);
      return permanentUri;
    } catch (error) {
      console.error('Error copying thumbnail to permanent storage:', error);
      console.error('Error details:', JSON.stringify(error));
      return tempUri;
    }
  }

  async deleteImage(imageUri: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(imageUri, { idempotent: true });
        console.log('Deleted image:', imageUri);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }

  async deleteThumbnail(thumbnailUri: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(thumbnailUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(thumbnailUri, { idempotent: true });
        console.log('Deleted thumbnail:', thumbnailUri);
      }
    } catch (error) {
      console.error('Error deleting thumbnail:', error);
    }
  }

  private async generateHash(uri: string): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 9);
    const data = `${uri}-${timestamp}-${random}`;
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data
    );
    return hash.substring(0, 16); // Use first 16 characters
  }

  private getFileExtension(uri: string): string {
    const match = uri.match(/\.([^.]+)$/);
    return match ? `.${match[1]}` : '.jpg'; // Default to .jpg if no extension found
  }

  async getStorageInfo(): Promise<{
    documentsCount: number;
    thumbnailsCount: number;
    totalSizeMB: number;
  }> {
    try {
      const docsInfo = await FileSystem.readDirectoryAsync(DOCUMENTS_DIR);
      const thumbsInfo = await FileSystem.readDirectoryAsync(THUMBNAILS_DIR);
      
      let totalSize = 0;
      
      // Calculate size of documents
      for (const file of docsInfo) {
        const fileInfo = await FileSystem.getInfoAsync(`${DOCUMENTS_DIR}${file}`);
        if (fileInfo.exists && 'size' in fileInfo) {
          totalSize += fileInfo.size;
        }
      }
      
      // Calculate size of thumbnails
      for (const file of thumbsInfo) {
        const fileInfo = await FileSystem.getInfoAsync(`${THUMBNAILS_DIR}${file}`);
        if (fileInfo.exists && 'size' in fileInfo) {
          totalSize += fileInfo.size;
        }
      }
      
      return {
        documentsCount: docsInfo.length,
        thumbnailsCount: thumbsInfo.length,
        totalSizeMB: totalSize / (1024 * 1024)
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        documentsCount: 0,
        thumbnailsCount: 0,
        totalSizeMB: 0
      };
    }
  }

  async clearAllImages(): Promise<void> {
    try {
      await FileSystem.deleteAsync(DOCUMENTS_DIR, { idempotent: true });
      await FileSystem.deleteAsync(THUMBNAILS_DIR, { idempotent: true });
      await this.ensureDirectories();
      console.log('Cleared all images and thumbnails');
    } catch (error) {
      console.error('Error clearing images:', error);
    }
  }
}

export const imageStorage = new ImageStorageService();