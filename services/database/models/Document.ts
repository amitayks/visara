import { Model } from '@nozbe/watermelondb';
import { field, date, json } from '@nozbe/watermelondb/decorators';
import { ExtractedMetadata } from '../../ai/documentProcessor';

export default class Document extends Model {
  static table = 'documents';

  @field('image_uri') imageUri!: string;
  @field('ocr_text') ocrText!: string;
  @field('document_type') documentType!: string;
  @field('confidence') confidence!: number;
  @field('vendor') vendor?: string;
  @field('total_amount') totalAmount?: number;
  @field('currency') currency?: string;
  @field('date') date?: number;
  @json('metadata', obj => obj) metadata!: ExtractedMetadata;
  @date('processed_at') processedAt!: Date;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}