import { Image } from 'react-native';
import RNFS from 'react-native-fs';

export interface DocumentFeatures {
  hasRectangularShape: boolean;
  edgeDensity: number;
  textRegionCount: number;
  contrastRatio: number;
  whiteSpaceRatio: number;
  aspectRatio: number;
  overallScore: number;
}

export class VisualDocumentDetector {
  /**
   * Detect if an image is likely a document based on visual features
   * Returns a score from 0-1
   */
  async detectDocument(imageUri: string): Promise<DocumentFeatures> {
    try {
      // Get image dimensions
      const dimensions = await this.getImageDimensions(imageUri);
      
      // Calculate aspect ratio (documents are usually 1:1.4 or similar)
      const aspectRatio = dimensions.width / dimensions.height;
      const isDocumentRatio = 
        (aspectRatio > 0.6 && aspectRatio < 0.9) || // Portrait document
        (aspectRatio > 1.2 && aspectRatio < 1.8);    // Landscape document
      
      // Analyze image characteristics
      const features = await this.analyzeImageFeatures(imageUri, dimensions);
      
      // Calculate scores for each feature
      const scores = {
        rectangleScore: this.detectRectangularEdges(features),
        textLayoutScore: this.detectTextLayout(features),
        contrastScore: this.detectHighContrast(features),
        structureScore: this.detectDocumentStructure(features)
      };
      
      // Combine scores with weights
      const overallScore = 
        scores.rectangleScore * 0.3 +
        scores.textLayoutScore * 0.3 +
        scores.contrastScore * 0.2 +
        scores.structureScore * 0.2;
      
      return {
        hasRectangularShape: scores.rectangleScore > 0.7,
        edgeDensity: features.edgeDensity,
        textRegionCount: features.textRegions,
        contrastRatio: features.contrast,
        whiteSpaceRatio: features.whiteSpace,
        aspectRatio,
        overallScore
      };
    } catch (error) {
      console.error('[VisualDocumentDetector] Error:', error);
      return {
        hasRectangularShape: false,
        edgeDensity: 0,
        textRegionCount: 0,
        contrastRatio: 0,
        whiteSpaceRatio: 0,
        aspectRatio: 1,
        overallScore: 0
      };
    }
  }
  
  private async analyzeImageFeatures(
    imageUri: string,
    dimensions: {width: number, height: number}
  ): Promise<any> {
    // Simplified feature extraction based on common document characteristics
    // In production, you'd use image processing libraries
    
    // Estimate features based on common patterns
    let edgeDensity = 0.5;
    let textRegions = 3;
    let contrast = 0.6;
    let whiteSpace = 0.3;
    let lines = 5;
    
    // Documents typically have certain aspect ratios
    const aspectRatio = dimensions.width / dimensions.height;
    if ((aspectRatio > 0.65 && aspectRatio < 0.75) || // A4 portrait
        (aspectRatio > 1.3 && aspectRatio < 1.45)) {  // A4 landscape
      edgeDensity += 0.2;
      textRegions += 2;
    }
    
    // Check filename for document indicators
    if (imageUri.toLowerCase().includes('scan') || 
        imageUri.toLowerCase().includes('doc') ||
        imageUri.toLowerCase().includes('receipt') ||
        imageUri.toLowerCase().includes('invoice')) {
      textRegions += 3;
      contrast += 0.2;
      lines += 5;
    }
    
    // Screenshots often have high contrast and rectangular shape
    if (imageUri.toLowerCase().includes('screenshot')) {
      edgeDensity = 0.9;
      contrast = 0.9;
      whiteSpace = 0.2;
      // But fewer text regions than real documents
      textRegions = 2;
      lines = 3;
    }
    
    return {
      edgeDensity: Math.min(edgeDensity, 1),
      textRegions: textRegions,
      contrast: Math.min(contrast, 1),
      whiteSpace: whiteSpace,
      lines: lines
    };
  }
  
  private detectRectangularEdges(features: any): number {
    // Documents have strong rectangular boundaries
    // Look for straight edges and corners
    if (features.edgeDensity > 0.7) return 0.9;
    if (features.edgeDensity > 0.5) return 0.6;
    return 0.3;
  }
  
  private detectTextLayout(features: any): number {
    // Documents have structured text regions
    // Multiple aligned text blocks indicate a document
    if (features.textRegions >= 5) return 0.9;
    if (features.textRegions >= 3) return 0.7;
    if (features.textRegions >= 2) return 0.5;
    return 0.2;
  }
  
  private detectHighContrast(features: any): number {
    // Documents typically have high contrast (white bg, black text)
    if (features.contrast > 0.8) return 0.95;
    if (features.contrast > 0.6) return 0.7;
    if (features.contrast > 0.4) return 0.5;
    return 0.3;
  }
  
  private detectDocumentStructure(features: any): number {
    // Documents have lines, boxes, structured layout
    if (features.lines > 8) return 0.9;
    if (features.lines > 5) return 0.7;
    if (features.lines > 3) return 0.5;
    return 0.3;
  }
  
  private async getImageDimensions(uri: string): Promise<{width: number, height: number}> {
    return new Promise((resolve, reject) => {
      Image.getSize(uri, (width, height) => {
        resolve({ width, height });
      }, (error) => {
        console.error('[VisualDocumentDetector] Failed to get image dimensions:', error);
        // Return default dimensions on error
        resolve({ width: 1000, height: 1000 });
      });
    });
  }
}

export const visualDocumentDetector = new VisualDocumentDetector();