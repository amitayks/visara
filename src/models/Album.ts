import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class Album extends Model {
	static table = 'albums';
	static associations = {
		album_media: { type: 'has_many', foreignKey: 'album_id' },
	} as const;

	@field('name') name!: string;
	@field('description') description?: string;
	@field('cover_media_id') coverMediaId?: string;
	@field('is_smart') isSmart!: boolean;
	@field('smart_criteria') smartCriteria?: string;
	@field('sort_order') sortOrder!: number;

	@readonly @date('created_at') createdAt!: Date;
	@readonly @date('updated_at') updatedAt!: Date;
}
