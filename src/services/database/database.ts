import { Album } from "@models/Album";
import { AlbumMedia } from "@models/AlbumMedia";
import { AppSettings } from "@models/AppSettings";
import { Embedding } from "@models/Embedding";
import { Label } from "@models/Label";
import { MediaFile } from "@models/MediaFile";
import { OcrText } from "@models/OcrText";
import { ProcessingQueue } from "@models/ProcessingQueue";
import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { migrations } from "./migrations";
import { schema } from "./schema";

const adapter = new SQLiteAdapter({
	schema,
	migrations,
	jsi: true, // JSI for better performance with New Architecture
	onSetUpError: (error) => {
		console.error("Database setup error:", error);
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
		Embedding,
	],
});
