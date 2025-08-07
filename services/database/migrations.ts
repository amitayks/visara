import {
	addColumns,
	createTable,
	schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";

export default schemaMigrations({
	migrations: [
		{
			toVersion: 2,
			steps: [
				addColumns({
					table: "documents",
					columns: [
						{ name: "thumbnail_uri", type: "string", isOptional: true },
						{ name: "image_hash", type: "string", isIndexed: true },
						{ name: "image_taken_date", type: "number", isOptional: true },
						{ name: "keywords", type: "string", isOptional: true },
						{ name: "search_vector", type: "string", isOptional: true },
						{ name: "image_width", type: "number", isOptional: true },
						{ name: "image_height", type: "number", isOptional: true },
						{ name: "image_size", type: "number", isOptional: true },
					],
				}),
			],
		},
		{
			toVersion: 3,
			steps: [
				// Remove thumbnail_uri column as we no longer generate thumbnails
				// Note: WatermelonDB doesn't support dropping columns directly,
				// so we'll handle this in the model by ignoring the column
			],
		},
	],
});
