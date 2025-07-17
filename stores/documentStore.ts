import { create } from 'zustand';
import { DocumentModel, DocumentMetadataModel } from '../services/database/schema';

interface DocumentStore {
  documents: DocumentModel[];
  filteredDocuments: DocumentModel[];
  selectedType: string | null;
  isLoading: boolean;
  isScanning: boolean;
  scanProgress: number;
  
  // Actions
  setDocuments: (documents: DocumentModel[]) => void;
  addDocument: (document: DocumentModel) => void;
  updateDocument: (id: string, updates: Partial<DocumentModel>) => void;
  removeDocument: (id: string) => void;
  setSelectedType: (type: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsScanning: (scanning: boolean) => void;
  setScanProgress: (progress: number) => void;
  filterDocuments: () => void;
  toggleFavorite: (id: string) => void;
  archiveDocument: (id: string) => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  filteredDocuments: [],
  selectedType: null,
  isLoading: false,
  isScanning: false,
  scanProgress: 0,
  
  setDocuments: (documents) => {
    set({ documents });
    get().filterDocuments();
  },
  
  addDocument: (document) => {
    set((state) => ({
      documents: [...state.documents, document]
    }));
    get().filterDocuments();
  },
  
  updateDocument: (id, updates) => {
    set((state) => ({
      documents: state.documents.map(doc => 
        doc.id === id ? { ...doc, ...updates } : doc
      )
    }));
    get().filterDocuments();
  },
  
  removeDocument: (id) => {
    set((state) => ({
      documents: state.documents.filter(doc => doc.id !== id)
    }));
    get().filterDocuments();
  },
  
  setSelectedType: (type) => {
    set({ selectedType: type });
    get().filterDocuments();
  },
  
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  
  filterDocuments: () => {
    const { documents, selectedType } = get();
    const filtered = selectedType && selectedType !== 'all'
      ? documents.filter(doc => doc.type === selectedType)
      : documents;
    
    set({ filteredDocuments: filtered.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )});
  },
  
  toggleFavorite: (id) => {
    set((state) => ({
      documents: state.documents.map(doc => 
        doc.id === id ? { ...doc, isFavorite: !doc.isFavorite } : doc
      )
    }));
    get().filterDocuments();
  },
  
  archiveDocument: (id) => {
    set((state) => ({
      documents: state.documents.map(doc => 
        doc.id === id ? { ...doc, isArchived: true } : doc
      )
    }));
    get().filterDocuments();
  },
}));