import { create } from "zustand";
import { documentStorage } from "../services/database/documentStorage";
import type { Document } from "../app/components/DocumentGrid";
import { useSearchStore } from "./searchStore";

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
			}));

			set({ 
				documents: transformedDocs, 
				filteredDocuments: transformedDocs 
			});
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
		const subscription = documentStorage.observeDocuments((docs) => {
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
			}));

			set({ documents: transformedDocs });
			
			// Only update filtered documents if no active search
			const searchState = useSearchStore.getState();
			if (!searchState.isSearchActive) {
				set({ filteredDocuments: transformedDocs });
			}
		});

		return () => subscription?.unsubscribe?.();
	},
}));