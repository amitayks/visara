import { Model } from '@nozbe/watermelondb';
import { field, readonly, date, relation } from '@nozbe/watermelondb/decorators';

export class MediaFile extends Model {
	static table = 'media_files';
	static associations = {
		labels: { type: 'has_many', foreignKey: 'media_file_id' },
		ocr_texts: { type: 'has_many', foreignKey: 'media_file_id' },
		album_media: { type: 'has_many', foreignKey: 'media_file_id' },
		processing_queue: { type: 'has_many', foreignKey: 'media_file_id' },
	} as const;

	@field('uri') uri!: string;
	@field('filename') filename!: string;
	@field('mime_type') mimeType!: string;
	@field('width') width!: number;
	@field('height') height!: number;
	@field('file_size') fileSize!: number;
	@field('creation_date') creationDate!: number;
	@field('modification_date') modificationDate!: number;
	@field('latitude') latitude?: number;
	@field('longitude') longitude?: number;
	@field('is_processed') isProcessed!: boolean;
	@field('is_favorite') isFavorite!: boolean;
	@field('is_hidden') isHidden!: boolean;
	@field('thumbnail_uri') thumbnailUri?: string;

	@readonly @date('created_at') createdAt!: Date;
	@readonly @date('updated_at') updatedAt!: Date;
}
