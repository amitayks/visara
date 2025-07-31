import { DocumentType } from '../types/hybridTypes';
import type {
  DocumentExtractor,
  ContextualResult,
  GenericDocumentData,
  ValidationResult,
  Entity
} from '../types/hybridTypes';

export class GenericDocumentExtractor implements DocumentExtractor<GenericDocumentData> {
  async initialize(): Promise<void> {
    console.log('Generic document extractor initialized');
  }

  canHandle(documentType: DocumentType): boolean {
    // Generic extractor can handle any document type as fallback
    return true;
  }

  async extract(context: ContextualResult): Promise<GenericDocumentData> {
    console.log('Extracting generic document data...');
    
    const text = context.rawOCR.text;
    const entities = context.context.entities;
    const blocks = context.rawOCR.blocks;

    // Extract title (usually first non-empty line or header)
    const title = this.extractTitle(text, blocks);
    
    // Extract key-value pairs
    const keyValuePairs = this.extractKeyValuePairs(text);
    
    // Compile metadata
    const metadata = this.compileMetadata(context);

    return {
      title,
      content: text,
      entities,
      keyValuePairs,
      metadata
    };
  }

  private extractTitle(text: string, blocks: typeof context.rawOCR.blocks): string | undefined {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) return undefined;

    // Use the first line that looks like a title
    for (const line of lines.slice(0, 3)) {
      const trimmed = line.trim();
      
      // Skip very short lines or lines that look like addresses/numbers
      if (trimmed.length < 3) continue;
      if (/^\d+/.test(trimmed)) continue; // Starts with number
      if (this.looksLikeAddress(trimmed)) continue;
      if (this.looksLikeDate(trimmed)) continue;
      
      // Good candidate for title
      if (trimmed.length <= 100) { // Reasonable title length
        return trimmed;
      }
    }

    // Fallback to first line
    return lines[0].trim();
  }

  private extractKeyValuePairs(text: string): Array<{
    key: string;
    value: string;
    confidence: number;
  }> {
    const pairs: Array<{ key: string; value: string; confidence: number }> = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 3) continue;

      // Pattern 1: Key: Value
      const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        const key = colonMatch[1].trim();
        const value = colonMatch[2].trim();
        
        if (key.length > 0 && value.length > 0 && key.length < 50) {
          pairs.push({
            key,
            value,
            confidence: 0.8
          });
          continue;
        }
      }

      // Pattern 2: Key - Value
      const dashMatch = trimmed.match(/^([^-]+)-\s*(.+)$/);
      if (dashMatch) {
        const key = dashMatch[1].trim();
        const value = dashMatch[2].trim();
        
        if (key.length > 0 && value.length > 0 && key.length < 50) {
          pairs.push({
            key,
            value,
            confidence: 0.7
          });
          continue;
        }
      }

      // Pattern 3: Key=Value
      const equalsMatch = trimmed.match(/^([^=]+)=\s*(.+)$/);
      if (equalsMatch) {
        const key = equalsMatch[1].trim();
        const value = equalsMatch[2].trim();
        
        if (key.length > 0 && value.length > 0 && key.length < 50) {
          pairs.push({
            key,
            value,
            confidence: 0.6
          });
          continue;
        }
      }

      // Pattern 4: Two words/phrases separated by spaces (heuristic)
      const words = trimmed.split(/\s+/);
      if (words.length >= 2 && words.length <= 6) {
        const possibleKey = words.slice(0, Math.ceil(words.length / 2)).join(' ');
        const possibleValue = words.slice(Math.ceil(words.length / 2)).join(' ');
        
        if (this.looksLikeKeyValuePair(possibleKey, possibleValue)) {
          pairs.push({
            key: possibleKey,
            value: possibleValue,
            confidence: 0.5
          });
        }
      }
    }

    // Remove duplicates and sort by confidence
    const uniquePairs = pairs.filter((pair, index, array) => 
      array.findIndex(p => p.key.toLowerCase() === pair.key.toLowerCase()) === index
    );

    return uniquePairs.sort((a, b) => b.confidence - a.confidence);
  }

  private compileMetadata(context: ContextualResult): Record<string, any> {
    return {
      documentType: context.documentType,
      confidence: context.confidence,
      detectedLanguages: context.rawOCR.detectedLanguages,
      ocrConfidence: context.rawOCR.confidence,
      processingTime: context.rawOCR.processingTime,
      blockCount: context.rawOCR.blocks.length,
      textLength: context.rawOCR.text.length,
      hasRTLText: context.context.layout.textDirection === 'rtl' || context.context.layout.textDirection === 'mixed',
      layoutInfo: {
        orientation: context.context.layout.orientation,
        columns: context.context.layout.columns,
        hasTable: context.context.layout.hasTable,
        hasHeader: context.context.layout.hasHeader,
        hasFooter: context.context.layout.hasFooter
      },
      entityCounts: this.countEntitiesByType(context.context.entities),
      extractionTimestamp: new Date().toISOString()
    };
  }

  private countEntitiesByType(entities: Entity[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const entity of entities) {
      const type = entity.type;
      counts[type] = (counts[type] || 0) + 1;
    }
    
    return counts;
  }

  // Helper methods
  private looksLikeAddress(text: string): boolean {
    return /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)/i.test(text);
  }

  private looksLikeDate(text: string): boolean {
    return /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(text) || 
           /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i.test(text);
  }

  private looksLikeKeyValuePair(key: string, value: string): boolean {
    // Heuristics to determine if two strings form a meaningful key-value pair
    
    // Key should not be too long
    if (key.length > 30) return false;
    
    // Value should not be empty
    if (value.length === 0) return false;
    
    // Key should not contain numbers at the start (likely not a label)
    if (/^\d/.test(key)) return false;
    
    // Key should contain letters
    if (!/[a-zA-Z]/.test(key)) return false;
    
    // Value should not be just punctuation
    if (/^[^\w\s]+$/.test(value)) return false;
    
    // Check for common key patterns
    const commonKeyPatterns = [
      /name/i, /number/i, /date/i, /time/i, /address/i, /phone/i, /email/i,
      /amount/i, /total/i, /price/i, /cost/i, /fee/i, /tax/i,
      /id/i, /code/i, /reference/i, /order/i, /invoice/i, /receipt/i,
      /status/i, /type/i, /category/i, /description/i
    ];
    
    const hasCommonKeyPattern = commonKeyPatterns.some(pattern => pattern.test(key));
    
    // Higher confidence if key matches common patterns
    return hasCommonKeyPattern || key.length <= 20;
  }

  async validate(data: GenericDocumentData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let confidence = 0.7; // Base confidence for generic extraction

    // Validate content
    if (!data.content || data.content.trim().length === 0) {
      errors.push('Document content is empty');
      confidence = 0;
    } else {
      // Adjust confidence based on content quality
      const contentLength = data.content.trim().length;
      if (contentLength < 50) {
        warnings.push('Document content is very short');
        confidence -= 0.2;
      } else if (contentLength > 10000) {
        warnings.push('Document content is very long');
        confidence -= 0.1;
      }
    }

    // Validate entities
    if (data.entities.length === 0) {
      warnings.push('No entities extracted from document');
      confidence -= 0.1;
      suggestions.push('Consider manual review to identify key information');
    } else {
      // Boost confidence if we found many entities
      const entityBonus = Math.min(0.2, data.entities.length * 0.02);
      confidence += entityBonus;
    }

    // Validate key-value pairs
    if (data.keyValuePairs.length === 0) {
      suggestions.push('No structured key-value pairs found - document may be unstructured text');
    } else {
      // Boost confidence for well-structured documents
      const highConfidencePairs = data.keyValuePairs.filter(pair => pair.confidence > 0.7);
      const structureBonus = Math.min(0.15, highConfidencePairs.length * 0.03);
      confidence += structureBonus;
    }

    // Validate title
    if (!data.title) {
      suggestions.push('Consider adding a title or header for better organization');
    }

    // Validate metadata
    if (!data.metadata || Object.keys(data.metadata).length === 0) {
      warnings.push('No metadata available');
      confidence -= 0.05;
    }

    // Ensure confidence is within valid range
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      isValid: errors.length === 0,
      confidence,
      errors,
      warnings,
      suggestions
    };
  }

  // Utility methods for enhanced extraction
  async extractTables(text: string): Promise<Array<{
    headers: string[];
    rows: string[][];
    confidence: number;
  }>> {
    const tables: Array<{
      headers: string[];
      rows: string[][];
      confidence: number;
    }> = [];

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for tabular data patterns
    for (let i = 0; i < lines.length - 2; i++) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];

      // Check if lines have similar structure (indicating a table)
      const cols1 = this.splitTableRow(line1);
      const cols2 = this.splitTableRow(line2);
      const cols3 = this.splitTableRow(line3);

      if (cols1.length > 1 && cols1.length === cols2.length && cols2.length === cols3.length) {
        // Potential table found
        const headers = cols1;
        const rows: string[][] = [cols2, cols3];
        
        // Look for more rows
        for (let j = i + 3; j < lines.length; j++) {
          const cols = this.splitTableRow(lines[j]);
          if (cols.length === headers.length) {
            rows.push(cols);
          } else {
            break;
          }
        }

        if (rows.length >= 2) {
          tables.push({
            headers,
            rows,
            confidence: 0.7
          });
        }
      }
    }

    return tables;
  }

  private splitTableRow(line: string): string[] {
    // Try different splitting strategies
    
    // Strategy 1: Multiple spaces
    let cols = line.split(/\s{2,}/).map(col => col.trim()).filter(col => col.length > 0);
    if (cols.length > 1) return cols;
    
    // Strategy 2: Tabs
    cols = line.split('\t').map(col => col.trim()).filter(col => col.length > 0);
    if (cols.length > 1) return cols;
    
    // Strategy 3: Pipe character
    if (line.includes('|')) {
      cols = line.split('|').map(col => col.trim()).filter(col => col.length > 0);
      if (cols.length > 1) return cols;
    }
    
    // Strategy 4: Comma (if looks like CSV)
    if (line.includes(',') && !line.includes('.')) {
      cols = line.split(',').map(col => col.trim()).filter(col => col.length > 0);
      if (cols.length > 1) return cols;
    }

    // Default: return as single column
    return [line];
  }

  async extractSections(text: string): Promise<Array<{
    title: string;
    content: string;
    startLine: number;
    endLine: number;
  }>> {
    const sections: Array<{
      title: string;
      content: string;
      startLine: number;
      endLine: number;
    }> = [];

    const lines = text.split('\n');
    let currentSection: { title: string; content: string[]; startLine: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if line looks like a section header
      if (this.looksLikeSectionHeader(line, lines, i)) {
        // Finalize previous section
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            content: currentSection.content.join('\n'),
            startLine: currentSection.startLine,
            endLine: i - 1
          });
        }

        // Start new section
        currentSection = {
          title: line,
          content: [],
          startLine: i
        };
      } else if (currentSection && line.length > 0) {
        // Add content to current section
        currentSection.content.push(line);
      }
    }

    // Finalize last section
    if (currentSection) {
      sections.push({
        title: currentSection.title,
        content: currentSection.content.join('\n'),
        startLine: currentSection.startLine,
        endLine: lines.length - 1
      });
    }

    return sections;
  }

  private looksLikeSectionHeader(line: string, allLines: string[], index: number): boolean {
    // Various heuristics to identify section headers
    
    // Empty line - not a header
    if (line.length === 0) return false;
    
    // Very long lines are probably not headers
    if (line.length > 100) return false;
    
    // Lines with lots of punctuation are probably not headers
    const punctuationRatio = (line.match(/[^\w\s]/g) || []).length / line.length;
    if (punctuationRatio > 0.3) return false;
    
    // Check if line is followed by content (not another potential header)
    const nextLine = index + 1 < allLines.length ? allLines[index + 1].trim() : '';
    if (nextLine.length === 0 || this.looksLikeSectionHeader(nextLine, allLines, index + 1)) {
      return false; // Headers should have content following them
    }
    
    // Check formatting clues
    const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
    const isTitle = /^[A-Z][a-z]*(?:\s+[A-Z][a-z]*)*:?$/.test(line);
    const isNumbered = /^\d+\.?\s/.test(line);
    const endsWithColon = line.endsWith(':');
    
    return isAllCaps || isTitle || isNumbered || endsWithColon;
  }
}