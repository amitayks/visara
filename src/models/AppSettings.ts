import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class AppSettings extends Model {
	static table = 'app_settings';

	@field('key') key!: string;
	@field('value') value!: string;

	@readonly @date('updated_at') updatedAt!: Date;
}
