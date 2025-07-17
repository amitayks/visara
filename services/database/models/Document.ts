import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import { DocumentModel } from '../schema';

export class Document extends Model implements DocumentModel {
  static table = 'documents';
  static associations = {
    document_metadata: { type: 'has_many' as const, foreignKey: 'document_id' },
    search_vectors: { type: 'has_many' as const, foreignKey: 'document_id' },
  };
  
  @field('uri') uri!: string;
  @field('file_hash') fileHash!: string;
  @field('type') type!: 'receipt' | 'invoice' | 'id' | 'letter' | 'form' | 'screenshot';
  @field('title') title!: string;
  @field('original_filename') originalFilename?: string;
  @date('date_taken') dateTaken!: Date;
  @date('date_processed') dateProcessed!: Date;
  @field('confidence_score') confidenceScore!: number;
  @field('is_favorite') isFavorite!: boolean;
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
  
  // Relations
  @children('document_metadata') metadata: any;
  @children('search_vectors') searchVectors: any;
}