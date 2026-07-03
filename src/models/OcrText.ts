import { Model } from "@nozbe/watermelondb";
import {
	date,
	field,
	readonly,
	relation,
} from "@nozbe/watermelondb/decorators";
import type { MediaFile } from "./MediaFile";

export class OcrText extends Model {
	static table = "ocr_texts";
	static associations = {
		media_files: { type: "belongs_to", key: "media_file_id" },
	} as const;

	@field("media_file_id") mediaFileId!: string;
	@field("text") text!: string;
	@field("blocks") blocks?: string;
	@field("language") language?: string;
	@field("confidence") confidence!: number;

	@readonly @date("created_at") createdAt!: Date;

	@relation("media_files", "media_file_id") mediaFile!: MediaFile;
}
