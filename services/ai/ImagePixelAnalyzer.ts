import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';

export class ImagePixelAnalyzer {
  /**
   * Analyze image characteristics using available methods
   */
  static async analyzeImage(imageUri: string): Promise<{
    contrast: number;
    brightness: number;
    colorCount: number;
    dominantColors: string[];
    hasText: boolean;
    edgeStrength: number;
  }> {
    try {
      // Create tiny thumbnail for analysis (50x50)
      const thumbnail = await ImageResizer.createResizedImage(
        imageUri,
        50,
        50,
        'JPEG',
        100,
        0,
        undefined,
        false
      );
      
      // Read file data
      const base64 = await RNFS.readFile(thumbnail.uri, 'base64');
      
      // Analyze base64 data (simplified analysis)
      const analysis = this.analyzeBase64(base64);
      
      // Cleanup
      await RNFS.unlink(thumbnail.uri);
      
      return analysis;
    } catch (error) {
      console.error('[PixelAnalyzer] Failed:', error);
      return this.getDefaultAnalysis();
    }
  }
  
  private static analyzeBase64(base64: string): any {
    // Simplified analysis based on base64 patterns
    const dataLength = base64.length;
    
    // Compression ratio indicates document vs photo
    // Documents compress better (more uniform colors)
    const compressionRatio = dataLength / (50 * 50 * 3);
    
    return {
      contrast: compressionRatio < 0.5 ? 0.8 : 0.5,
      brightness: 0.6,
      colorCount: compressionRatio < 0.5 ? 10 : 100,
      dominantColors: ['#FFFFFF', '#000000'],
      hasText: compressionRatio < 0.5,
      edgeStrength: compressionRatio < 0.5 ? 0.7 : 0.3
    };
  }
  
  private static getDefaultAnalysis() {
    return {
      contrast: 0.5,
      brightness: 0.5,
      colorCount: 50,
      dominantColors: [],
      hasText: false,
      edgeStrength: 0.5
    };
  }
}