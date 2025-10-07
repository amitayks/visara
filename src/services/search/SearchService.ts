import MiniSearch from "minisearch";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { LabelRepository } from "@services/database/LabelRepository";
import { OcrTextRepository } from "@services/database/OcrTextRepository";
import { getItem, setItem, removeItem } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";

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

	static async index(): Promise<void> {
		const miniSearch = this.getMiniSearch();

		// Get all media files
		const mediaFiles = await MediaFileRepository.getVisible();

		const documents: SearchDocument[] = await Promise.all(
			mediaFiles.map(async (mediaFile) => {
				// Get labels for this media file
				const labels = await LabelRepository.findByMediaFileId(mediaFile.id);
				const labelTexts = labels.map((l) => l.label).join(" ");

				// Get OCR text for this media file
				const ocrTexts = await OcrTextRepository.findByMediaFileId(
					mediaFile.id,
				);
				const ocrText = ocrTexts.map((o) => o.text).join(" ");

				return {
					id: mediaFile.id,
					filename: mediaFile.filename,
					labels: labelTexts,
					ocrText: ocrText,
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

		// Get labels and OCR text
		const labels = await LabelRepository.findByMediaFileId(mediaFileId);
		const labelTexts = labels.map((l) => l.label).join(" ");

		const ocrTexts = await OcrTextRepository.findByMediaFileId(mediaFileId);
		const ocrText = ocrTexts.map((o) => o.text).join(" ");

		const document: SearchDocument = {
			id: mediaFile.id,
			filename: mediaFile.filename,
			labels: labelTexts,
			ocrText: ocrText,
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
