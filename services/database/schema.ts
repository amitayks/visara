import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
	version: 2,
	tables: [
		tableSchema({
			name: "documents",
			columns: [
				{ name: "image_uri", type: "string" },
				{ name: "thumbnail_uri", type: "string", isOptional: true },
				{ name: "image_hash", type: "string", isIndexed: true },
				{ name: "ocr_text", type: "string" },
				{ name: "document_type", type: "string" },
				{ name: "confidence", type: "number" },
				{ name: "vendor", type: "string", isOptional: true },
				{ name: "total_amount", type: "number", isOptional: true },
				{ name: "currency", type: "string", isOptional: true },
				{ name: "date", type: "number", isOptional: true }, // Document date from OCR
				{ name: "image_taken_date", type: "number", isOptional: true }, // EXIF or file date
				{ name: "keywords", type: "string", isOptional: true }, // JSON array
				{ name: "search_vector", type: "string", isOptional: true }, // JSON array of numbers
				{ name: "image_width", type: "number", isOptional: true },
				{ name: "image_height", type: "number", isOptional: true },
				{ name: "image_size", type: "number", isOptional: true }, // in bytes
				{ name: "metadata", type: "string" }, // JSON string
				{ name: "processed_at", type: "number" },
				{ name: "created_at", type: "number" },
				{ name: "updated_at", type: "number" },
			],
		}),
	],
});
