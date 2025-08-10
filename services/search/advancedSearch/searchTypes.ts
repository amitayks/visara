import type Document from '../../database/models/Document';

export type QueryIntent = 
  | 'search'      // Find documents
  | 'filter'      // Apply filters
  | 'count'       // Count documents
  | 'compare'     // Compare attributes
  | 'aggregate'   // Aggregate data
  | 'sort'        // Sort results
  | 'limit';      // Limit results

export type DocumentType = 
  | 'receipt'
  | 'invoice'
  | 'id'
  | 'form'
  | 'letter'
  | 'contract'
  | 'tax'
  | 'medical'
  | 'insurance'
  | 'screenshot'
  | 'other';

export interface ExtractedEntity {
  type: 'vendor' | 'amount' | 'date' | 'documentType' | 'keyword' | 'count';
  value: string | number | Date;
  confidence: number;
  originalText: string;
}

export interface TemporalExpression {
  type: 'absolute' | 'relative' | 'range' | 'quarter' | 'fiscal' | 'count';
  startDate?: Date;
  endDate?: Date;
  count?: number;
  unit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  documentType?: DocumentType;
  direction?: 'past' | 'future' | 'last' | 'next';
}

export interface AmountFilter {
  value: number;
  operator: 'equals' | 'greater' | 'less' | 'between';
  tolerance?: number;
  currency?: string;
  maxValue?: number; // For 'between' operator
}

export interface ParsedQuery {
  rawQuery: string;
  intent: QueryIntent[];
  entities: ExtractedEntity[];
  temporal?: TemporalExpression;
  amount?: AmountFilter;
  vendor?: string[];
  documentTypes?: DocumentType[];
  keywords: string[];
  limit?: number;
  sortBy?: 'date' | 'amount' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  confidence: number;
}

export interface SearchFilter {
  temporal?: TemporalExpression;
  amount?: AmountFilter;
  vendor?: string[];
  documentTypes?: DocumentType[];
  keywords?: string[];
}

export interface QueryStack {
  baseQuery: ParsedQuery;
  refinements: ParsedQuery[];
  activeFilters: SearchFilter;
}

export interface ScoringFactors {
  semanticSimilarity?: number;
  keywordMatch?: number;
  dateRelevance?: number;
  documentTypeMatch?: number;
  phoneticMatch?: number;
  amountMatch?: number;
  vendorMatch?: number;
}

export interface ScoredDocument {
  document: Document;
  score: number;
  scoringFactors: ScoringFactors;
  matchedKeywords: string[];
  confidence: number;
}

export interface SearchResult {
  documents: ScoredDocument[];
  query: ParsedQuery;
  totalCount: number;
  executionTime: number;
  searchMethod: 'semantic' | 'keyword' | 'hybrid' | 'fallback';
  filters: SearchFilter;
  suggestions?: string[];
}

export interface SearchOptions {
  useSemanticSearch?: boolean;
  useFuzzyMatching?: boolean;
  usePhoneticMatching?: boolean;
  maxResults?: number;
  minConfidence?: number;
  includeMetadata?: boolean;
  sortBy?: 'relevance' | 'date' | 'amount';
  sortOrder?: 'asc' | 'desc';
  languageHint?: 'en' | 'he' | 'auto';
}

export interface QueryContext {
  previousQueries?: string[];
  activeFilters?: SearchFilter;
  userPreferences?: {
    preferredDocumentTypes?: DocumentType[];
    dateFormat?: string;
    currency?: string;
  };
}

export interface SearchCache {
  query: string;
  results: SearchResult;
  timestamp: number;
  ttl: number;
}

export interface EmbeddingModel {
  modelPath: string;
  inputSize: number;
  outputSize: number;
  isLoaded: boolean;
  generateEmbedding: (text: string) => Promise<number[]>;
  calculateSimilarity: (embedding1: number[], embedding2: number[]) => number;
}

export interface QueryClassification {
  intent: QueryIntent;
  confidence: number;
  entities: Map<string, ExtractedEntity[]>;
}

export interface RankingWeights {
  semantic: number;
  keyword: number;
  date: number;
  documentType: number;
  phonetic: number;
  amount: number;
  vendor: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  semantic: 0.35,
  keyword: 0.25,
  date: 0.15,
  documentType: 0.1,
  phonetic: 0.05,
  amount: 0.05,
  vendor: 0.05,
};

export const DOCUMENT_TYPE_KEYWORDS: Record<DocumentType, string[]> = {
  receipt: ['receipt', 'purchase', 'payment', 'קבלה', 'רכישה'],
  invoice: ['invoice', 'bill', 'statement', 'חשבונית', 'חשבון'],
  id: ['id', 'identification', 'passport', 'license', 'תעודה', 'דרכון', 'רישיון'],
  form: ['form', 'application', 'טופס', 'בקשה'],
  letter: ['letter', 'correspondence', 'מכתב', 'התכתבות'],
  contract: ['contract', 'agreement', 'חוזה', 'הסכם'],
  tax: ['tax', 'return', 'refund', 'מס', 'החזר'],
  medical: ['medical', 'prescription', 'diagnosis', 'רפואי', 'מרשם', 'אבחנה'],
  insurance: ['insurance', 'policy', 'claim', 'ביטוח', 'פוליסה', 'תביעה'],
  screenshot: ['screenshot', 'screen', 'capture', 'צילום מסך'],
  other: ['document', 'file', 'מסמך', 'קובץ'],
};

export const TEMPORAL_KEYWORDS = {
  relative: {
    last: ['last', 'previous', 'past', 'אחרון', 'קודם', 'האחרונים'],
    next: ['next', 'upcoming', 'future', 'הבא', 'הבאים'],
    recent: ['recent', 'recently', 'lately', 'לאחרונה'],
    today: ['today', 'היום'],
    yesterday: ['yesterday', 'אתמול'],
    tomorrow: ['tomorrow', 'מחר'],
  },
  units: {
    day: ['day', 'days', 'יום', 'ימים'],
    week: ['week', 'weeks', 'שבוע', 'שבועות'],
    month: ['month', 'months', 'חודש', 'חודשים'],
    quarter: ['quarter', 'quarters', 'רבעון', 'רבעונים', 'Q1', 'Q2', 'Q3', 'Q4'],
    year: ['year', 'years', 'שנה', 'שנים'],
  },
  seasons: {
    spring: ['spring', 'אביב'],
    summer: ['summer', 'קיץ'],
    fall: ['fall', 'autumn', 'סתיו'],
    winter: ['winter', 'חורף'],
  },
};

export const AMOUNT_OPERATORS = {
  greater: ['over', 'above', 'more than', 'greater than', '>', 'מעל', 'יותר מ'],
  less: ['under', 'below', 'less than', '<', 'מתחת', 'פחות מ'],
  equals: ['equals', 'exactly', '=', 'שווה', 'בדיוק'],
  between: ['between', 'from...to', 'בין'],
};

export const CURRENCY_SYMBOLS: Record<string, string[]> = {
  USD: ['$', 'USD', 'dollar', 'dollars', 'דולר'],
  EUR: ['€', 'EUR', 'euro', 'euros', 'יורו'],
  ILS: ['₪', 'ILS', 'NIS', 'shekel', 'shekels', 'שקל', 'שקלים'],
  GBP: ['£', 'GBP', 'pound', 'pounds', 'פאונד'],
};