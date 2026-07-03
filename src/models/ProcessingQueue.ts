import { Model } from "@nozbe/watermelondb";
import {
	date,
	field,
	readonly,
	relation,
} from "@nozbe/watermelondb/decorators";
import type { MediaFile } from "./MediaFile";

export class ProcessingQueue extends Model {
	static table = "processing_queue";
	static associations = {
		media_files: { type: "belongs_to", key: "media_file_id" },
	} as const;

	@field("media_file_id") mediaFileId!: string;
	@field("status") status!: string;
	@field("priority") priority!: number;
	@field("retry_count") retryCount!: number;
	@field("error_message") errorMessage?: string;
	@field("task_type") taskType!: string;
	@field("model_version") modelVersion?: string;

	@readonly @date("created_at") createdAt!: Date;
	@readonly @date("updated_at") updatedAt!: Date;

	@relation("media_files", "media_file_id") mediaFile!: MediaFile;
}
