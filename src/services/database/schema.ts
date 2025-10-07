import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
	version: 1,
	tables: [
		tableSchema({
			name: "media_files",
			columns: [
				{ name: "uri", type: "string", isIndexed: true },
				{ name: "filename", type: "string", isIndexed: true },
				{ name: "mime_type", type: "string" },
				{ name: "width", type: "number" },
				{ name: "height", type: "number" },
				{ name: "file_size", type: "number" },
				{ name: "creation_date", type: "number", isIndexed: true },
				{ name: "modification_date", type: "number" },
				{ name: "latitude", type: "number", isOptional: true },
				{ name: "longitude", type: "number", isOptional: true },
				{ name: "is_processed", type: "boolean", isIndexed: true },
				{ name: "is_favorite", type: "boolean", isIndexed: true },
				{ name: "is_hidden", type: "boolean", isIndexed: true },
				{ name: "thumbnail_uri", type: "string", isOptional: true },
				{ name: "created_at", type: "number" },
				{ name: "updated_at", type: "number" },
			],
		}),
		tableSchema({
			name: "labels",
			columns: [
				{ name: "media_file_id", type: "string", isIndexed: true },
				{ name: "label", type: "string", isIndexed: true },
				{ name: "confidence", type: "number" },
				{ name: "created_at", type: "number" },
			],
		}),
		tableSchema({
			name: "ocr_texts",
			columns: [
				{ name: "media_file_id", type: "string", isIndexed: true },
				{ name: "text", type: "string", isIndexed: true },
				{ name: "blocks", type: "string", isOptional: true },
				{ name: "language", type: "string", isOptional: true },
				{ name: "confidence", type: "number" },
				{ name: "created_at", type: "number" },
			],
		}),
		tableSchema({
			name: "albums",
			columns: [
				{ name: "name", type: "string", isIndexed: true },
				{ name: "description", type: "string", isOptional: true },
				{ name: "cover_media_id", type: "string", isOptional: true },
				{ name: "is_smart", type: "boolean", isIndexed: true },
				{ name: "smart_criteria", type: "string", isOptional: true },
				{ name: "sort_order", type: "number" },
				{ name: "created_at", type: "number" },
				{ name: "updated_at", type: "number" },
			],
		}),
		tableSchema({
			name: "album_media",
			columns: [
				{ name: "album_id", type: "string", isIndexed: true },
				{ name: "media_file_id", type: "string", isIndexed: true },
				{ name: "sort_order", type: "number" },
				{ name: "added_at", type: "number" },
			],
		}),
		tableSchema({
			name: "processing_queue",
			columns: [
				{ name: "media_file_id", type: "string", isIndexed: true },
				{ name: "status", type: "string", isIndexed: true },
				{ name: "priority", type: "number", isIndexed: true },
				{ name: "retry_count", type: "number" },
				{ name: "error_message", type: "string", isOptional: true },
				{ name: "created_at", type: "number" },
				{ name: "updated_at", type: "number" },
			],
		}),
		tableSchema({
			name: "app_settings",
			columns: [
				{ name: "key", type: "string", isIndexed: true },
				{ name: "value", type: "string" },
				{ name: "updated_at", type: "number" },
			],
		}),
	],
});
