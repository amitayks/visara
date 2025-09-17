import { create } from "zustand";
import { documentStorage } from "../services/database/documentStorage";
import type { Document } from "../app/components/DocumentGrid";
import { useSearchStore } from "./searchStore";
import { MiniSearchService } from "../services/search/MiniSearchService";

interface DocumentStore {
	documents: Document[];
	filteredDocuments: Document[];
	isLoading: boolean;
	hasExistingDocuments: boolean;

	// Pagination state
	currentPage: number;
	hasMorePages: boolean;
	isLoadingMore: boolean;
	pageSize: number;
	totalDocuments: number;

	// Modal state
	selectedDocument: Document | null;
	isModalVisible: boolean;

	// Actions
	loadDocuments: () => Promise<void>;
	loadMoreDocuments: () => Promise<void>;
	refreshDocuments: () => Promise<void>;
	checkExistingDocuments: () => Promise<void>;
	setFilteredDocuments: (docs: Document[]) => void;
	deleteDocument: (docId: string) => Promise<void>;
	initializeRealTimeUpdates: () => () => void;

	// Modal actions
	openDocumentModal: (document: Document) => void;
	closeDocumentModal: () => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
	documents: [],
	filteredDocuments: [],
	isLoading: false,
	hasExistingDocuments: false,

	// Pagination state
	currentPage: 0,
	hasMorePages: true,
	isLoadingMore: false,
	pageSize: 102,
	totalDocuments: 0,

	// Modal state
	selectedDocument: null,
	isModalVisible: false,

	checkExistingDocuments: async () => {
		try {
			const count = await documentStorage.getDocumentCount();
			set({ hasExistingDocuments: count > 0 });
		} catch (error) {
			console.error("Failed to check existing documents:", error);
			set({ hasExistingDocuments: false });
		}
	},

	loadDocuments: async () => {
		set({ isLoading: true, currentPage: 0 });
		try {
			const { pageSize } = get();

			// Get total count first
			const totalCount = await documentStorage.getDocumentCount();

			// Load first page
			const docs = await documentStorage.getDocumentsPaginated(0, pageSize);

			const transformedDocs: Document[] = docs.map((doc) => ({
				id: doc.id,
				imageUri: doc.imageUri,
				documentType: doc.documentType,
				vendor: doc.vendor,
				date: doc.date ? new Date(doc.date) : undefined,
				totalAmount: doc.totalAmount,
				metadata: doc.metadata,
				createdAt: new Date(doc.createdAt),
				// Preserve all OCR and processing data
				imageHash: doc.imageHash,
				ocrText: doc.ocrText,
				keywords: doc.keywords,
				confidence: doc.confidence,
				processedAt: doc.processedAt ? new Date(doc.processedAt) : undefined,
				imageWidth: doc.imageWidth,
				imageHeight: doc.imageHeight,
				imageSize: doc.imageSize,
				imageTakenDate: doc.imageTakenDate
					? new Date(doc.imageTakenDate)
					: undefined,
			}));

			const hasMore =
				transformedDocs.length === pageSize && totalCount > pageSize;

			set({
				documents: transformedDocs,
				filteredDocuments: transformedDocs,
				hasExistingDocuments: transformedDocs.length > 0,
				totalDocuments: totalCount,
				hasMorePages: hasMore,
				currentPage: 0,
			});

			// Initialize search index with all documents (only if reasonable count)
			if (totalCount <= 1000) {
				// Only index if manageable size
				const allDocs = await documentStorage.getAllDocuments();
				const searchService = MiniSearchService.getInstance();
				await searchService.reindexAll(allDocs);
				console.log("[DocumentStore] Search index updated with all documents");
			} else {
				console.log(
					"[DocumentStore] Skipping full search index due to large dataset",
				);
			}
		} catch (error) {
			console.error("Failed to load documents:", error);
			throw error;
		} finally {
			set({ isLoading: false });
		}
	},

	loadMoreDocuments: async () => {
		const { isLoadingMore, hasMorePages, currentPage, pageSize, documents } =
			get();

		if (isLoadingMore || !hasMorePages) {
			return;
		}

		set({ isLoadingMore: true });
		try {
			const nextPage = currentPage + 1;
			const docs = await documentStorage.getDocumentsPaginated(
				nextPage,
				pageSize,
			);

			const transformedDocs: Document[] = docs.map((doc) => ({
				id: doc.id,
				imageUri: doc.imageUri,
				documentType: doc.documentType,
				vendor: doc.vendor,
				date: doc.date ? new Date(doc.date) : undefined,
				totalAmount: doc.totalAmount,
				metadata: doc.metadata,
				createdAt: new Date(doc.createdAt),
				// Preserve all OCR and processing data
				imageHash: doc.imageHash,
				ocrText: doc.ocrText,
				keywords: doc.keywords,
				confidence: doc.confidence,
				processedAt: doc.processedAt ? new Date(doc.processedAt) : undefined,
				imageWidth: doc.imageWidth,
				imageHeight: doc.imageHeight,
				imageSize: doc.imageSize,
				imageTakenDate: doc.imageTakenDate
					? new Date(doc.imageTakenDate)
					: undefined,
			}));

			const newDocuments = [...documents, ...transformedDocs];
			const hasMore = transformedDocs.length === pageSize;

			set({
				documents: newDocuments,
				filteredDocuments: newDocuments,
				currentPage: nextPage,
				hasMorePages: hasMore,
			});

			console.log(
				`[DocumentStore] Loaded page ${nextPage + 1}, total documents: ${newDocuments.length}`,
			);
		} catch (error) {
			console.error("Failed to load more documents:", error);
			throw error;
		} finally {
			set({ isLoadingMore: false });
		}
	},

	refreshDocuments: async () => {
		// Reset pagination and reload first page
		set({ currentPage: 0, hasMorePages: true });
		await get().loadDocuments();
	},

	setFilteredDocuments: (docs: Document[]) => {
		set({ filteredDocuments: docs });
	},

	deleteDocument: async (docId: string) => {
		try {
			await documentStorage.deleteDocument(docId);
			// Close modal if deleting the currently selected document
			const { selectedDocument } = get();
			if (selectedDocument?.id === docId) {
				set({ selectedDocument: null, isModalVisible: false });
			}

			// Remove from search index
			const searchService = MiniSearchService.getInstance();
			await searchService.removeDocument(docId);
			console.log(
				`[DocumentStore] Removed document ${docId} from search index`,
			);
		} catch (error) {
			console.error("Delete error:", error);
			throw error;
		}
	},

	// Modal actions
	openDocumentModal: (document: Document) => {
		set({ selectedDocument: document, isModalVisible: true });
	},

	closeDocumentModal: () => {
		set({ selectedDocument: null, isModalVisible: false });
	},

	initializeRealTimeUpdates: () => {
		const subscription = documentStorage.observeDocuments(async (docs) => {
			const sortedDocs = docs.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);

			const transformedDocs: Document[] = sortedDocs.map((doc) => ({
				id: doc.id,
				imageUri: doc.imageUri,
				documentType: doc.documentType,
				vendor: doc.vendor,
				date: doc.date ? new Date(doc.date) : undefined,
				totalAmount: doc.totalAmount,
				metadata: doc.metadata,
				createdAt: new Date(doc.createdAt),
				// Preserve all OCR and processing data
				imageHash: doc.imageHash,
				ocrText: doc.ocrText,
				keywords: doc.keywords,
				confidence: doc.confidence,
				processedAt: doc.processedAt ? new Date(doc.processedAt) : undefined,
				imageWidth: doc.imageWidth,
				imageHeight: doc.imageHeight,
				imageSize: doc.imageSize,
				imageTakenDate: doc.imageTakenDate
					? new Date(doc.imageTakenDate)
					: undefined,
			}));

			set({ documents: transformedDocs });

			// Only update filtered documents if no active search
			const searchState = useSearchStore.getState();
			if (!searchState.searchQuery) {
				set({ filteredDocuments: transformedDocs });
			}

			// Update search index with new documents
			try {
				const searchService = MiniSearchService.getInstance();
				await searchService.reindexAll(docs);
				console.log(
					"[DocumentStore] Search index updated from real-time changes",
				);
			} catch (error) {
				console.error("[DocumentStore] Failed to update search index:", error);
			}
		});

		return () => subscription?.unsubscribe?.();
	},
}));
