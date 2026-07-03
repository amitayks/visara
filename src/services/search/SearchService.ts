import type { MediaFile } from "@models/MediaFile";
import { LabelRepository } from "@services/database/LabelRepository";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { OcrTextRepository } from "@services/database/OcrTextRepository";
import { getItem, removeItem, setItem } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import MiniSearch from "minisearch";

/** The assembled searchable fields of one media file (shared by lexical + semantic). */
interface SearchableFields {
	filename: string;
	labels: string;
	ocrText: string;
	caption: string;
	description: string;
}

export interface SearchDocument {
	id: string;
	filename: string;
	labels: string;
	ocrText: string;
	creationDate: number;
}

export interface SearchResult {
	id: string;
	score: number;
	filename: string;
	match: Record<string, string[]>;
}

export class SearchService {
	private static miniSearch: MiniSearch<SearchDocument> | null = null;

	private static getMiniSearch(): MiniSearch<SearchDocument> {
		if (!this.miniSearch) {
			this.miniSearch = new MiniSearch<SearchDocument>({
				fields: ["filename", "labels", "ocrText"],
				storeFields: ["filename", "creationDate"],
				searchOptions: {
					boost: { filename: 1, labels: 2, ocrText: 3 },
					fuzzy: 0.2,
					prefix: true,
				},
			});
		}
		return this.miniSearch;
	}

	/**
	 * The single source of a file's searchable fields (design D3), so the lexical
	 * index and the semantic embedding derive from ONE assembly and cannot drift.
	 * Fetches labels + OCR text and reads the #1 caption/description columns.
	 */
	private static async collectSearchableFields(
		mediaFile: MediaFile,
	): Promise<SearchableFields> {
		const labels = await LabelRepository.findByMediaFileId(mediaFile.id);
		const labelTexts = labels.map((l) => l.label).join(" ");

		const ocrTexts = await OcrTextRepository.findByMediaFileId(mediaFile.id);
		const ocrText = ocrTexts.map((o) => o.text).join(" ");

		return {
			filename: mediaFile.filename,
			labels: labelTexts,
			ocrText,
			caption: mediaFile.caption ?? "",
			description: mediaFile.description ?? "",
		};
	}

	/**
	 * The one-string searchable text for a file (design D3): caption +
	 * description + labels + OCR + filename, joined. Shared with the semantic
	 * embedding pass (`EmbeddingService`) so lexical and semantic inputs stay in
	 * lockstep. NOTE: the lexical MiniSearch document intentionally keeps only its
	 * existing filename/labels/OCR fields — adding hybrid search must not change
	 * lexical indexing/serialization — so caption/description feed the embedding
	 * only.
	 */
	static async buildSearchableText(mediaFileId: string): Promise<string> {
		const mediaFile = await MediaFileRepository.findById(mediaFileId);
		if (!mediaFile) return "";
		const fields = await this.collectSearchableFields(mediaFile);
		return [
			fields.caption,
			fields.description,
			fields.labels,
			fields.ocrText,
			fields.filename,
		]
			.map((part) => part.trim())
			.filter((part) => part.length > 0)
			.join(" ");
	}

	static async index(): Promise<void> {
		const miniSearch = this.getMiniSearch();

		// Get all media files
		const mediaFiles = await MediaFileRepository.getVisible();

		const documents: SearchDocument[] = await Promise.all(
			mediaFiles.map(async (mediaFile) => {
				const fields = await this.collectSearchableFields(mediaFile);
				return {
					id: mediaFile.id,
					filename: fields.filename,
					labels: fields.labels,
					ocrText: fields.ocrText,
					creationDate: mediaFile.creationDate,
				};
			}),
		);

		// Clear existing index and add all documents
		miniSearch.removeAll();
		miniSearch.addAll(documents);

		// Serialize and persist to MMKV
		await this.serializeIndex();
	}

	static async addToIndex(mediaFileId: string): Promise<void> {
		const miniSearch = this.getMiniSearch();

		const mediaFile = await MediaFileRepository.findById(mediaFileId);
		if (!mediaFile || mediaFile.isHidden) return;

		const fields = await this.collectSearchableFields(mediaFile);
		const document: SearchDocument = {
			id: mediaFile.id,
			filename: fields.filename,
			labels: fields.labels,
			ocrText: fields.ocrText,
			creationDate: mediaFile.creationDate,
		};

		// Remove if exists, then add
		try {
			miniSearch.discard(mediaFileId);
		} catch {
			// Document doesn't exist, that's fine
		}

		miniSearch.add(document);

		// Persist to MMKV
		await this.serializeIndex();
	}

	static async removeFromIndex(mediaFileId: string): Promise<void> {
		const miniSearch = this.getMiniSearch();

		try {
			miniSearch.discard(mediaFileId);
			await this.serializeIndex();
		} catch {
			// Document doesn't exist, ignore
		}
	}

	static async search(
		query: string,
		options?: {
			fields?: string[];
			fuzzy?: number;
			prefix?: boolean;
			boost?: Record<string, number>;
		},
	): Promise<SearchResult[]> {
		if (!query.trim()) return [];

		const miniSearch = this.getMiniSearch();

		const results = miniSearch.search(query, {
			fields: options?.fields,
			fuzzy: options?.fuzzy ?? 0.2,
			prefix: options?.prefix ?? true,
			boost: options?.boost ?? { filename: 1, labels: 2, ocrText: 3 },
		});

		return results.map((result) => ({
			id: result.id,
			score: result.score,
			filename: result.filename as string,
			match: result.match,
		}));
	}

	static async autoSuggest(
		partialQuery: string,
		maxSuggestions = 5,
	): Promise<string[]> {
		if (!partialQuery.trim()) return [];

		const miniSearch = this.getMiniSearch();

		const suggestions = miniSearch.autoSuggest(partialQuery, {
			fuzzy: 0.2,
			prefix: true,
		});

		return suggestions.slice(0, maxSuggestions).map((s) => s.suggestion);
	}

	static async serializeIndex(): Promise<void> {
		const miniSearch = this.getMiniSearch();
		const serialized = JSON.stringify(miniSearch.toJSON());
		setItem(STORAGE_KEYS.SEARCH_INDEX, serialized);
	}

	static async loadIndex(): Promise<boolean> {
		try {
			const serialized = getItem(STORAGE_KEYS.SEARCH_INDEX);
			if (!serialized) return false;

			const data = JSON.parse(serialized);
			const miniSearch = MiniSearch.loadJSON<SearchDocument>(data, {
				fields: ["filename", "labels", "ocrText"],
				storeFields: ["filename", "creationDate"],
				searchOptions: {
					boost: { filename: 1, labels: 2, ocrText: 3 },
					fuzzy: 0.2,
					prefix: true,
				},
			});

			this.miniSearch = miniSearch;
			return true;
		} catch (error) {
			console.error("SearchService.loadIndex error:", error);
			return false;
		}
	}

	static async clearIndex(): Promise<void> {
		const miniSearch = this.getMiniSearch();
		miniSearch.removeAll();
		removeItem(STORAGE_KEYS.SEARCH_INDEX);
	}

	static getDocumentCount(): number {
		const miniSearch = this.getMiniSearch();
		return miniSearch.documentCount;
	}
}
