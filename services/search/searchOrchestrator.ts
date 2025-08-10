import { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import type { Document } from '../database/models/Document';
import { 
  SearchResult, 
  SearchOptions, 
  ParsedQuery, 
  QueryContext,
  SearchCache,
  ScoredDocument,
  QueryStack,
  SearchFilter
} from './advancedSearch/searchTypes';
import { AdvancedQueryParser } from './advancedSearch/advancedQueryParser';
import { RankingEngine } from './advancedSearch/rankingEngine';
import { SimpleEmbeddingService } from './simpleEmbeddingService';
import { PhoneticMatcher } from './phoneticMatcher';
import { semanticSearchService } from './advancedSearch/semanticSearchService';

export class SearchOrchestrator {
  private queryParser: AdvancedQueryParser;
  private rankingEngine: RankingEngine;
  private embeddingService: SimpleEmbeddingService;
  private phoneticMatcher: PhoneticMatcher;
  private cache: Map<string, SearchCache>;
  private queryStack: QueryStack | null = null;
  private database: Database;
  private useOnnxIfAvailable: boolean = true;

  constructor(database: Database) {
    this.database = database;
    this.queryParser = new AdvancedQueryParser();
    this.rankingEngine = new RankingEngine();
    this.embeddingService = new SimpleEmbeddingService();
    this.phoneticMatcher = new PhoneticMatcher();
    this.cache = new Map();
    
    // Try to initialize ONNX semantic search
    this.initializeSemanticSearch();
  }
  
  private async initializeSemanticSearch(): Promise<void> {
    if (this.useOnnxIfAvailable) {
      try {
        await semanticSearchService.initialize();
        if (semanticSearchService.isLoaded) {
          console.log('ONNX semantic search initialized successfully');
        } else {
          console.log('ONNX not available, using enhanced fallback embeddings');
          this.useOnnxIfAvailable = false;
        }
      } catch (error) {
        console.warn('Semantic search initialization failed, using fallback:', error);
        this.useOnnxIfAvailable = false;
      }
    }
  }

  async search(
    query: string,
    options: SearchOptions = {},
    context?: QueryContext
  ): Promise<SearchResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = this.getCachedResult(query);
    if (cached && !options.maxResults) {
      return cached;
    }

    // Parse the query
    const parsedQuery = this.queryParser.parse(query);
    
    // Apply context if available
    if (context) {
      this.applyContext(parsedQuery, context);
    }

    // Fetch documents based on parsed query
    const documents = await this.fetchDocuments(parsedQuery, options);
    
    // Generate embeddings if semantic search is enabled
    let searchVectors: Map<string, number[]> | undefined;
    let queryVector: number[] | undefined;
    
    if (options.useSemanticSearch !== false && documents.length > 0) {
      try {
        // Use ONNX model if available, otherwise fallback to simple embeddings
        if (this.useOnnxIfAvailable && semanticSearchService.isLoaded) {
          queryVector = await semanticSearchService.generateEmbedding(query);
          searchVectors = await this.generateDocumentEmbeddingsWithOnnx(documents);
        } else {
          queryVector = await this.embeddingService.generateEmbedding(query);
          searchVectors = await this.generateDocumentEmbeddings(documents);
        }
      } catch (error) {
        console.warn('Semantic search failed, falling back to keyword search:', error);
      }
    }

    // Rank documents
    const scoredDocuments = this.rankingEngine.rankDocuments(
      documents,
      parsedQuery,
      searchVectors,
      queryVector
    );

    // Apply post-processing
    const finalDocuments = this.postProcess(scoredDocuments, parsedQuery, options);
    
    // Generate suggestions
    const suggestions = this.queryParser.extractQuerySuggestions(
      query,
      finalDocuments
    );

    // Build result
    const result: SearchResult = {
      documents: finalDocuments,
      query: parsedQuery,
      totalCount: finalDocuments.length,
      executionTime: Date.now() - startTime,
      searchMethod: queryVector ? 'hybrid' : 'keyword',
      filters: this.extractFilters(parsedQuery),
      suggestions
    };

    // Cache the result
    this.cacheResult(query, result);

    return result;
  }

  async searchWithRefinement(
    baseQuery: string,
    refinement: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    // Parse and merge queries
    const parsedQuery = this.queryParser.parseAndRefine(baseQuery, refinement);
    
    // Update query stack
    if (!this.queryStack) {
      this.queryStack = {
        baseQuery: this.queryParser.parse(baseQuery),
        refinements: [],
        activeFilters: this.extractFilters(parsedQuery)
      };
    }
    
    const refinedQuery = this.queryParser.parse(refinement);
    this.queryStack.refinements.push(refinedQuery);
    this.queryStack.activeFilters = this.extractFilters(parsedQuery);

    // Perform search with merged query
    const result = await this.search(parsedQuery.rawQuery, options);
    
    // Add stack information to result
    return {
      ...result,
      filters: this.queryStack.activeFilters
    };
  }

  clearQueryStack(): void {
    this.queryStack = null;
  }

  getQueryStack(): QueryStack | null {
    return this.queryStack;
  }

  private async fetchDocuments(
    query: ParsedQuery,
    options: SearchOptions
  ): Promise<Document[]> {
    const documentsCollection = this.database.collections.get<Document>('documents');
    const conditions: any[] = [];
    let shouldSortByDate = false;
    let limitCount: number | undefined;

    // Apply temporal filter
    if (query.temporal) {
      if (query.temporal.type === 'count' && query.temporal.count) {
        // For count queries, we'll sort by date and limit in post-processing
        shouldSortByDate = true;
        limitCount = query.temporal.count;
        
        // Filter by document type if specified
        if (query.temporal.documentType) {
          conditions.push(Q.where('document_type', query.temporal.documentType));
        }
      } else {
        // Date range filter
        if (query.temporal.startDate) {
          conditions.push(Q.where('date', Q.gte(query.temporal.startDate.getTime())));
        }
        if (query.temporal.endDate) {
          conditions.push(Q.where('date', Q.lte(query.temporal.endDate.getTime())));
        }
      }
    }

    // Apply document type filter
    if (query.documentTypes && query.documentTypes.length > 0) {
      conditions.push(Q.where('document_type', Q.oneOf(query.documentTypes)));
    }

    // Apply amount filter
    if (query.amount) {
      switch (query.amount.operator) {
        case 'equals':
          const tolerance = query.amount.tolerance || 0.01;
          conditions.push(
            Q.where('total_amount', Q.gte(query.amount.value - tolerance)),
            Q.where('total_amount', Q.lte(query.amount.value + tolerance))
          );
          break;
        case 'greater':
          conditions.push(Q.where('total_amount', Q.gt(query.amount.value)));
          break;
        case 'less':
          conditions.push(Q.where('total_amount', Q.lt(query.amount.value)));
          break;
        case 'between':
          conditions.push(
            Q.where('total_amount', Q.gte(query.amount.value)),
            Q.where('total_amount', Q.lte(query.amount.maxValue || query.amount.value))
          );
          break;
      }
    }

    // Apply vendor filter using text search
    if (query.vendor && query.vendor.length > 0) {
      // We'll filter vendors in post-processing since WatermelonDB doesn't support
      // complex text queries directly
    }

    // Apply keyword search
    if (query.keywords.length > 0) {
      // For keywords, we'll need to do text search in post-processing
      // since WatermelonDB doesn't have full-text search
    }

    // Build and execute query
    let queryBuilder = documentsCollection.query();
    
    if (conditions.length > 0) {
      queryBuilder = queryBuilder.extend(...conditions);
    }
    
    // Apply sorting if needed
    if (shouldSortByDate) {
      queryBuilder = queryBuilder.sortBy('date', Q.desc);
    }

    let documents = await queryBuilder.fetch();

    // Apply limit in post-processing since WatermelonDB doesn't have take()
    if (limitCount && limitCount > 0) {
      documents = documents.slice(0, limitCount);
    } else if (options.maxResults && options.maxResults > 0) {
      documents = documents.slice(0, options.maxResults);
    }

    // Post-filter for text-based queries (vendor, keywords)
    return this.filterDocumentsByText(documents, query, options);
  }

  private async filterDocumentsByText(
    documents: Document[],
    query: ParsedQuery,
    options: SearchOptions
  ): Promise<Document[]> {
    let filtered = [...documents];

    // Filter by vendor
    if (query.vendor && query.vendor.length > 0) {
      filtered = filtered.filter(doc => {
        if (!doc.vendor) return false;
        
        const docVendor = doc.vendor.toLowerCase();
        return query.vendor!.some(vendor => {
          const vendorLower = vendor.toLowerCase();
          
          // Exact or contains match
          if (docVendor.includes(vendorLower) || vendorLower.includes(docVendor)) {
            return true;
          }
          
          // Phonetic match if enabled
          if (options.usePhoneticMatching !== false) {
            return this.phoneticMatcher.isPhoneticMatch(docVendor, vendorLower);
          }
          
          return false;
        });
      });
    }

    // Filter by keywords in OCR text
    if (query.keywords.length > 0 && options.useFuzzyMatching === false) {
      filtered = filtered.filter(doc => {
        const docText = this.getDocumentText(doc).toLowerCase();
        
        // Check if at least some keywords match
        const matchCount = query.keywords.filter(keyword => 
          docText.includes(keyword.toLowerCase())
        ).length;
        
        // Require at least 50% of keywords to match
        return matchCount >= Math.ceil(query.keywords.length * 0.5);
      });
    }

    return filtered;
  }

  private async generateDocumentEmbeddings(
    documents: Document[]
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();
    
    for (const doc of documents) {
      // Check if document already has embeddings
      if (doc.searchVector && doc.searchVector.length > 0) {
        embeddings.set(doc.id, doc.searchVector);
      } else {
        // Generate embedding for document
        const text = this.getDocumentText(doc);
        const embedding = await this.embeddingService.generateEmbedding(text);
        embeddings.set(doc.id, embedding);
        
        // Optionally save embedding to database for future use
        this.saveEmbedding(doc.id, embedding);
      }
    }
    
    return embeddings;
  }
  
  private async generateDocumentEmbeddingsWithOnnx(
    documents: Document[]
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();
    const docsNeedingEmbeddings: Document[] = [];
    
    // Check for existing embeddings
    for (const doc of documents) {
      if (doc.searchVector && doc.searchVector.length === semanticSearchService.outputSize) {
        // Use existing ONNX embeddings if they match the expected size
        embeddings.set(doc.id, doc.searchVector);
      } else {
        docsNeedingEmbeddings.push(doc);
      }
    }
    
    // Generate embeddings for documents that need them
    if (docsNeedingEmbeddings.length > 0) {
      const texts = docsNeedingEmbeddings.map(doc => this.getDocumentText(doc));
      const newEmbeddings = await semanticSearchService.generateBatchEmbeddings(texts);
      
      for (let i = 0; i < docsNeedingEmbeddings.length; i++) {
        const doc = docsNeedingEmbeddings[i];
        const embedding = newEmbeddings[i];
        embeddings.set(doc.id, embedding);
        
        // Save for future use
        this.saveEmbedding(doc.id, embedding);
      }
    }
    
    return embeddings;
  }

  private async saveEmbedding(documentId: string, embedding: number[]): Promise<void> {
    try {
      await this.database.write(async () => {
        const document = await this.database.collections
          .get<Document>('documents')
          .find(documentId);
        
        await document.update((doc: Document) => {
          (doc as any).searchVector = embedding;
        });
      });
    } catch (error) {
      console.warn('Failed to save embedding:', error);
    }
  }

  private postProcess(
    documents: ScoredDocument[],
    query: ParsedQuery,
    options: SearchOptions
  ): ScoredDocument[] {
    let processed = [...documents];
    
    // Apply minimum confidence filter
    if (options.minConfidence) {
      processed = processed.filter(doc => doc.confidence >= options.minConfidence);
    }
    
    // Boost recent documents if no specific date filter
    if (!query.temporal) {
      processed = this.rankingEngine.boostRecent(processed);
    }
    
    // Apply final limit
    if (query.limit) {
      processed = processed.slice(0, query.limit);
    } else if (options.maxResults) {
      processed = processed.slice(0, options.maxResults);
    }
    
    return processed;
  }

  private extractFilters(query: ParsedQuery): SearchFilter {
    return {
      temporal: query.temporal,
      amount: query.amount,
      vendor: query.vendor,
      documentTypes: query.documentTypes,
      keywords: query.keywords
    };
  }

  private applyContext(query: ParsedQuery, context: QueryContext): void {
    // Apply user preferences
    if (context.userPreferences) {
      // Default document types if none specified
      if (!query.documentTypes && context.userPreferences.preferredDocumentTypes) {
        query.documentTypes = context.userPreferences.preferredDocumentTypes;
      }
      
      // Default currency if not specified
      if (query.amount && !query.amount.currency && context.userPreferences.currency) {
        query.amount.currency = context.userPreferences.currency;
      }
    }
    
    // Apply active filters from context
    if (context.activeFilters) {
      // Merge filters
      if (context.activeFilters.temporal && !query.temporal) {
        query.temporal = context.activeFilters.temporal;
      }
      if (context.activeFilters.vendor && !query.vendor) {
        query.vendor = context.activeFilters.vendor;
      }
    }
  }

  private getDocumentText(doc: Document): string {
    const parts = [
      doc.ocrText || '',
      doc.vendor || '',
      doc.documentType || '',
      ...(doc.keywords || [])
    ];
    
    if (doc.metadata) {
      // Add metadata fields
      const metadata = doc.metadata as any;
      if (metadata.items) {
        parts.push(...metadata.items.map((item: any) => item.description || ''));
      }
    }
    
    return parts.filter(Boolean).join(' ');
  }

  private getCachedResult(query: string): SearchResult | null {
    const cached = this.cache.get(query);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.ttl) {
        return cached.results;
      }
      // Remove expired cache
      this.cache.delete(query);
    }
    
    return null;
  }

  private cacheResult(query: string, result: SearchResult): void {
    // Limit cache size
    if (this.cache.size > 50) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < 10; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
    
    this.cache.set(query, {
      query,
      results: result,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000 // 5 minutes
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  async getAggregatedData(query: ParsedQuery): Promise<any> {
    const documents = await this.fetchDocuments(query, {});
    
    if (query.intent.includes('count')) {
      return {
        count: documents.length,
        documentTypes: this.groupByDocumentType(documents),
        dateRange: this.getDateRange(documents)
      };
    }
    
    if (query.intent.includes('aggregate')) {
      return {
        totalAmount: this.calculateTotalAmount(documents),
        averageAmount: this.calculateAverageAmount(documents),
        count: documents.length,
        vendors: this.groupByVendor(documents),
        documentTypes: this.groupByDocumentType(documents)
      };
    }
    
    return null;
  }

  private groupByDocumentType(documents: Document[]): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const doc of documents) {
      const type = doc.documentType || 'other';
      groups[type] = (groups[type] || 0) + 1;
    }
    
    return groups;
  }

  private groupByVendor(documents: Document[]): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const doc of documents) {
      if (doc.vendor) {
        groups[doc.vendor] = (groups[doc.vendor] || 0) + 1;
      }
    }
    
    return groups;
  }

  private calculateTotalAmount(documents: Document[]): number {
    return documents.reduce((sum, doc) => sum + (doc.totalAmount || 0), 0);
  }

  private calculateAverageAmount(documents: Document[]): number {
    const docsWithAmount = documents.filter(doc => doc.totalAmount !== undefined);
    if (docsWithAmount.length === 0) return 0;
    
    const total = this.calculateTotalAmount(docsWithAmount);
    return total / docsWithAmount.length;
  }

  private getDateRange(documents: Document[]): { min: Date | null; max: Date | null } {
    const dates = documents
      .filter(doc => doc.date)
      .map(doc => new Date(doc.date!));
    
    if (dates.length === 0) {
      return { min: null, max: null };
    }
    
    return {
      min: new Date(Math.min(...dates.map(d => d.getTime()))),
      max: new Date(Math.max(...dates.map(d => d.getTime())))
    };
  }
}