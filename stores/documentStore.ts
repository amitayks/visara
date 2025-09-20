// stores/documentStore.ts
// Fixed version with proper change detection and debouncing

import { create } from "zustand";
import { documentStorage } from "../services/database/documentStorage";
import type { Document } from "../app/components/DocumentGrid";
import type { ProcessedDocument } from "../services/processing/DocumentProcessor";
import { useSearchStore } from "./searchStore";
import { MiniSearchService } from "../services/search/MiniSearchService";

interface DocumentStore {
	documents: Document[];
	filteredDocuments: Document[];
	isLoading: boolean;
	hasExistingDocuments: boolean;
	error: string | null;

	// Statistics for new real-time system
	totalDocuments: number;
	documentsByType: Map<string, number>;

	// Change tracking (NEW)
	lastDocumentIds: Set<string>;
	lastUpdateTime: number;

	// Pagination state (kept for backward compatibility)
	currentPage: number;
	hasMorePages: boolean;
	isLoadingMore: boolean;
	pageSize: number;

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

	// New real-time actions
	addDocument: (doc: ProcessedDocument) => Promise<void>;
	searchDocuments: (query: string) => Document[];
	getDocumentsByType: (type: string) => Document[];
	clearDocuments: () => Promise<void>;

	// Modal actions
	openDocumentModal: (document: Document) => void;
	closeDocumentModal: () => void;
}

// Global subscription tracker to prevent multiple subscriptions
let globalSubscription: (() => void) | null = null;
let hasInitializedSearchIndex = false;
let updateDebounceTimer: NodeJS.Timeout | null = null;

export const useDocumentStore = create<DocumentStore>((set, get) => ({
	documents: [],
	filteredDocuments: [],
	isLoading: false,
	hasExistingDocuments: false,
	error: null,

	// Statistics
	totalDocuments: 0,
	documentsByType: new Map(),

	// Change tracking
	lastDocumentIds: new Set(),
	lastUpdateTime: 0,

	// Pagination state
	currentPage: 0,
	hasMorePages: true,
	isLoadingMore: false,
	pageSize: 102,

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
		const state = get();

		// Prevent concurrent loads
		if (state.isLoading) {
			console.log("[DocumentStore] Already loading, skipping concurrent load");
			return;
		}

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

			// Track document IDs for change detection
			const newDocIds = new Set(transformedDocs.map((d) => d.id));

			set({
				documents: transformedDocs,
				filteredDocuments: transformedDocs,
				hasExistingDocuments: transformedDocs.length > 0,
				totalDocuments: totalCount,
				hasMorePages: hasMore,
				currentPage: 0,
				lastDocumentIds: newDocIds,
				lastUpdateTime: Date.now(),
			});

			// Initialize search index with all documents (only if reasonable count and not already done)
			if (totalCount <= 1000 && !hasInitializedSearchIndex) {
				// Only index if manageable size
				const allDocs = await documentStorage.getAllDocuments();
				const searchService = MiniSearchService.getInstance();
				await searchService.reindexAll(allDocs);
				hasInitializedSearchIndex = true;
				console.log(
					"[DocumentStore] Search index initialized with all documents",
				);
			} else if (hasInitializedSearchIndex) {
				console.log(
					"[DocumentStore] Skipping search index - already initialized",
				);
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
		set({
			currentPage: 0,
			hasMorePages: true,
			lastDocumentIds: new Set(),
			lastUpdateTime: 0,
		});
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
		// Prevent multiple subscriptions
		if (globalSubscription) {
			console.log("[DocumentStore] Real-time updates already initialized");
			return globalSubscription;
		}

		console.log("[DocumentStore] Initializing real-time updates");

		const subscription = documentStorage.observeDocuments(async (docs) => {
			// Clear any pending debounce timer
			if (updateDebounceTimer) {
				clearTimeout(updateDebounceTimer);
			}

			// Debounce updates to prevent rapid re-renders
			updateDebounceTimer = setTimeout(() => {
				const state = get();
				const {
					documents: currentDocs,
					lastDocumentIds,
					lastUpdateTime,
				} = state;

				// Quick check: same document count
				if (docs.length === currentDocs.length && docs.length > 0) {
					// Deep check: compare document IDs
					const newDocIds = new Set(docs.map((d) => d.id));

					// Check if all IDs are the same
					const sameIds =
						newDocIds.size === lastDocumentIds.size &&
						[...newDocIds].every((id) => lastDocumentIds.has(id));

					// If same IDs and recent update (within 2 seconds), skip
					if (sameIds && Date.now() - lastUpdateTime < 2000) {
						console.log(
							"[DocumentStore] Skipped update - no real document changes detected",
						);
						return;
					}
				}

				// Sort by creation date (newest first)
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

				// Track new IDs
				const newDocIds = new Set(transformedDocs.map((d) => d.id));

				set({
					documents: transformedDocs,
					lastDocumentIds: newDocIds,
					lastUpdateTime: Date.now(),
				});

				// Only update filtered documents if no active search
				const searchState = useSearchStore.getState();
				if (!searchState.searchQuery) {
					set({ filteredDocuments: transformedDocs });
				}

				console.log(
					`[DocumentStore] Updated documents: ${currentDocs.length} -> ${transformedDocs.length}`,
				);

				// Skip search index update for real-time changes (performance optimization)
				console.log(
					"[DocumentStore] Skipped search re-index for real-time changes",
				);

				updateDebounceTimer = null;
			}, 500); // 500ms debounce
		});

		// Store global subscription
		globalSubscription = () => {
			console.log("[DocumentStore] Unsubscribing from real-time updates");
			if (updateDebounceTimer) {
				clearTimeout(updateDebounceTimer);
				updateDebounceTimer = null;
			}
			subscription?.unsubscribe?.();
			globalSubscription = null;
		};

		return globalSubscription;
	},

	// New real-time actions
	addDocument: async (doc: ProcessedDocument) => {
		const { documents, documentsByType } = get();

		// Check if document already exists
		if (documents.some((d) => d.id === doc.id)) {
			return;
		}

		// Save to database
		const savedDoc = await documentStorage.saveDocument(doc);

		// Transform for UI
		const newDoc: Document = {
			id: doc.id,
			imageUri: doc.imageUri,
			documentType: doc.documentType,
			vendor: doc.metadata?.vendor,
			date: doc.metadata?.date,
			totalAmount: doc.metadata?.totalAmount,
			metadata: doc.metadata,
			createdAt: doc.processedAt,
			imageHash: doc.imageHash,
			ocrText: doc.ocrText,
			keywords: doc.keywords,
			confidence: doc.confidence,
			processedAt: doc.processedAt,
			imageWidth: doc.imageWidth,
			imageHeight: doc.imageHeight,
			imageSize: doc.imageSize,
			imageTakenDate: doc.imageTakenDate,
		};

		const updatedDocs = [newDoc, ...documents];

		// Update type statistics
		const typeCount = documentsByType.get(doc.documentType) || 0;
		const updatedTypeMap = new Map(documentsByType);
		updatedTypeMap.set(doc.documentType, typeCount + 1);

		// Update document IDs
		const newDocIds = new Set(get().lastDocumentIds);
		newDocIds.add(doc.id);

		set({
			documents: updatedDocs,
			filteredDocuments: updatedDocs,
			totalDocuments: updatedDocs.length,
			documentsByType: updatedTypeMap,
			hasExistingDocuments: true,
			lastDocumentIds: newDocIds,
			lastUpdateTime: Date.now(),
		});

		// Update search index
		try {
			const searchService = MiniSearchService.getInstance();
			await searchService.addDocument(savedDoc);
			console.log(
				`[DocumentStore] Added document to search index: ${savedDoc.documentType}`,
			);
		} catch (error) {
			console.error("[DocumentStore] Failed to add to search index:", error);
		}

		console.log(
			`[DocumentStore] Added real-time document: ${doc.documentType}`,
		);
	},

	searchDocuments: (query: string) => {
		const { documents } = get();

		if (!query.trim()) {
			return documents;
		}

		const lowerQuery = query.toLowerCase();

		return documents.filter((doc) => {
			const inText = doc.ocrText?.toLowerCase().includes(lowerQuery);
			const inKeywords = doc.keywords?.some((k) =>
				k.toLowerCase().includes(lowerQuery),
			);
			const inType = doc.documentType?.toLowerCase().includes(lowerQuery);
			const inVendor = doc.vendor?.toLowerCase().includes(lowerQuery);

			return inText || inKeywords || inType || inVendor;
		});
	},

	getDocumentsByType: (type: string) => {
		const { documents } = get();
		return documents.filter((doc) => doc.documentType === type);
	},

	clearDocuments: async () => {
		try {
			await documentStorage.clearAll();
			set({
				documents: [],
				filteredDocuments: [],
				totalDocuments: 0,
				documentsByType: new Map(),
				hasExistingDocuments: false,
				lastDocumentIds: new Set(),
				lastUpdateTime: 0,
			});
			console.log("[DocumentStore] Cleared all documents");
		} catch (error) {
			console.error("[DocumentStore] Failed to clear documents:", error);
			set({
				error:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	},
}));
