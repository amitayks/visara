import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { MediaFile } from '@models/MediaFile';
import { Label } from '@models/Label';
import { OcrText } from '@models/OcrText';
import { Album } from '@models/Album';
import { AlbumMedia } from '@models/AlbumMedia';
import { ProcessingQueue } from '@models/ProcessingQueue';
import { AppSettings } from '@models/AppSettings';

const adapter = new SQLiteAdapter({
	schema,
	jsi: true, // JSI for better performance with New Architecture
	onSetUpError: (error) => {
		console.error('Database setup error:', error);
	},
});

export const database = new Database({
	adapter,
	modelClasses: [
		MediaFile,
		Label,
		OcrText,
		Album,
		AlbumMedia,
		ProcessingQueue,
		AppSettings,
	],
});
