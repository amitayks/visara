import { Model } from "@nozbe/watermelondb";
import {
	date,
	field,
	readonly,
	relation,
} from "@nozbe/watermelondb/decorators";
import type { MediaFile } from "./MediaFile";

export class Embedding extends Model {
	static table = "embeddings";
	static associations = {
		media_files: { type: "belongs_to", key: "media_file_id" },
	} as const;

	@field("media_file_id") mediaFileId!: string;
	@field("vector") vector!: string;
	@field("dim") dim!: number;
	@field("model_version") modelVersion!: string;

	@readonly @date("created_at") createdAt!: Date;

	@relation("media_files", "media_file_id") mediaFile!: MediaFile;
}
