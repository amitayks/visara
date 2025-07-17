import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import { DocumentMetadataModel } from '../schema';

export class DocumentMetadata extends Model implements DocumentMetadataModel {
  static table = 'document_metadata';
  static associations = {
    documents: { type: 'belongs_to' as const, key: 'document_id' },
  };
  
  @field('document_id') documentId!: string;
  @field('ocr_text') ocrText?: string;
  @field('summary') summary?: string;
  @date('key_date') keyDate?: Date;
  @field('amount') amount?: number;
  @field('currency') currency?: string;
  @field('organization') organization?: string;
  @field('person_name') personName?: string;
  @field('document_number') documentNumber?: string;
  @field('tags') private _tags?: string;
  @field('custom_fields') private _customFields?: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
  
  // Relations
  @relation('documents', 'document_id') document: any;
  
  // JSON field getters/setters
  get tags(): string[] {
    try {
      return this._tags ? JSON.parse(this._tags) : [];
    } catch {
      return [];
    }
  }
  
  set tags(value: string[]) {
    this._tags = JSON.stringify(value);
  }
  
  get customFields(): Record<string, any> {
    try {
      return this._customFields ? JSON.parse(this._customFields) : {};
    } catch {
      return {};
    }
  }
  
  set customFields(value: Record<string, any>) {
    this._customFields = JSON.stringify(value);
  }
}