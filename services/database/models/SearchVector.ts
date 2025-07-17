import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import { SearchVectorModel } from '../schema';

export class SearchVector extends Model implements SearchVectorModel {
  static table = 'search_vectors';
  static associations = {
    documents: { type: 'belongs_to' as const, key: 'document_id' },
  };
  
  @field('document_id') documentId!: string;
  @field('content_vector') private _contentVector!: string;
  @field('metadata_vector') private _metadataVector!: string;
  @readonly @date('created_at') createdAt!: Date;
  
  // Relations
  @relation('documents', 'document_id') document: any;
  
  // Vector field getters/setters
  get contentVector(): Float32Array {
    try {
      const array = JSON.parse(this._contentVector);
      return new Float32Array(array);
    } catch {
      return new Float32Array();
    }
  }
  
  set contentVector(value: Float32Array) {
    this._contentVector = JSON.stringify(Array.from(value));
  }
  
  get metadataVector(): Float32Array {
    try {
      const array = JSON.parse(this._metadataVector);
      return new Float32Array(array);
    } catch {
      return new Float32Array();
    }
  }
  
  set metadataVector(value: Float32Array) {
    this._metadataVector = JSON.stringify(Array.from(value));
  }
}