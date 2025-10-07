import { Q } from "@nozbe/watermelondb";
import { database } from "./database";
import { MediaFile } from "@models/MediaFile";
import { Label } from "@models/Label";
import { OcrText } from "@models/OcrText";
import type { ProcessingResult } from "@services/ml/ProcessingService";

export interface CreateMediaFileData {
	uri: string;
	filename: string;
	mimeType: string;
	width: number;
	height: number;
	fileSize: number;
	creationDate: number;
	modificationDate: number;
	latitude?: number;
	longitude?: number;
	thumbnailUri?: string;
}

export interface UpdateMediaFileData {
	isProcessed?: boolean;
	isFavorite?: boolean;
	isHidden?: boolean;
	thumbnailUri?: string;
}

export class MediaFileRepository {
	static async create(data: CreateMediaFileData): Promise<MediaFile> {
		return await database.write(async () => {
			return await database
				.get<MediaFile>("media_files")
				.create((mediaFile) => {
					mediaFile.uri = data.uri;
					mediaFile.filename = data.filename;
					mediaFile.mimeType = data.mimeType;
					mediaFile.width = data.width;
					mediaFile.height = data.height;
					mediaFile.fileSize = data.fileSize;
					mediaFile.creationDate = data.creationDate;
					mediaFile.modificationDate = data.modificationDate;
					mediaFile.latitude = data.latitude;
					mediaFile.longitude = data.longitude;
					mediaFile.isProcessed = false;
					mediaFile.isFavorite = false;
					mediaFile.isHidden = false;
					mediaFile.thumbnailUri = data.thumbnailUri;
				});
		});
	}

	static async findById(id: string): Promise<MediaFile | null> {
		try {
			return await database.get<MediaFile>("media_files").find(id);
		} catch {
			return null;
		}
	}

	static async findByUri(uri: string): Promise<MediaFile | null> {
		const results = await database
			.get<MediaFile>("media_files")
			.query(Q.where("uri", uri))
			.fetch();

		return results[0] || null;
	}

	static async getAll(): Promise<MediaFile[]> {
		return await database
			.get<MediaFile>("media_files")
			.query(Q.sortBy("creation_date", Q.desc))
			.fetch();
	}

	static async getUnprocessed(): Promise<MediaFile[]> {
		return await database
			.get<MediaFile>("media_files")
			.query(Q.where("is_processed", false), Q.sortBy("creation_date", Q.desc))
			.fetch();
	}

	static async getFavorites(): Promise<MediaFile[]> {
		return await database
			.get<MediaFile>("media_files")
			.query(
				Q.where("is_favorite", true),
				Q.where("is_hidden", false),
				Q.sortBy("creation_date", Q.desc),
			)
			.fetch();
	}

	static async getHidden(): Promise<MediaFile[]> {
		return await database
			.get<MediaFile>("media_files")
			.query(Q.where("is_hidden", true), Q.sortBy("creation_date", Q.desc))
			.fetch();
	}

	static async getVisible(): Promise<MediaFile[]> {
		return await database
			.get<MediaFile>("media_files")
			.query(Q.where("is_hidden", false), Q.sortBy("creation_date", Q.desc))
			.fetch();
	}

	static async update(
		mediaFile: MediaFile,
		data: UpdateMediaFileData,
	): Promise<MediaFile> {
		return await database.write(async () => {
			return await mediaFile.update((record) => {
				if (data.isProcessed !== undefined) {
					record.isProcessed = data.isProcessed;
				}
				if (data.isFavorite !== undefined) {
					record.isFavorite = data.isFavorite;
				}
				if (data.isHidden !== undefined) {
					record.isHidden = data.isHidden;
				}
				if (data.thumbnailUri !== undefined) {
					record.thumbnailUri = data.thumbnailUri;
				}
			});
		});
	}

	static async delete(mediaFile: MediaFile): Promise<void> {
		await database.write(async () => {
			await mediaFile.markAsDeleted();
		});
	}

	static async deleteById(id: string): Promise<void> {
		const mediaFile = await this.findById(id);
		if (mediaFile) {
			await this.delete(mediaFile);
		}
	}

	static observeAll() {
		return database
			.get<MediaFile>("media_files")
			.query(Q.sortBy("creation_date", Q.desc))
			.observe();
	}

	static observeVisible() {
		return database
			.get<MediaFile>("media_files")
			.query(Q.where("is_hidden", false), Q.sortBy("creation_date", Q.desc))
			.observe();
	}

	static observeFavorites() {
		return database
			.get<MediaFile>("media_files")
			.query(
				Q.where("is_favorite", true),
				Q.where("is_hidden", false),
				Q.sortBy("creation_date", Q.desc),
			)
			.observe();
	}

	static async count(): Promise<number> {
		return await database.get<MediaFile>("media_files").query().fetchCount();
	}

	static async createWithProcessingResult(
		mediaData: CreateMediaFileData,
		processingResult: ProcessingResult,
	): Promise<MediaFile> {
		return await database.write(async () => {
			// Create media file
			const mediaFile = await database
				.get<MediaFile>("media_files")
				.create((record) => {
					record.uri = mediaData.uri;
					record.filename = mediaData.filename;
					record.mimeType = mediaData.mimeType;
					record.width = mediaData.width;
					record.height = mediaData.height;
					record.fileSize = mediaData.fileSize;
					record.creationDate = mediaData.creationDate;
					record.modificationDate = mediaData.modificationDate;
					record.latitude = mediaData.latitude;
					record.longitude = mediaData.longitude;
					record.isProcessed = processingResult.success;
					record.isFavorite = false;
					record.isHidden = false;
					record.thumbnailUri = mediaData.thumbnailUri;
				});

			// Create labels
			const labelPromises = processingResult.imageLabeling.labels.map(
				(labelData) =>
					database.get<Label>("labels").create((label) => {
						label.mediaFileId = mediaFile.id;
						label.label = labelData.text;
						label.confidence = labelData.confidence;
					}),
			);

			await Promise.all(labelPromises);

			// Create OCR text
			if (processingResult.textRecognition.text.trim().length > 0) {
				await database.get<OcrText>("ocr_texts").create((ocrText) => {
					ocrText.mediaFileId = mediaFile.id;
					ocrText.text = processingResult.textRecognition.text;
					ocrText.blocks = processingResult.textRecognition.blocks;
					ocrText.confidence = 1.0; // ML Kit doesn't provide overall confidence
				});
			}

			return mediaFile;
		});
	}

	static async updateWithProcessingResult(
		mediaFile: MediaFile,
		processingResult: ProcessingResult,
	): Promise<MediaFile> {
		return await database.write(async () => {
			// Update media file
			const updatedMediaFile = await mediaFile.update((record) => {
				record.isProcessed = processingResult.success;
			});

			// Delete existing labels and OCR text
			const existingLabels = await database
				.get<Label>("labels")
				.query(Q.where("media_file_id", mediaFile.id))
				.fetch();

			const existingOcrTexts = await database
				.get<OcrText>("ocr_texts")
				.query(Q.where("media_file_id", mediaFile.id))
				.fetch();

			await Promise.all([
				...existingLabels.map((label) => label.markAsDeleted()),
				...existingOcrTexts.map((ocr) => ocr.markAsDeleted()),
			]);

			// Create new labels
			const labelPromises = processingResult.imageLabeling.labels.map(
				(labelData) =>
					database.get<Label>("labels").create((label) => {
						label.mediaFileId = mediaFile.id;
						label.label = labelData.text;
						label.confidence = labelData.confidence;
					}),
			);

			await Promise.all(labelPromises);

			// Create new OCR text
			if (processingResult.textRecognition.text.trim().length > 0) {
				await database.get<OcrText>("ocr_texts").create((ocrText) => {
					ocrText.mediaFileId = mediaFile.id;
					ocrText.text = processingResult.textRecognition.text;
					ocrText.blocks = processingResult.textRecognition.blocks;
					ocrText.confidence = 1.0;
				});
			}

			return updatedMediaFile;
		});
	}

	static async getLabelsForMedia(mediaFileId: string): Promise<Label[]> {
		return await database
			.get<Label>("labels")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();
	}

	static async getOcrTextForMedia(mediaFileId: string): Promise<OcrText[]> {
		return await database
			.get<OcrText>("ocr_texts")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();
	}
}
