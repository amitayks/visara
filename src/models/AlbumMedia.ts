import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';
import type { Album } from './Album';
import type { MediaFile } from './MediaFile';

export class AlbumMedia extends Model {
	static table = 'album_media';
	static associations = {
		albums: { type: 'belongs_to', key: 'album_id' },
		media_files: { type: 'belongs_to', key: 'media_file_id' },
	} as const;

	@field('album_id') albumId!: string;
	@field('media_file_id') mediaFileId!: string;
	@field('sort_order') sortOrder!: number;
	@field('added_at') addedAt!: number;

	@relation('albums', 'album_id') album!: Album;
	@relation('media_files', 'media_file_id') mediaFile!: MediaFile;
}
