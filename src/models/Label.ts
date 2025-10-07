import { Model } from '@nozbe/watermelondb';
import { field, readonly, date, relation } from '@nozbe/watermelondb/decorators';
import type { MediaFile } from './MediaFile';

export class Label extends Model {
	static table = 'labels';
	static associations = {
		media_files: { type: 'belongs_to', key: 'media_file_id' },
	} as const;

	@field('media_file_id') mediaFileId!: string;
	@field('label') label!: string;
	@field('confidence') confidence!: number;

	@readonly @date('created_at') createdAt!: Date;

	@relation('media_files', 'media_file_id') mediaFile!: MediaFile;
}
