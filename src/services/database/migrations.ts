import {
	addColumns,
	createTable,
	schemaMigrations,
	unsafeExecuteSql,
} from "@nozbe/watermelondb/Schema/migrations";

export const migrations = schemaMigrations({
	migrations: [
		{
			toVersion: 2,
			steps: [
				addColumns({
					table: "media_files",
					columns: [
						{ name: "caption", type: "string", isOptional: true },
						{ name: "description", type: "string", isOptional: true },
						{ name: "ai_model_version", type: "string", isOptional: true },
						{ name: "ai_schema_version", type: "number", isOptional: true },
						{
							name: "processed_at",
							type: "number",
							isOptional: true,
							isIndexed: true,
						},
					],
				}),
				addColumns({
					table: "labels",
					columns: [
						{ name: "source", type: "string", isIndexed: true },
						{ name: "type", type: "string", isIndexed: true },
						{ name: "model_version", type: "string", isOptional: true },
					],
				}),
				addColumns({
					table: "processing_queue",
					columns: [
						{ name: "task_type", type: "string", isIndexed: true },
						{ name: "model_version", type: "string", isOptional: true },
					],
				}),
				createTable({
					name: "embeddings",
					columns: [
						{ name: "media_file_id", type: "string", isIndexed: true },
						{ name: "vector", type: "string" },
						{ name: "dim", type: "number" },
						{ name: "model_version", type: "string" },
						{ name: "created_at", type: "number" },
					],
				}),
				unsafeExecuteSql(
					"UPDATE labels SET source = 'mlkit' WHERE source IS NULL OR source = '';",
				),
				unsafeExecuteSql(
					"UPDATE labels SET type = 'tag' WHERE type IS NULL OR type = '';",
				),
				unsafeExecuteSql(
					"UPDATE processing_queue SET task_type = 'tier0_mlkit' WHERE task_type IS NULL OR task_type = '';",
				),
				unsafeExecuteSql(
					"UPDATE media_files SET processed_at = updated_at WHERE is_processed = 1 AND processed_at IS NULL;",
				),
			],
		},
	],
});
