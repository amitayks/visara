import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';
import { ProcessingQueueModel } from '../schema';

export class ProcessingQueue extends Model implements ProcessingQueueModel {
  static table = 'processing_queue';
  
  @field('image_uri') imageUri!: string;
  @field('status') status!: 'pending' | 'processing' | 'completed' | 'failed';
  @field('retry_count') retryCount!: number;
  @field('error_message') errorMessage?: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('processed_at') processedAt?: Date;
}