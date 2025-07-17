import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';
import { ChatMessageModel } from '../schema';

export class ChatMessage extends Model implements ChatMessageModel {
  static table = 'chat_messages';
  
  @field('content') content!: string;
  @field('sender') sender!: 'user' | 'ai';
  @field('document_ids') private _documentIds?: string;
  @readonly @date('created_at') createdAt!: Date;
  
  // JSON field getters/setters
  get documentIds(): string[] {
    try {
      return this._documentIds ? JSON.parse(this._documentIds) : [];
    } catch {
      return [];
    }
  }
  
  set documentIds(value: string[]) {
    this._documentIds = JSON.stringify(value);
  }
}