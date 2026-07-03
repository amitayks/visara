import { Label } from "@models/Label";
import { MediaFile } from "@models/MediaFile";
import { OcrText } from "@models/OcrText";
import { Q } from "@nozbe/watermelondb";
import type { ProcessingResult } from "@services/ml/ProcessingService";
import { database } from "./database";

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

/**
 * AI enrichment schema version stamped as `ai_schema_version` alongside
 * `is_processed` for the Tier-0 (labels + OCR) write shape.
 */
export const TIER0_SCHEMA_VERSION = 1;

/**
 * AI enrichment schema version stamped as `ai_schema_version` for the Tier-1
 * (Gemma caption/description/open-vocabulary-tags) write shape.
 *
 * POC-DEPENDENT (#4 on-device Gemma POC): its value tracks the finalized
 * `GemmaEnrichment` output contract and MUST be bumped when that shape changes.
 */
export const TIER1_SCHEMA_VERSION = 1;

/**
 * Provenance stamped in the same write as `is_processed` so change #1's
 * invariant `is_processed === (processed_at !== null)` holds atomically.
 * The authoritative source is the analysis engine descriptor; the orchestrator
 * threads it in. The default below is a defensive fallback that matches the
 * Tier-0 `labels.source = "mlkit"` provenance already written in this file.
 */
export interface ProcessingProvenance {
	/** Stamped as `ai_model_version` (e.g. the engine descriptor id "mlkit"). */
	modelVersion: string;
	/** Stamped as `ai_schema_version`. */
	schemaVersion: number;
}

const DEFAULT_PROVENANCE: ProcessingProvenance = {
	modelVersion: "mlkit",
	schemaVersion: TIER0_SCHEMA_VERSION,
};

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

	/**
	 * Idempotent discovery entry point: dedupe by `uri`. Updates the mutable
	 * metadata of an existing row in place (never creating a duplicate) or
	 * creates a new one. Never touches `is_processed`, so a rescan of an
	 * already-processed file keeps its processing state.
	 */
	static async upsertFromDiscovered(
		data: CreateMediaFileData,
	): Promise<{ mediaFile: MediaFile; created: boolean }> {
		const existing = await this.findByUri(data.uri);
		if (existing) {
			const updated = await database.write(async () => {
				return await existing.update((record) => {
					record.filename = data.filename;
					record.mimeType = data.mimeType;
					record.width = data.width;
					record.height = data.height;
					record.fileSize = data.fileSize;
					record.creationDate = data.creationDate;
					record.modificationDate = data.modificationDate;
					record.latitude = data.latitude;
					record.longitude = data.longitude;
					if (data.thumbnailUri !== undefined) {
						record.thumbnailUri = data.thumbnailUri;
					}
				});
			});
			return { mediaFile: updated, created: false };
		}

		const created = await this.create(data);
		return { mediaFile: created, created: true };
	}

	static async createWithProcessingResult(
		mediaData: CreateMediaFileData,
		processingResult: ProcessingResult,
		provenance: ProcessingProvenance = DEFAULT_PROVENANCE,
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
					// Stamp provenance in the same write as is_processed so the
					// invariant is_processed === (processed_at !== null) holds.
					if (processingResult.success) {
						record.processedAt = new Date();
						record.aiModelVersion = provenance.modelVersion;
						record.aiSchemaVersion = provenance.schemaVersion;
					}
				});

			// Create labels
			const labelPromises = processingResult.imageLabeling.labels.map(
				(labelData) =>
					database.get<Label>("labels").create((label) => {
						label.mediaFileId = mediaFile.id;
						label.label = labelData.text;
						label.confidence = labelData.confidence;
						label.source = "mlkit";
						label.type = "tag";
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

	/**
	 * Unified enrichment writer for BOTH tiers, overwrite-in-place. The tier is
	 * discriminated by `processingResult.gemma`: when present this is a Tier-1
	 * (Gemma) persist (caption/description + `source = "gemma"` open-vocabulary
	 * tags); when absent it is the Tier-0 (ML Kit) persist (`source = "mlkit"`
	 * labels + OCR text).
	 *
	 * Label replacement is SOURCE-SCOPED: each tier replaces ONLY its own
	 * `labels.source` rows and leaves the other tier's rows intact, so a Tier-1
	 * pass never clobbers Tier-0 `mlkit` labels and a Tier-0 re-run never clobbers
	 * Tier-1 `gemma` labels. (Previously this deleted ALL labels for the file
	 * regardless of `source`, which would destroy the other tier's tags.)
	 *
	 * Provenance is stamped in the same write as `is_processed` so the change-#1
	 * invariant `is_processed === (processed_at !== null)` holds atomically.
	 */
	static async updateWithProcessingResult(
		mediaFile: MediaFile,
		processingResult: ProcessingResult,
		provenance: ProcessingProvenance = DEFAULT_PROVENANCE,
	): Promise<MediaFile> {
		// Tier discriminator: only the Tier-1 Gemma engine attaches `gemma`.
		const gemma = processingResult.gemma;
		const isTier1 = gemma !== undefined;
		const labelSource = isTier1 ? "gemma" : "mlkit";

		return await database.write(async () => {
			// Update media file
			const updatedMediaFile = await mediaFile.update((record) => {
				record.isProcessed = processingResult.success;
				// Stamp provenance in the same write as is_processed so the
				// invariant is_processed === (processed_at !== null) holds.
				if (processingResult.success) {
					record.processedAt = new Date();
					record.aiModelVersion = provenance.modelVersion;
					record.aiSchemaVersion = provenance.schemaVersion;
					// Tier-1 additionally stamps the multimodal caption/description.
					if (gemma) {
						record.caption = gemma.caption;
						record.description = gemma.description;
					}
				} else {
					// Keep the invariant on a failed re-process: clear processed_at.
					record.processedAt = undefined;
				}
			});

			// SOURCE-SCOPED replace: delete ONLY this tier's labels so the other
			// tier's rows survive (a Tier-1 persist preserves `mlkit` labels; a
			// Tier-0 re-run preserves `gemma` labels).
			const existingLabels = await database
				.get<Label>("labels")
				.query(
					Q.where("media_file_id", mediaFile.id),
					Q.where("source", labelSource),
				)
				.fetch();
			await Promise.all(existingLabels.map((label) => label.markAsDeleted()));

			if (isTier1) {
				// Tier-1: Gemma open-vocabulary tags (source = "gemma"). Gemma
				// produces no OCR, so existing (mlkit) OCR text is left untouched.
				await Promise.all(
					(gemma?.tags ?? []).map((tag) =>
						database.get<Label>("labels").create((label) => {
							label.mediaFileId = mediaFile.id;
							label.label = tag.text;
							// `Label.confidence` is required; Gemma tags may omit it.
							label.confidence = tag.confidence ?? 1;
							label.source = "gemma";
							label.type = "tag";
							label.modelVersion = provenance.modelVersion;
						}),
					),
				);
				return updatedMediaFile;
			}

			// Tier-0 (ML Kit): labels (source = "mlkit") + OCR text. Behavior is
			// unchanged except the label delete above is now source-scoped.
			await Promise.all(
				processingResult.imageLabeling.labels.map((labelData) =>
					database.get<Label>("labels").create((label) => {
						label.mediaFileId = mediaFile.id;
						label.label = labelData.text;
						label.confidence = labelData.confidence;
						label.source = "mlkit";
						label.type = "tag";
					}),
				),
			);

			// Replace this file's OCR text (ML Kit is the only OCR producer).
			const existingOcrTexts = await database
				.get<OcrText>("ocr_texts")
				.query(Q.where("media_file_id", mediaFile.id))
				.fetch();
			await Promise.all(existingOcrTexts.map((ocr) => ocr.markAsDeleted()));

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
