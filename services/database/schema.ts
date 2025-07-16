import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { field, date, text, readonly, relation } from '@nozbe/watermelondb/decorators';

// Database Schema Definition
export const databaseSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'documents',
      columns: [
        { name: 'uri', type: 'string' },
        { name: 'file_hash', type: 'string', isIndexed: true },
        { name: 'type', type: 'string', isIndexed: true }, // receipt, invoice, id, letter, form, screenshot
        { name: 'title', type: 'string' },
        { name: 'original_filename', type: 'string', isOptional: true },
        { name: 'date_taken', type: 'number' },
        { name: 'date_processed', type: 'number' },
        { name: 'confidence_score', type: 'number' }, // AI confidence 0-1
        { name: 'is_favorite', type: 'boolean' },
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]
    }),
    
    tableSchema({
      name: 'document_metadata',
      columns: [
        { name: 'document_id', type: 'string', isIndexed: true },
        { name: 'ocr_text', type: 'string', isOptional: true }, // Full OCR text
        { name: 'summary', type: 'string', isOptional: true }, // AI-generated summary
        { name: 'key_date', type: 'number', isOptional: true, isIndexed: true }, // Extracted date
        { name: 'amount', type: 'number', isOptional: true, isIndexed: true }, // For receipts/invoices
        { name: 'currency', type: 'string', isOptional: true },
        { name: 'organization', type: 'string', isOptional: true, isIndexed: true },
        { name: 'person_name', type: 'string', isOptional: true, isIndexed: true },
        { name: 'document_number', type: 'string', isOptional: true, isIndexed: true }, // Invoice #, ID #, etc
        { name: 'tags', type: 'string', isOptional: true }, // JSON array of tags
        { name: 'custom_fields', type: 'string', isOptional: true }, // JSON object for flexibility
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]
    }),
    
    tableSchema({
      name: 'search_vectors',
      columns: [
        { name: 'document_id', type: 'string', isIndexed: true },
        { name: 'content_vector', type: 'string' }, // Serialized vector for similarity search
        { name: 'metadata_vector', type: 'string' }, // Serialized vector from metadata
        { name: 'created_at', type: 'number' },
      ]
    }),
    
    tableSchema({
      name: 'chat_messages',
      columns: [
        { name: 'content', type: 'string' },
        { name: 'sender', type: 'string' }, // 'user' or 'ai'
        { name: 'document_ids', type: 'string', isOptional: true }, // JSON array of related doc IDs
        { name: 'created_at', type: 'number' },
      ]
    }),
    
    tableSchema({
      name: 'processing_queue',
      columns: [
        { name: 'image_uri', type: 'string' },
        { name: 'status', type: 'string' }, // pending, processing, completed, failed
        { name: 'retry_count', type: 'number' },
        { name: 'error_message', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'processed_at', type: 'number', isOptional: true },
      ]
    }),
  ]
});

// Example Models (for reference)
export interface DocumentModel {
  id: string;
  uri: string;
  fileHash: string;
  type: 'receipt' | 'invoice' | 'id' | 'letter' | 'form' | 'screenshot';
  title: string;
  originalFilename?: string;
  dateTaken: Date;
  dateProcessed: Date;
  confidenceScore: number;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  metadata?: DocumentMetadataModel;
  searchVector?: SearchVectorModel;
}

export interface DocumentMetadataModel {
  id: string;
  documentId: string;
  ocrText?: string;
  summary?: string;
  keyDate?: Date;
  amount?: number;
  currency?: string;
  organization?: string;
  personName?: string;
  documentNumber?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchVectorModel {
  id: string;
  documentId: string;
  contentVector: Float32Array;
  metadataVector: Float32Array;
  createdAt: Date;
}

export interface ChatMessageModel {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  documentIds?: string[];
  createdAt: Date;
}

export interface ProcessingQueueModel {
  id: string;
  imageUri: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  errorMessage?: string;
  createdAt: Date;
  processedAt?: Date;
}

// Database Indexes for Performance
export const databaseIndexes = {
  documents: ['file_hash', 'type', 'created_at'],
  documentMetadata: ['document_id', 'key_date', 'amount', 'organization', 'person_name', 'document_number'],
  searchVectors: ['document_id'],
};

// Example Queries
export const exampleQueries = {
  // Find all receipts from last month
  recentReceipts: `
    SELECT d.*, dm.* 
    FROM documents d
    LEFT JOIN document_metadata dm ON d.id = dm.document_id
    WHERE d.type = 'receipt' 
    AND dm.key_date > ? 
    ORDER BY dm.key_date DESC
  `,
  
  // Search by organization
  byOrganization: `
    SELECT d.*, dm.* 
    FROM documents d
    JOIN document_metadata dm ON d.id = dm.document_id
    WHERE dm.organization LIKE ?
    ORDER BY dm.key_date DESC
  `,
  
  // Find high-value documents
  highValueDocuments: `
    SELECT d.*, dm.* 
    FROM documents d
    JOIN document_metadata dm ON d.id = dm.document_id
    WHERE dm.amount > ?
    ORDER BY dm.amount DESC
  `,
  
  // Full text search in OCR content
  fullTextSearch: `
    SELECT d.*, dm.*, 
           snippet(document_metadata_fts, -1, '<mark>', '</mark>', '...', 32) as snippet
    FROM documents d
    JOIN document_metadata dm ON d.id = dm.document_id
    JOIN document_metadata_fts ON dm.id = document_metadata_fts.rowid
    WHERE document_metadata_fts MATCH ?
    ORDER BY rank
  `,
};