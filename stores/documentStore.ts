import { create } from "zustand";
import { documentStorage } from "../services/database/documentStorage";
import type { Document } from "../app/components/DocumentGrid";
import { useSearchStore } from "./searchStore";
import { MiniSearchService } from "../services/search/MiniSearchService";

interface DocumentStore {
	documents: Document[];
	filteredDocuments: Document[];
	isLoading: boolean;

	// Modal state
	selectedDocument: Document | null;
	isModalVisible: boolean;

	// Actions
	loadDocuments: () => Promise<void>;
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

	// Modal state
	selectedDocument: null,
	isModalVisible: false,

	loadDocuments: async () => {
		set({ isLoading: true });
		try {
			const docs = await documentStorage.getAllDocuments();
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
				searchVector: doc.searchVector,
				keywords: doc.keywords,
				confidence: doc.confidence,
				processedAt: doc.processedAt ? new Date(doc.processedAt) : undefined,
				imageWidth: doc.imageWidth,
				imageHeight: doc.imageHeight,
				imageSize: doc.imageSize,
				imageTakenDate: doc.imageTakenDate ? new Date(doc.imageTakenDate) : undefined,
			}));

			set({ 
				documents: transformedDocs, 
				filteredDocuments: transformedDocs 
			});

			// Initialize search index with all documents
			const searchService = MiniSearchService.getInstance();
			await searchService.reindexAll(docs);
			console.log("[DocumentStore] Search index updated with all documents");
		} catch (error) {
			console.error("Failed to load documents:", error);
			throw error;
		} finally {
			set({ isLoading: false });
		}
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
			console.log(`[DocumentStore] Removed document ${docId} from search index`);
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
				searchVector: doc.searchVector,
				keywords: doc.keywords,
				confidence: doc.confidence,
				processedAt: doc.processedAt ? new Date(doc.processedAt) : undefined,
				imageWidth: doc.imageWidth,
				imageHeight: doc.imageHeight,
				imageSize: doc.imageSize,
				imageTakenDate: doc.imageTakenDate ? new Date(doc.imageTakenDate) : undefined,
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
				console.log("[DocumentStore] Search index updated from real-time changes");
			} catch (error) {
				console.error("[DocumentStore] Failed to update search index:", error);
			}
		});

		return () => subscription?.unsubscribe?.();
	},
}));