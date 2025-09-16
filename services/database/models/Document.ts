import { Model } from "@nozbe/watermelondb";
import { date, field, json } from "@nozbe/watermelondb/decorators";

export default class Document extends Model {
	static table = "documents";

	@field("image_uri") imageUri!: string;
	@field("image_hash") imageHash!: string;
	@field("ocr_text") ocrText!: string;
	@field("document_type") documentType!: string;
	@field("confidence") confidence!: number;
	@field("vendor") vendor?: string;
	@field("total_amount") totalAmount?: number;
	@field("currency") currency?: string;
	@field("date") date?: number; // Document date from OCR
	@field("image_taken_date") imageTakenDate?: number;
	@json("keywords", (obj) => obj || []) keywords!: string[];
	@field("image_width") imageWidth?: number;
	@field("image_height") imageHeight?: number;
	@field("image_size") imageSize?: number;
	@json("metadata", (obj) => obj) metadata!: any;
	@date("processed_at") processedAt!: Date;
	@date("created_at") createdAt!: Date;
	@date("updated_at") updatedAt!: Date;
}
