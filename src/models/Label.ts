import { Model } from "@nozbe/watermelondb";
import {
	date,
	field,
	readonly,
	relation,
} from "@nozbe/watermelondb/decorators";
import type { MediaFile } from "./MediaFile";

export class Label extends Model {
	static table = "labels";
	static associations = {
		media_files: { type: "belongs_to", key: "media_file_id" },
	} as const;

	@field("media_file_id") mediaFileId!: string;
	@field("label") label!: string;
	@field("confidence") confidence!: number;
	@field("source") source!: string;
	@field("type") type!: string;
	@field("model_version") modelVersion?: string;

	@readonly @date("created_at") createdAt!: Date;

	@relation("media_files", "media_file_id") mediaFile!: MediaFile;
}
