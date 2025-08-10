import { ParsedQuery, QueryIntent, ExtractedEntity, DocumentType } from './searchTypes';
import { AdvancedTemporalParser } from './advancedTemporalParser';
import { EntityExtractor } from './entityExtractor';
import { QueryIntentClassifier } from './queryIntentClassifier';

export class AdvancedQueryParser {
  private temporalParser: AdvancedTemporalParser;
  private entityExtractor: EntityExtractor;
  private intentClassifier: QueryIntentClassifier;

  constructor() {
    this.temporalParser = new AdvancedTemporalParser();
    this.entityExtractor = new EntityExtractor();
    this.intentClassifier = new QueryIntentClassifier();
  }

  parse(query: string): ParsedQuery {
    const normalizedQuery = this.normalizeQuery(query);
    
    // Extract entities first
    const entities = this.entityExtractor.extract(normalizedQuery);
    
    // Classify intent based on query and entities
    const intents = this.intentClassifier.classify(normalizedQuery, entities);
    
    // Parse temporal expressions
    const temporal = this.temporalParser.parse(normalizedQuery);
    
    // Extract specific filters
    const amount = this.entityExtractor.extractAmountFilter(normalizedQuery);
    const vendor = this.entityExtractor.extractVendorNames(normalizedQuery);
    const documentTypes = this.entityExtractor.extractDocumentTypesList(normalizedQuery);
    
    // Extract keywords (removing entities already extracted)
    const keywords = this.extractKeywords(normalizedQuery, entities);
    
    // Determine limit
    const limit = this.extractLimit(normalizedQuery, entities);
    
    // Determine sorting
    const { sortBy, sortOrder } = this.extractSorting(normalizedQuery, intents);
    
    // Calculate overall confidence
    const confidence = this.calculateQueryConfidence(entities, intents, temporal);

    return {
      rawQuery: query,
      intent: intents,
      entities,
      temporal,
      amount,
      vendor: vendor.length > 0 ? vendor : undefined,
      documentTypes: documentTypes.length > 0 ? documentTypes : undefined,
      keywords,
      limit,
      sortBy,
      sortOrder,
      confidence
    };
  }

  parseAndRefine(baseQuery: string, refinement: string): ParsedQuery {
    // Parse both queries
    const base = this.parse(baseQuery);
    const refine = this.parse(refinement);
    
    // Merge the queries, with refinement taking precedence
    return this.mergeQueries(base, refine);
  }

  private normalizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[""]/g, '"') // Normalize quotes
      .replace(/['']/g, "'");
  }

  private extractKeywords(query: string, entities: ExtractedEntity[]): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'about', 'as', 'is', 'was', 'are', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
      'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
      'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'show', 'me',
      'get', 'find', 'search', 'look', 'display', 'give', 'need', 'want'
    ]);

    // Get entity values to exclude
    const entityValues = new Set(
      entities.map(e => String(e.value).toLowerCase())
    );

    // Extract words from query
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !stopWords.has(word))
      .filter(word => !entityValues.has(word))
      .filter(word => !this.isNumeric(word));

    // Remove duplicates and return
    return [...new Set(words)];
  }

  private extractLimit(query: string, entities: ExtractedEntity[]): number | undefined {
    // Check if there's a count entity
    const countEntity = entities.find(e => e.type === 'count');
    if (countEntity && typeof countEntity.value === 'number') {
      return countEntity.value;
    }

    // Check for limit patterns
    const limitPatterns = [
      /(?:show|display|get)\s+(?:me\s+)?(?:the\s+)?(?:last|first|top)\s+(\d+)/i,
      /(?:last|first|top)\s+(\d+)/i,
      /limit\s+(?:to\s+)?(\d+)/i,
    ];

    for (const pattern of limitPatterns) {
      const match = query.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return undefined;
  }

  private extractSorting(
    query: string,
    intents: QueryIntent[]
  ): { sortBy?: 'date' | 'amount' | 'relevance'; sortOrder?: 'asc' | 'desc' } {
    const normalizedQuery = query.toLowerCase();

    // Check for explicit sorting keywords
    if (intents.includes('sort')) {
      // Date sorting
      if (normalizedQuery.includes('latest') || normalizedQuery.includes('newest') ||
          normalizedQuery.includes('recent')) {
        return { sortBy: 'date', sortOrder: 'desc' };
      }
      if (normalizedQuery.includes('oldest') || normalizedQuery.includes('earliest')) {
        return { sortBy: 'date', sortOrder: 'asc' };
      }

      // Amount sorting
      if (normalizedQuery.includes('expensive') || normalizedQuery.includes('highest') ||
          normalizedQuery.includes('most')) {
        return { sortBy: 'amount', sortOrder: 'desc' };
      }
      if (normalizedQuery.includes('cheapest') || normalizedQuery.includes('lowest') ||
          normalizedQuery.includes('least')) {
        return { sortBy: 'amount', sortOrder: 'asc' };
      }
    }

    // Check for implicit sorting from limit queries
    if (normalizedQuery.includes('last') || normalizedQuery.includes('recent')) {
      return { sortBy: 'date', sortOrder: 'desc' };
    }
    if (normalizedQuery.includes('first') || normalizedQuery.includes('earliest')) {
      return { sortBy: 'date', sortOrder: 'asc' };
    }

    // Default to relevance
    return { sortBy: 'relevance', sortOrder: 'desc' };
  }

  private calculateQueryConfidence(
    entities: ExtractedEntity[],
    intents: QueryIntent[],
    temporal: any
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on entity quality
    const avgEntityConfidence = entities.length > 0
      ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length
      : 0;
    confidence += avgEntityConfidence * 0.2;

    // Boost confidence if we have clear intents
    if (intents.length > 0 && !intents.includes('search')) {
      confidence += 0.15;
    }

    // Boost confidence if we have temporal information
    if (temporal) {
      confidence += 0.15;
    }

    // Boost confidence if we have multiple entity types
    const entityTypes = new Set(entities.map(e => e.type));
    if (entityTypes.size >= 2) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  private mergeQueries(base: ParsedQuery, refinement: ParsedQuery): ParsedQuery {
    return {
      rawQuery: `${base.rawQuery} + ${refinement.rawQuery}`,
      intent: this.mergeIntents(base.intent, refinement.intent),
      entities: this.mergeEntities(base.entities, refinement.entities),
      temporal: this.temporalParser.combineTemporalExpressions(
        base.temporal || null,
        refinement.temporal || null
      ) || undefined,
      amount: refinement.amount || base.amount,
      vendor: this.mergeArrays(base.vendor, refinement.vendor),
      documentTypes: this.mergeArrays(base.documentTypes, refinement.documentTypes),
      keywords: this.mergeArrays(base.keywords, refinement.keywords),
      limit: refinement.limit || base.limit,
      sortBy: refinement.sortBy || base.sortBy,
      sortOrder: refinement.sortOrder || base.sortOrder,
      confidence: Math.max(base.confidence, refinement.confidence)
    };
  }

  private mergeIntents(base: QueryIntent[], refinement: QueryIntent[]): QueryIntent[] {
    const merged = [...base, ...refinement];
    return [...new Set(merged)];
  }

  private mergeEntities(base: ExtractedEntity[], refinement: ExtractedEntity[]): ExtractedEntity[] {
    const entityMap = new Map<string, ExtractedEntity>();
    
    // Add base entities
    for (const entity of base) {
      const key = `${entity.type}:${entity.value}`;
      entityMap.set(key, entity);
    }
    
    // Add/override with refinement entities
    for (const entity of refinement) {
      const key = `${entity.type}:${entity.value}`;
      const existing = entityMap.get(key);
      if (existing) {
        // Boost confidence for duplicates
        entity.confidence = Math.min(1.0, existing.confidence + 0.1);
      }
      entityMap.set(key, entity);
    }
    
    return Array.from(entityMap.values());
  }

  private mergeArrays<T>(base?: T[], refinement?: T[]): T[] | undefined {
    if (!base && !refinement) return undefined;
    if (!base) return refinement;
    if (!refinement) return base;
    
    const merged = [...base, ...refinement];
    return [...new Set(merged)];
  }

  private isNumeric(str: string): boolean {
    return !isNaN(Number(str));
  }

  extractQuerySuggestions(query: string, results: any[]): string[] {
    const suggestions: string[] = [];
    const parsed = this.parse(query);
    
    // Suggest date refinements if no temporal filter
    if (!parsed.temporal) {
      suggestions.push(`${query} from last month`);
      suggestions.push(`${query} from this year`);
    }
    
    // Suggest document type filters if not specified
    if (!parsed.documentTypes || parsed.documentTypes.length === 0) {
      const commonTypes: DocumentType[] = ['receipt', 'invoice', 'tax'];
      for (const type of commonTypes) {
        suggestions.push(`${query} ${type}s`);
      }
    }
    
    // Suggest amount filters for financial documents
    if (!parsed.amount && (
      parsed.documentTypes?.includes('receipt') ||
      parsed.documentTypes?.includes('invoice')
    )) {
      suggestions.push(`${query} over $100`);
      suggestions.push(`${query} under $50`);
    }
    
    // Suggest sorting if many results
    if (results.length > 10 && !parsed.sortBy) {
      suggestions.push(`${query} sorted by date`);
      suggestions.push(`${query} sorted by amount`);
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  isCountQuery(query: ParsedQuery): boolean {
    return query.intent.includes('count') || 
           (query.temporal?.type === 'count' && query.temporal.count !== undefined);
  }

  requiresAggregation(query: ParsedQuery): boolean {
    return query.intent.includes('aggregate') || 
           query.intent.includes('count');
  }
}