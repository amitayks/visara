import Fuse from 'fuse.js';
import * as chrono from 'chrono-node';
import nlp from 'compromise';
import { embeddingService } from './simpleEmbeddingService';
import { documentStorage } from '../database/documentStorage';
import type Document from '../database/models/Document';

interface SearchOptions {
  useSemanticSearch?: boolean;
  useFuzzySearch?: boolean;
  usePhoneticSearch?: boolean;
  semanticThreshold?: number;
  fuzzyThreshold?: number;
  maxResults?: number;
}

interface ScoredDocument {
  document: Document;
  score: number;
  matchType: 'semantic' | 'fuzzy' | 'exact' | 'phonetic';
  highlights?: string[];
}

export class EnhancedSearchService {
  private fuseInstance: Fuse<Document> | null = null;
  private documentEmbeddings: Map<string, number[]> = new Map();
  
  async initialize() {
    try {
      // Initialize embedding service
      await embeddingService.initialize();
      
      // Pre-compute embeddings for existing documents
      await this.updateDocumentEmbeddings();
    } catch (error) {
      console.error('[EnhancedSearchService] Initialization error:', error);
      throw error;
    }
  }

  async updateDocumentEmbeddings() {
    console.log('[SearchService] Updating document embeddings...');
    const documents = await documentStorage.getAllDocuments();
    
    for (const doc of documents) {
      if (!this.documentEmbeddings.has(doc.id)) {
        const embedding = await this.generateDocumentEmbedding(doc);
        this.documentEmbeddings.set(doc.id, embedding);
      }
    }
    
    // Initialize Fuse.js for fuzzy search
    this.fuseInstance = new Fuse(documents, {
      keys: [
        { name: 'ocrText', weight: 0.4 },
        { name: 'vendor', weight: 0.3 },
        { name: 'keywords', weight: 0.2 },
        { name: 'documentType', weight: 0.1 }
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 3,
    });
    
    console.log(`[SearchService] Updated embeddings for ${documents.length} documents`);
  }

  async search(
    query: string, 
    options: SearchOptions = {}
  ): Promise<ScoredDocument[]> {
    try {
      const {
        useSemanticSearch = true,
        useFuzzySearch = true,
        usePhoneticSearch = true,
        semanticThreshold = 0.7,
        fuzzyThreshold = 0.6,
        maxResults = 20
      } = options;

      console.log('[EnhancedSearchService] Searching for:', query);

      // Parse query for structured information
      const parsedQuery = this.parseQuery(query);
      
      const results: ScoredDocument[] = [];
      const documents = await documentStorage.getAllDocuments();
      console.log('[EnhancedSearchService] Total documents:', documents.length);

      // Apply filters first
      let filteredDocs = await this.applyFilters(documents, parsedQuery);
      console.log('[EnhancedSearchService] Filtered documents:', filteredDocs.length);

    // Semantic search using embeddings
    if (useSemanticSearch && filteredDocs.length > 0) {
      const semanticResults = await this.semanticSearch(
        query, 
        filteredDocs, 
        semanticThreshold
      );
      results.push(...semanticResults);
    }

    // Fuzzy search for typo tolerance
    if (useFuzzySearch && this.fuseInstance) {
      const fuzzyResults = this.fuzzySearch(query, filteredDocs, fuzzyThreshold);
      
      // Merge with semantic results, avoiding duplicates
      fuzzyResults.forEach(result => {
        if (!results.some(r => r.document.id === result.document.id)) {
          results.push(result);
        }
      });
    }

    // Phonetic search for sound-alike matches
    if (usePhoneticSearch) {
      const phoneticResults = this.phoneticSearch(query, filteredDocs);
      
      // Merge phonetic results
      phoneticResults.forEach(result => {
        if (!results.some(r => r.document.id === result.document.id)) {
          results.push(result);
        }
      });
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, maxResults);
    } catch (error) {
      console.error('[EnhancedSearchService] Search error:', error);
      throw error;
    }
  }

  private async generateDocumentEmbedding(doc: Document): Promise<number[]> {
    // Combine relevant text fields for embedding
    const text = [
      doc.ocrText.slice(0, 500), // Limit OCR text length
      doc.vendor || '',
      doc.documentType,
      doc.keywords.join(' '),
      doc.totalAmount ? `${doc.currency || ''} ${doc.totalAmount}` : '',
      doc.date ? new Date(doc.date).toLocaleDateString() : ''
    ].filter(Boolean).join(' ');

    return await embeddingService.generateEmbedding(text);
  }

  private async semanticSearch(
    query: string,
    documents: Document[],
    threshold: number
  ): Promise<ScoredDocument[]> {
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    const results: ScoredDocument[] = [];

    for (const doc of documents) {
      const docEmbedding = this.documentEmbeddings.get(doc.id);
      if (!docEmbedding) continue;

      const similarity = embeddingService.cosineSimilarity(queryEmbedding, docEmbedding);
      
      if (similarity >= threshold) {
        results.push({
          document: doc,
          score: similarity,
          matchType: 'semantic',
          highlights: this.extractHighlights(query, doc),
        });
      }
    }

    return results;
  }

  private fuzzySearch(
    query: string,
    documents: Document[],
    threshold: number
  ): ScoredDocument[] {
    if (!this.fuseInstance) return [];

    // Update Fuse with filtered documents
    this.fuseInstance.setCollection(documents);
    
    const fuseResults = this.fuseInstance.search(query);
    
    return fuseResults
      .filter(result => result.score! <= threshold)
      .map(result => ({
        document: result.item,
        score: 1 - result.score!, // Convert to similarity score
        matchType: 'fuzzy' as const,
        highlights: result.matches?.map(m => m.value || ''),
      }));
  }

  // Simple phonetic matching function
  private simplePhonetic(word: string): string {
    // Basic phonetic transformations
    return word.toLowerCase()
      .replace(/ph/g, 'f')
      .replace(/ght/g, 't')
      .replace(/kn/g, 'n')
      .replace(/wr/g, 'r')
      .replace(/qu/g, 'kw')
      .replace(/[aeiou]/g, '') // Remove vowels for consonant matching
      .replace(/(.)\1+/g, '$1'); // Remove duplicates
  }

  private phoneticSearch(
    query: string,
    documents: Document[]
  ): ScoredDocument[] {
    const queryPhonetic = this.simplePhonetic(query);
    const queryWords = query.toLowerCase().split(/\s+/).map(w => this.simplePhonetic(w));
    const results: ScoredDocument[] = [];

    for (const doc of documents) {
      let phoneticScore = 0;
      
      // Check vendor
      if (doc.vendor) {
        const vendorPhonetic = this.simplePhonetic(doc.vendor);
        if (vendorPhonetic === queryPhonetic) {
          phoneticScore = 0.9;
        } else {
          const vendorWords = doc.vendor.toLowerCase().split(/\s+/).map(w => this.simplePhonetic(w));
          const matchCount = queryWords.filter(qw => 
            vendorWords.some(vw => vw === qw)
          ).length;
          phoneticScore = matchCount / queryWords.length * 0.7;
        }
      }

      // Check OCR text
      if (phoneticScore < 0.5) {
        const textWords = doc.ocrText.toLowerCase()
          .split(/\s+/)
          .slice(0, 100) // Limit for performance
          .map(w => this.simplePhonetic(w));
        
        const matchCount = queryWords.filter(qw => 
          textWords.some(tw => tw === qw)
        ).length;
        
        phoneticScore = Math.max(phoneticScore, matchCount / queryWords.length * 0.5);
      }

      if (phoneticScore > 0.3) {
        results.push({
          document: doc,
          score: phoneticScore,
          matchType: 'phonetic',
          highlights: [],
        });
      }
    }

    return results;
  }

  private parseQuery(query: string): any {
    const parsed: any = {
      text: query,
      dates: [],
      amounts: [],
      vendors: [],
      documentTypes: [],
    };

    // Parse dates using chrono
    const chronoDates = chrono.parse(query);
    parsed.dates = chronoDates.map(d => ({
      start: d.start.date(),
      end: d.end?.date() || d.start.date(),
      text: d.text,
    }));

    // Use NLP to extract entities
    const doc = nlp(query);
    
    // Extract money amounts
    const money = doc.money().out('array');
    parsed.amounts = money.map((m: string) => {
      const match = m.match(/([₪$€£¥]?)\s*([\d,]+\.?\d*)/);
      if (match) {
        return {
          currency: match[1] || 'USD',
          value: parseFloat(match[2].replace(/,/g, '')),
        };
      }
      return null;
    }).filter(Boolean);

    // Extract potential vendor names (capitalized phrases)
    const orgs = doc.organizations().out('array');
    const people = doc.people().out('array');
    parsed.vendors = [...new Set([...orgs, ...people])];

    // Extract document types
    const docTypes = ['receipt', 'invoice', 'id', 'form', 'letter', 'screenshot'];
    const lowerQuery = query.toLowerCase();
    parsed.documentTypes = docTypes.filter(type => lowerQuery.includes(type));

    return parsed;
  }

  private async applyFilters(
    documents: Document[],
    parsedQuery: any
  ): Promise<Document[]> {
    let filtered = [...documents];

    // Filter by date
    if (parsedQuery.dates.length > 0) {
      filtered = filtered.filter(doc => {
        const docDate = doc.date ? new Date(doc.date) : new Date(doc.processedAt);
        return parsedQuery.dates.some((dateRange: any) => 
          docDate >= dateRange.start && docDate <= dateRange.end
        );
      });
    }

    // Filter by amount
    if (parsedQuery.amounts.length > 0) {
      filtered = filtered.filter(doc => {
        if (!doc.totalAmount) return false;
        
        return parsedQuery.amounts.some((amount: any) => {
          const tolerance = amount.value * 0.1; // 10% tolerance
          return Math.abs((doc.totalAmount || 0) - amount.value) <= tolerance;
        });
      });
    }

    // Filter by document type
    if (parsedQuery.documentTypes.length > 0) {
      filtered = filtered.filter(doc => 
        parsedQuery.documentTypes.includes(doc.documentType)
      );
    }

    return filtered;
  }

  private extractHighlights(query: string, doc: Document): string[] {
    const highlights: string[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);
    const text = doc.ocrText.toLowerCase();
    
    // Find sentences containing query words
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const containsQueryWord = queryWords.some(word => 
        sentence.includes(word)
      );
      
      if (containsQueryWord && sentence.trim().length > 10) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }

  // Update embedding when new document is added
  async onDocumentAdded(document: Document) {
    const embedding = await this.generateDocumentEmbedding(document);
    this.documentEmbeddings.set(document.id, embedding);
    
    // Reinitialize Fuse instance
    await this.updateDocumentEmbeddings();
  }

  // Generate response for chat interface
  generateSearchResponse(results: ScoredDocument[]): string {
    if (results.length === 0) {
      return "I couldn't find any documents matching your search. Try using different keywords or checking the spelling.";
    }

    const byType = results.reduce((acc, r) => {
      const type = r.document.documentType;
      if (!acc[type]) acc[type] = 0;
      acc[type]++;
      return acc;
    }, {} as Record<string, number>);

    let response = `Found ${results.length} document${results.length > 1 ? 's' : ''}`;
    
    const types = Object.entries(byType)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
    
    if (types) {
      response += ` (${types})`;
    }

    response += '.';

    // Add match quality info
    const semanticCount = results.filter(r => r.matchType === 'semantic').length;
    if (semanticCount > 0) {
      response += ` ${semanticCount} matched based on meaning.`;
    }

    return response;
  }
}

export const enhancedSearchService = new EnhancedSearchService();