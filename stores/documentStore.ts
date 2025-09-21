// stores/documentStore.ts
// Fixed version with proper change detection and debouncing

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import { documentStorage } from "../services/database/documentStorage";

// Enable Immer MapSet plugin BEFORE creating any stores
enableMapSet();
import type { Document } from "../app/components/DocumentGrid";
import type { ProcessedDocument } from "../services/processing/DocumentProcessor";
import { useSearchStore } from "./searchStore";
import { MiniSearchService } from "../services/search/MiniSearchService";

interface DocumentStore {
	// Map-based storage (PRIMARY)
	documentsMap: Map<string, Document>;
	documentArrayCache: Document[];
	cacheVersion: number;
	lastArrayBuildTime: number;
	
	// Legacy array (computed from Map)
	documents: Document[];
	
	// Filtered documents as IDs
	filteredDocumentIds: Set<string>;
	
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
	setFilteredDocumentIds: (ids: string[]) => void;
	deleteDocument: (docId: string) => Promise<void>;
	initializeRealTimeUpdates: () => () => void;
	
	// New Map-based methods
	getFilteredDocuments: () => Document[];
	updateDocumentsArray: () => void;
	hasDocumentChanged: (oldDoc: Document, newDoc: Document) => boolean;
	
	// Memory management
	cleanupOldCacheEntries: () => void;
	forceCleanupMemory: () => void;

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

export const useDocumentStore = create<DocumentStore>()(
	immer((set, get) => ({
	// Map-based storage (PRIMARY)
	documentsMap: new Map(),
	documentArrayCache: [],
	cacheVersion: 0,
	lastArrayBuildTime: 0,
	
	// Legacy array (computed from Map)
	documents: [],
	
	// Filtered documents as IDs
	filteredDocumentIds: new Set(),
	
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

	// Document comparison helper
	hasDocumentChanged: (oldDoc: Document, newDoc: Document): boolean => {
		if (!oldDoc || !newDoc) return true;
		
		// Compare only fields that affect UI display
		const fieldsToCompare = [
			'id', 'imageUri', 'documentType', 'vendor', 'totalAmount', 
			'ocrText', 'keywords', 'confidence', 'imageWidth', 'imageHeight'
		] as const;
		
		for (const field of fieldsToCompare) {
			const oldValue = oldDoc[field];
			const newValue = newDoc[field];
			
			// Handle array comparison (keywords)
			if (Array.isArray(oldValue) && Array.isArray(newValue)) {
				if (oldValue.length !== newValue.length || 
					!oldValue.every((v, i) => v === newValue[i])) {
					return true;
				}
			}
			// Handle Date comparison
			else if (oldValue instanceof Date && newValue instanceof Date) {
				if (oldValue.getTime() !== newValue.getTime()) return true;
			}
			// Handle primitive comparison
			else if (oldValue !== newValue) {
				return true;
			}
		}
		
		return false; // No changes detected
	},

	// Cached array builder with version tracking
	updateDocumentsArray: () => {
		const state = get();
		const { documentsMap } = state;
		
		console.log(`[DocumentStore] updateDocumentsArray: Map has ${documentsMap.size} items`);
		console.log(`[DocumentStore] Map keys:`, Array.from(documentsMap.keys()));
		
		// Always build new array from Map (sorted by creation date, newest first)
		const docsArray = Array.from(documentsMap.values()).sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
		
		console.log(`[DocumentStore] Created array with ${docsArray.length} items`);
		
		// Update cache and array
		set((draft) => {
			draft.documentArrayCache = docsArray;
			draft.documents = docsArray;
			draft.lastArrayBuildTime = Date.now();
			draft.totalDocuments = docsArray.length;
		});
		
		console.log(`[DocumentStore] ✅ Updated documents array: ${docsArray.length} items`);
	},

	// Get filtered documents on-demand
	getFilteredDocuments: (): Document[] => {
		const { documentsMap, filteredDocumentIds, documents } = get();
		
		console.log(`[getFilteredDocuments] Called - Map: ${documentsMap.size} items, Documents array: ${documents.length} items`);
		console.log(`[getFilteredDocuments] filteredDocumentIds.size: ${filteredDocumentIds.size}`);
		
		if (filteredDocumentIds.size === 0) {
			// No filter applied, return cached documents array (more efficient)
			console.log(`[getFilteredDocuments] No filter, returning documents array: ${documents.length} items`);
			return documents;
		}
		
		// Filter documents by IDs
		const filtered = Array.from(filteredDocumentIds)
			.map(id => documentsMap.get(id))
			.filter((doc): doc is Document => doc !== undefined)
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		
		console.log(`[getFilteredDocuments] Filtered result: ${filtered.length} items`);
		return filtered;
	},

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

		set((draft) => {
			draft.isLoading = true;
			draft.currentPage = 0;
		});

		try {
			const { pageSize, documentsMap, hasDocumentChanged } = get();

			// Get total count first
			const totalCount = await documentStorage.getDocumentCount();

			// Load first page
			const docs = await documentStorage.getDocumentsPaginated(0, pageSize);

			let hasRealChanges = false;
			const newDocIds = new Set<string>();

			// Transform documents, reusing existing objects when possible
			for (const rawDoc of docs) {
				newDocIds.add(rawDoc.id);

				// Create new Document object
				const newDoc: Document = {
					id: rawDoc.id,
					imageUri: rawDoc.imageUri,
					documentType: rawDoc.documentType,
					vendor: rawDoc.vendor,
					date: rawDoc.date ? new Date(rawDoc.date) : undefined,
					totalAmount: rawDoc.totalAmount,
					metadata: rawDoc.metadata,
					createdAt: new Date(rawDoc.createdAt),
					imageHash: rawDoc.imageHash,
					ocrText: rawDoc.ocrText,
					keywords: rawDoc.keywords,
					confidence: rawDoc.confidence,
					processedAt: rawDoc.processedAt ? new Date(rawDoc.processedAt) : undefined,
					imageWidth: rawDoc.imageWidth,
					imageHeight: rawDoc.imageHeight,
					imageSize: rawDoc.imageSize,
					imageTakenDate: rawDoc.imageTakenDate ? new Date(rawDoc.imageTakenDate) : undefined,
				};

				// Check if document exists and has changed
				const existingDoc = documentsMap.get(rawDoc.id);
				
				if (!existingDoc || hasDocumentChanged(existingDoc, newDoc)) {
					// Document is new or changed - update Map
					console.log(`[DocumentStore] Adding/updating document to Map: ${rawDoc.id}`);
					set((draft) => {
						draft.documentsMap.set(rawDoc.id, newDoc);
					});
					hasRealChanges = true;
				} else {
					// Document unchanged - keep existing object reference
					// No need to update Map, existing object is fine
				}
			}

			// Remove documents that are no longer in the loaded set (if this is a full reload)
			const currentIds = new Set(documentsMap.keys());
			for (const existingId of currentIds) {
				if (!newDocIds.has(existingId)) {
					set((draft) => {
						draft.documentsMap.delete(existingId);
					});
					hasRealChanges = true;
				}
			}

			// Update pagination and metadata
			const hasMore = docs.length === pageSize && totalCount > pageSize;
			
			set((draft) => {
				draft.hasExistingDocuments = newDocIds.size > 0;
				draft.totalDocuments = totalCount;
				draft.hasMorePages = hasMore;
				draft.currentPage = 0;
				draft.lastDocumentIds = newDocIds;
				draft.lastUpdateTime = Date.now();
				
				// Increment cache version only if there were real changes
				if (hasRealChanges) {
					draft.cacheVersion++;
				}
			});

			// Update documents array from Map
			get().updateDocumentsArray();

			// Initialize search index with all documents (only if reasonable count and not already done)
			if (totalCount <= 1000 && !hasInitializedSearchIndex) {
				const allDocs = await documentStorage.getAllDocuments();
				const searchService = MiniSearchService.getInstance();
				await searchService.reindexAll(allDocs);
				hasInitializedSearchIndex = true;
				console.log("[DocumentStore] Search index initialized with all documents");
			} else if (hasInitializedSearchIndex) {
				console.log("[DocumentStore] Skipping search index - already initialized");
			} else {
				console.log("[DocumentStore] Skipping full search index due to large dataset");
			}

			// Final verification of state
			const finalState = get();
			console.log(`[DocumentStore] Final state check:`);
			console.log(`  - documentsMap.size: ${finalState.documentsMap.size}`);
			console.log(`  - documents.length: ${finalState.documents.length}`);
			console.log(`  - totalDocuments: ${finalState.totalDocuments}`);
			console.log(`  - hasRealChanges: ${hasRealChanges}`);
			console.log(`  - totalCount from DB: ${totalCount}`);
		} catch (error) {
			console.error("Failed to load documents:", error);
			throw error;
		} finally {
			set((draft) => {
				draft.isLoading = false;
			});
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
		// Legacy method - convert documents to IDs
		const ids = docs.map(doc => doc.id);
		set((draft) => {
			draft.filteredDocumentIds = new Set(ids);
		});
	},

	setFilteredDocumentIds: (ids: string[]) => {
		set((draft) => {
			draft.filteredDocumentIds = new Set(ids);
		});
	},

	deleteDocument: async (docId: string) => {
		try {
			await documentStorage.deleteDocument(docId);
			
			// Close modal if deleting the currently selected document
			const { selectedDocument } = get();
			if (selectedDocument?.id === docId) {
				set({ selectedDocument: null, isModalVisible: false });
			}

			// Remove from Map and update cache version
			set((draft) => {
				draft.documentsMap.delete(docId);
				draft.filteredDocumentIds.delete(docId);
				draft.lastDocumentIds.delete(docId);
				draft.cacheVersion++; // Increment version to trigger array rebuild
			});

			// Update documents array from Map
			get().updateDocumentsArray();

			// Remove from search index
			const searchService = MiniSearchService.getInstance();
			await searchService.removeDocument(docId);
			console.log(
				`[DocumentStore] Removed document ${docId} from search index and Map`,
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
					documentsMap,
					lastDocumentIds,
					lastUpdateTime,
					hasDocumentChanged,
				} = state;

				// Quick check: same document count and IDs
				const newDocIds = new Set(docs.map((d) => d.id));
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

				let hasRealChanges = false;

				// Process each document individually, reusing existing objects when possible
				for (const rawDoc of docs) {
					// Create new Document object
					const newDoc: Document = {
						id: rawDoc.id,
						imageUri: rawDoc.imageUri,
						documentType: rawDoc.documentType,
						vendor: rawDoc.vendor,
						date: rawDoc.date ? new Date(rawDoc.date) : undefined,
						totalAmount: rawDoc.totalAmount,
						metadata: rawDoc.metadata,
						createdAt: new Date(rawDoc.createdAt),
						imageHash: rawDoc.imageHash,
						ocrText: rawDoc.ocrText,
						keywords: rawDoc.keywords,
						confidence: rawDoc.confidence,
						processedAt: rawDoc.processedAt ? new Date(rawDoc.processedAt) : undefined,
						imageWidth: rawDoc.imageWidth,
						imageHeight: rawDoc.imageHeight,
						imageSize: rawDoc.imageSize,
						imageTakenDate: rawDoc.imageTakenDate ? new Date(rawDoc.imageTakenDate) : undefined,
					};

					// Check if document exists and has changed
					const existingDoc = documentsMap.get(rawDoc.id);

					if (!existingDoc || hasDocumentChanged(existingDoc, newDoc)) {
						// Document is new or changed - update Map
						set((draft) => {
							draft.documentsMap.set(rawDoc.id, newDoc);
						});
						hasRealChanges = true;
					} else {
						// Document unchanged - keep existing object reference
						// No need to update Map, existing object is fine
					}
				}

				// Remove documents that are no longer present
				const currentIds = new Set(documentsMap.keys());
				for (const existingId of currentIds) {
					if (!newDocIds.has(existingId)) {
						set((draft) => {
							draft.documentsMap.delete(existingId);
						});
						hasRealChanges = true;
					}
				}

				// Only update state if there were real changes
				if (hasRealChanges) {
					set((draft) => {
						draft.lastDocumentIds = newDocIds;
						draft.lastUpdateTime = Date.now();
						draft.cacheVersion++; // Increment cache version on real changes
					});

					// Update documents array from Map
					get().updateDocumentsArray();

					console.log(
						`[DocumentStore] Real-time update - Changes: ${hasRealChanges}, Total: ${newDocIds.size}`,
					);
				} else {
					console.log(
						"[DocumentStore] Real-time update - No content changes detected",
					);
				}

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
		const { documentsMap, documentsByType } = get();

		// Check if document already exists in Map
		if (documentsMap.has(doc.id)) {
			console.log(`[DocumentStore] Document ${doc.id} already exists, skipping`);
			return;
		}

		console.log(`[DocumentStore] Adding new document: ${doc.id}`);

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

		// Add to Map using the new pattern
		set((draft) => {
			draft.documentsMap.set(doc.id, newDoc);
			draft.lastDocumentIds.add(doc.id);
			
			// Update type statistics
			const currentCount = draft.documentsByType.get(doc.documentType) || 0;
			draft.documentsByType.set(doc.documentType, currentCount + 1);
			
			draft.hasExistingDocuments = true;
			draft.lastUpdateTime = Date.now();
			draft.cacheVersion++; // Trigger array rebuild
		});

		// Update documents array from Map
		get().updateDocumentsArray();

		// Update search index
		try {
			const searchService = MiniSearchService.getInstance();
			await searchService.addDocument(savedDoc);
			console.log(
				`[DocumentStore] ✅ Added document to search index: ${savedDoc.documentType}`,
			);
		} catch (error) {
			console.error("[DocumentStore] Failed to add to search index:", error);
		}

		console.log(
			`[DocumentStore] ✅ Successfully added real-time document: ${doc.documentType} (ID: ${doc.id})`,
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
				documentsMap: new Map(),
				documentArrayCache: [],
				filteredDocumentIds: new Set(),
				cacheVersion: 0,
				lastArrayBuildTime: 0,
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

	// Memory management methods
	cleanupOldCacheEntries: () => {
		const { documentArrayCache, lastArrayBuildTime, cacheVersion } = get();
		const now = Date.now();
		const maxCacheAge = 30000; // 30 seconds
		
		// Clear array cache if too old
		if (now - lastArrayBuildTime > maxCacheAge) {
			set((draft) => {
				draft.documentArrayCache = [];
				draft.lastArrayBuildTime = 0;
			});
			console.log('[DocumentStore] Cleared old array cache');
		}
		
		// Force garbage collection hint (if available)
		if (global.gc) {
			global.gc();
		}
	},

	forceCleanupMemory: () => {
		console.log('[DocumentStore] Force memory cleanup triggered');
		
		set((draft) => {
			// Clear cached arrays
			draft.documentArrayCache = [];
			draft.lastArrayBuildTime = 0;
		});
		
		// Update documents array from Map (will rebuild cache)
		get().updateDocumentsArray();
		
		// Force garbage collection if available
		if (global.gc) {
			global.gc();
			console.log('[DocumentStore] Force garbage collection completed');
		}
	},
	})),
);
