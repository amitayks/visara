/** biome-ignore-all lint/complexity/noStaticOnlyClass: its bother me */
import { Q } from "@nozbe/watermelondb";
import { database } from "./database";
import { OcrText } from "@models/OcrText";

export interface CreateOcrTextData {
	mediaFileId: string;
	text: string;
	blocks?: string;
	language?: string;
	confidence: number;
}

export class OcrTextRepository {
	static async create(data: CreateOcrTextData): Promise<OcrText> {
		return await database.write(async () => {
			return await database.get<OcrText>("ocr_texts").create((ocrText) => {
				ocrText.mediaFileId = data.mediaFileId;
				ocrText.text = data.text;
				ocrText.blocks = data.blocks;
				ocrText.language = data.language;
				ocrText.confidence = data.confidence;
			});
		});
	}

	static async findById(id: string): Promise<OcrText | null> {
		try {
			return await database.get<OcrText>("ocr_texts").find(id);
		} catch {
			return null;
		}
	}

	static async findByMediaFileId(mediaFileId: string): Promise<OcrText[]> {
		return await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();
	}

	static async searchByText(searchText: string): Promise<OcrText[]> {
		return await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("text", Q.like(`%${Q.sanitizeLikeString(searchText)}%`)))
			.fetch();
	}

	static async findByLanguage(language: string): Promise<OcrText[]> {
		return await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("language", language))
			.fetch();
	}

	static async getMediaFilesWithText(searchText: string): Promise<string[]> {
		const ocrTexts = await this.searchByText(searchText);
		return ocrTexts.map((ocr) => ocr.mediaFileId);
	}

	static async getMediaFilesWithTextAboveConfidence(
		searchText: string,
		minConfidence: number,
	): Promise<string[]> {
		const ocrTexts = await database
			.get<OcrText>("ocr_texts")
			.query(
				Q.where("text", Q.like(`%${Q.sanitizeLikeString(searchText)}%`)),
				Q.where("confidence", Q.gte(minConfidence)),
			)
			.fetch();
		return ocrTexts.map((ocr) => ocr.mediaFileId);
	}

	static async getAllMediaFilesWithText(): Promise<string[]> {
		const ocrTexts = await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("text", Q.notEq("")))
			.fetch();
		return [...new Set(ocrTexts.map((ocr) => ocr.mediaFileId))];
	}

	static async delete(ocrText: OcrText): Promise<void> {
		await database.write(async () => {
			await ocrText.markAsDeleted();
		});
	}

	static async deleteByMediaFileId(mediaFileId: string): Promise<void> {
		const ocrTexts = await this.findByMediaFileId(mediaFileId);
		await database.write(async () => {
			await Promise.all(ocrTexts.map((ocr) => ocr.markAsDeleted()));
		});
	}

	static async count(): Promise<number> {
		return await database.get<OcrText>("ocr_texts").query().fetchCount();
	}

	static async countForMediaFile(mediaFileId: string): Promise<number> {
		return await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("media_file_id", mediaFileId))
			.fetchCount();
	}

	static async countWithText(): Promise<number> {
		return await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("text", Q.notEq("")))
			.fetchCount();
	}
}
