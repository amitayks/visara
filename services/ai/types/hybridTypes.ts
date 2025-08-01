// Core types for the hybrid document processing system

export enum DocumentType {
  RECEIPT = 'receipt',
  INVOICE = 'invoice',
  ID_CARD = 'id_card',
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  BANK_STATEMENT = 'bank_statement',
  UTILITY_BILL = 'utility_bill',
  CONTRACT = 'contract',
  MEDICAL_DOCUMENT = 'medical_document',
  INSURANCE_CARD = 'insurance_card',
  TICKET = 'ticket',
  FORM = 'form',
  LETTER = 'letter',
  UNKNOWN = 'unknown'
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  language?: string;
}

export interface OCRResult {
  text: string;
  blocks: TextBlock[];
  confidence: number;
  processingTime: number;
  language: string[]; // Array of languages detected
  engine: string;
  orientation?: number; // rotation in degrees
  // Legacy properties for compatibility
  detectedLanguages?: string[];
  languages?: string[];
  engineName?: string;
}

export interface Entity {
  type: EntityType;
  value: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  normalizedValue?: any; // parsed value (Date, number, etc.)
}

export enum EntityType {
  DATE = 'date',
  AMOUNT = 'amount',
  CURRENCY = 'currency',
  PERSON_NAME = 'person_name',
  ORGANIZATION = 'organization',
  ADDRESS = 'address',
  PHONE = 'phone',
  EMAIL = 'email',
  URL = 'url',
  DOCUMENT_NUMBER = 'document_number',
  LINE_ITEM = 'line_item',
  TOTAL = 'total',
  TAX = 'tax',
  DISCOUNT = 'discount'
}

export interface Relationship {
  type: RelationshipType;
  source: Entity;
  target: Entity;
  confidence: number;
}

export enum RelationshipType {
  ITEM_PRICE = 'item_price',
  SUBTOTAL_TAX = 'subtotal_tax',
  TAX_TOTAL = 'tax_total',
  PERSON_ID = 'person_id',
  ADDRESS_COMPONENT = 'address_component',
  DATE_TRANSACTION = 'date_transaction'
}

export interface DocumentContext {
  layout: LayoutInfo;
  entities: Entity[];
  relationships: Relationship[];
  sections: DocumentSection[];
  confidence: number;
}

export interface LayoutInfo {
  orientation: 'portrait' | 'landscape';
  columns: number;
  hasTable: boolean;
  hasHeader: boolean;
  hasFooter: boolean;
  textDirection: 'ltr' | 'rtl' | 'mixed'; // Keep for compatibility
  confidence?: number;
}

export interface DocumentSection {
  type: SectionType;
  content: TextBlock[];
  entities: Entity[];
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export enum SectionType {
  HEADER = 'header',
  FOOTER = 'footer',
  BODY = 'body',
  TABLE = 'table',
  SIGNATURE = 'signature',
  STAMP = 'stamp',
  LOGO = 'logo'
}

export interface ContextualResult {
  documentType: DocumentType;
  confidence: number;
  context: DocumentContext;
  rawOCR: OCRResult;
}

// Document-specific data structures
export interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  discount?: number;
  category?: string;
}

export interface ReceiptData {
  vendor: {
    name: string;
    address?: string;
    phone?: string;
    website?: string;
  };
  items: LineItem[];
  totals: {
    subtotal: number;
    tax: number;
    tip?: number;
    total: number;
    currency: string;
  };
  paymentMethod?: string;
  date: Date;
  transactionId?: string;
  metadata: {
    cashier?: string;
    register?: string;
    store?: string;
  };
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date;
  vendor: {
    name: string;
    address: string;
    taxId?: string;
    contact?: {
      phone?: string;
      email?: string;
    };
  };
  customer: {
    name: string;
    address: string;
    taxId?: string;
  };
  items: LineItem[];
  totals: {
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
  };
  paymentTerms?: string;
  notes?: string;
}

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: Date;
  gender?: string;
  nationality?: string;
}

export interface IDData {
  documentType: DocumentType;
  personalInfo: PersonalInfo;
  documentInfo: {
    documentNumber: string;
    issueDate: Date;
    expiryDate?: Date;
    issuingAuthority: string;
    issuingCountry?: string;
  };
  address?: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  photo?: {
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  securityFeatures: string[];
}

export interface MRZData {
  documentType: string;
  issuingCountry: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  dateOfBirth: Date;
  sex: string;
  expiryDate: Date;
  personalNumber?: string;
  checkDigits: {
    documentNumber: string;
    dateOfBirth: string;
    expiryDate: string;
    personalNumber?: string;
    composite: string;
  };
}

export interface PassportData extends IDData {
  mrzData: MRZData;
  visualData: PersonalInfo;
  stamps: VisaStamp[];
  validity: {
    isValid: boolean;
    errors: string[];
  };
}

export interface VisaStamp {
  country: string;
  entryDate?: Date;
  exitDate?: Date;
  stampType: 'entry' | 'exit' | 'visa';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface GenericDocumentData {
  title?: string;
  content: string;
  entities: Entity[];
  keyValuePairs: Array<{
    key: string;
    value: string;
    confidence: number;
  }>;
  metadata: Record<string, any>;
}

export type StructuredData = 
  | ReceiptData 
  | InvoiceData 
  | IDData 
  | PassportData 
  | GenericDocumentData;

export interface QualityMetrics {
  ocrQuality: number; // 0-1
  completeness: number; // 0-1, how much expected data was found
  consistency: number; // 0-1, how consistent the data is
  confidence: number; // 0-1, overall confidence
  warnings: string[];
}

export interface ProcessedDocument {
  // Document Classification
  documentType: DocumentType;
  confidence: number;
  
  // Raw Data
  rawText: string;
  ocrBlocks: TextBlock[];
  
  // Contextual Understanding
  context: DocumentContext;
  
  // Structured Data (varies by type)
  structuredData: StructuredData;
  
  // Metadata
  processingTime: number;
  processingSteps: string[];
  warnings: string[];
  extractionQuality: QualityMetrics;
  
  // Processing info
  ocrEnginesUsed: string[];
  modelVersion?: string;
  timestamp: Date;
}

// Processing configuration
export interface ProcessingOptions {
  enableContextUnderstanding: boolean;
  enableStructuredExtraction: boolean;
  languages: string[];
  maxProcessingTime: number; // ms
  qualityThreshold: number; // 0-1
  enablePreprocessing: boolean;
  ocrEngines: string[];
}

// Engine interfaces
export interface DocumentExtractor<T extends StructuredData> {
  initialize?: () => Promise<void>;
  extract(context: ContextualResult): Promise<T>;
  validate(data: T): Promise<ValidationResult>;
  canHandle(documentType: DocumentType): boolean;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface Check {
  name: string;
  passed: boolean;
  confidence: number;
  message: string;
  suggestion?: string;
}

// Preprocessing types
export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  orientation: number;
  enhancements: string[];
  processingTime: number;
}

// Multi-language support
export interface LanguageResult {
  language: string;
  confidence: number;
  script: string;
  direction: 'ltr' | 'rtl';
}

export interface MultilingualText {
  segments: Array<{
    text: string;
    language: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    direction: 'ltr' | 'rtl';
    startIndex?: number;
    endIndex?: number;
  }>;
  primaryLanguage: string;
  detectedLanguages: string[];
}

// Error types
export class HybridProcessingError extends Error {
  constructor(
    message: string,
    public stage: 'ocr' | 'context' | 'extraction' | 'validation',
    public originalError?: Error
  ) {
    super(message);
    this.name = 'HybridProcessingError';
  }
}

// Combined result interface for the hybrid processing system
export interface HybridProcessingResult {
  ocrResult: OCRResult;
  contextualResult: ContextualResult;
  structuredData: StructuredData;
  qualityMetrics: QualityMetrics;
  metadata: {
    processingTime: number;
    imageHash: string;
    timestamp: Date;
    processingStages: string[];
  };
}