import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { MasonryGrid } from "../components/DocumentGrid/MasonryGrid";
import { BottomSearchBar } from "../components/Search/BottomSearchBar";
import { DocumentDetailsOverlay } from "../components/DocumentModal/DocumentDetailsOverlay";
import { ScanProgressBar } from "../components/Progress/ScanProgressBar";
import type Document from "../services/database/models/Document";
import { documentStorage } from "../services/database/documentStorage";
import { galleryScanner, type ScanProgress } from "../services/gallery/GalleryScanner";
import { SearchOrchestrator } from "../services/search/searchOrchestrator";
import { SearchQueryChips } from "../components/SearchQueryChips";
import type { SearchFilter, ScoredDocument } from "../services/search/advancedSearch/searchTypes";
import { database } from "../services/database";
import type { RootStackParamList } from "../types/navigation";

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [documents, setDocuments] = useState<Document[]>([]);  
  const [searchOrchestrator] = useState(() => new SearchOrchestrator(database));
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilter>({});
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [baseQuery, setBaseQuery] = useState<string>("");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await documentStorage.getAllDocuments();
      // Sort by creation date (newest first)
      const sortedDocs = docs.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setDocuments(sortedDocs);
      
      // Reset filtered documents if no search is active
      if (!hasSearched) {
        setFilteredDocuments(sortedDocs);
      }
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [hasSearched]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadDocuments();
  }, [loadDocuments]);

  // Search functionality with advanced NLP
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      // Check if this is a refinement query (starts with +)
      const isRefinement = query.startsWith("+");
      let searchResult;
      
      if (isRefinement && baseQuery) {
        // Remove the + and search with refinement
        const refinementQuery = query.substring(1).trim();
        searchResult = await searchOrchestrator.searchWithRefinement(
          baseQuery,
          refinementQuery,
          { useSemanticSearch: true, usePhoneticMatching: true }
        );
      } else {
        // Regular search
        searchResult = await searchOrchestrator.search(query, {
          useSemanticSearch: true,
          usePhoneticMatching: true,
          useFuzzyMatching: true,
          maxResults: 50
        });
        setBaseQuery(query);
        searchOrchestrator.clearQueryStack();
      }
      
      // Extract documents from scored results
      const docs = searchResult.documents.map((scored: ScoredDocument) => scored.document);
      setFilteredDocuments(docs);
      setSearchFilters(searchResult.filters);
      setSearchSuggestions(searchResult.suggestions || []);
      
      // Add query to the list if it's not already there
      setSearchQueries(prev => {
        const newQueries = prev.filter(q => q !== query);
        return [query, ...newQueries].slice(0, 5); // Keep only last 5 queries
      });
      
      // Show aggregated data if it's a count query
      if (searchResult.query.intent.includes('count')) {
        const aggregatedData = await searchOrchestrator.getAggregatedData(searchResult.query);
        if (aggregatedData?.count !== undefined) {
          Alert.alert(
            "Search Results",
            `Found ${aggregatedData.count} ${searchResult.query.documentTypes?.[0] || 'documents'}`,
            [{ text: "OK" }]
          );
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      Alert.alert("Search Error", "Failed to search documents. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchOrchestrator, baseQuery]);

  const handleQueryChange = useCallback((query: string) => {
    // If query is empty and we have searched before, reset to all documents
    if (!query.trim() && hasSearched) {
      setFilteredDocuments(documents);
      setHasSearched(false);
      setSearchQueries([]);
      setSearchFilters({});
      setSearchSuggestions([]);
      setBaseQuery("");
      searchOrchestrator.clearQueryStack();
      searchOrchestrator.clearCache();
    }
  }, [documents, hasSearched, searchOrchestrator]);

  const handleRemoveQuery = useCallback((queryToRemove: string) => {
    setSearchQueries(prev => prev.filter(q => q !== queryToRemove));
    
    // If no queries left, reset to all documents
    if (searchQueries.length === 1) {
      setFilteredDocuments(documents);
      setHasSearched(false);
      setSearchFilters({});
      setSearchSuggestions([]);
      setBaseQuery("");
      searchOrchestrator.clearQueryStack();
    }
  }, [searchQueries, documents, searchOrchestrator]);

  // Handle removing individual filter chips
  const handleRemoveChip = useCallback((chipId: string) => {
    // Parse chip ID to determine what to remove
    if (chipId === 'temporal') {
      setSearchFilters(prev => ({ ...prev, temporal: undefined }));
    } else if (chipId === 'amount') {
      setSearchFilters(prev => ({ ...prev, amount: undefined }));
    } else if (chipId.startsWith('vendor-')) {
      const index = parseInt(chipId.split('-')[1]);
      setSearchFilters(prev => ({
        ...prev,
        vendor: prev.vendor?.filter((_, i) => i !== index)
      }));
    } else if (chipId.startsWith('doctype-')) {
      const index = parseInt(chipId.split('-')[1]);
      setSearchFilters(prev => ({
        ...prev,
        documentTypes: prev.documentTypes?.filter((_, i) => i !== index)
      }));
    } else if (chipId.startsWith('keyword-')) {
      const index = parseInt(chipId.split('-')[1]);
      setSearchFilters(prev => ({
        ...prev,
        keywords: prev.keywords?.filter((_, i) => i !== index)
      }));
    }
    
    // Re-run search with updated filters
    if (baseQuery) {
      handleSearch(baseQuery);
    }
  }, [baseQuery, handleSearch]);

  // Clear all filter chips
  const handleClearAllChips = useCallback(() => {
    setSearchFilters({});
    setSearchSuggestions([]);
    searchOrchestrator.clearQueryStack();
    
    // Reset to base query search
    if (baseQuery) {
      handleSearch(baseQuery);
    } else {
      setFilteredDocuments(documents);
      setHasSearched(false);
    }
  }, [baseQuery, handleSearch, documents, searchOrchestrator]);

  // Handle suggestion press
  const handleSuggestionPress = useCallback((suggestion: string) => {
    // Add suggestion as a refinement
    handleSearch(`+ ${suggestion}`);
  }, [handleSearch]);

  const handleDocumentPress = useCallback((documentId: string) => {
    console.log('HomeScreen - Received document ID:', documentId);
    
    // Find the full document object from our state
    // Check both documents and filteredDocuments arrays
    const document = documents.find(doc => doc.id === documentId) || 
                    filteredDocuments.find(doc => doc.id === documentId);
    
    if (document) {
      console.log('HomeScreen - Found document:', document);
      console.log('HomeScreen - Document _raw:', (document as any)?._raw);
      
      // Store the full document object with its _raw data
      setSelectedDocument(document);
      setIsModalVisible(true);
    } else {
      console.error('Document not found:', documentId);
    }
  }, [documents, filteredDocuments]);

  const handleModalClose = useCallback(() => {
    setIsModalVisible(false);
    // Small delay to let modal close animation finish before clearing document
    setTimeout(() => setSelectedDocument(null), 300);
  }, []);

  const handleDocumentDeleted = useCallback((documentId: string) => {
    // Remove from both documents arrays
    setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    setFilteredDocuments(prev => prev.filter(doc => doc.id !== documentId));
  }, []);

  const startBackgroundScan = useCallback(async () => {
    try {
      setIsScanning(true);
      
      // Check permissions first
      const hasPermission = await galleryScanner.hasPermissions();
      if (!hasPermission) {
        const granted = await galleryScanner.requestPermissions();
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Gallery access is needed to scan for documents. Please enable it in settings."
          );
          setIsScanning(false);
          return;
        }
      }

      // Start the scan with progress callback
      await galleryScanner.startScan(
        {
          batchSize: 15,
          smartFilterEnabled: true,
          batterySaver: true,
        },
        (progress) => {
          setScanProgress(progress);
          console.log(`Scan progress: ${progress.processedImages}/${progress.totalImages}`);
        }
      );

      // Refresh documents once scan is complete
      await loadDocuments();
      
    } catch (error) {
      console.error("Background scan error:", error);
      Alert.alert("Scan Error", "Failed to start background scan. Please try again.");
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  }, [loadDocuments]);

  const handleCancelScan = useCallback(async () => {
    try {
      await galleryScanner.stopScan();
      setScanProgress(null);
      setIsScanning(false);
    } catch (error) {
      console.error("Error canceling scan:", error);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Debug effect to monitor selectedDocument
  useEffect(() => {
    console.log('HomeScreen - selectedDocument changed:', selectedDocument);
    if (selectedDocument) {
      console.log('HomeScreen - selectedDocument details:', {
        id: selectedDocument.id,
        documentType: selectedDocument.documentType,
        vendor: selectedDocument.vendor,
        hasRaw: !!(selectedDocument as any)._raw,
      });
    }
  }, [selectedDocument]);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={startBackgroundScan}
        disabled={isScanning}
      >
        {isScanning ? (
          <ActivityIndicator size="small" color="#333333" />
        ) : (
          <Icon name="scan-outline" size={24} color="#333333" />
        )}
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          Alert.alert("Settings", "Settings page not yet implemented");
        }}
      >
        <Icon name="settings-outline" size={24} color="#333333" />
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="document-outline" size={64} color="#CCCCCC" />
      <Text style={styles.emptyTitle}>No Documents Yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the scan button to automatically find documents in your gallery
      </Text>
      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
        onPress={startBackgroundScan}
        disabled={isScanning}
      >
        {isScanning ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.scanButtonText}>Scanning...</Text>
          </>
        ) : (
          <>
            <Icon name="scan-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.scanButtonText}>Start Scan</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066FF" />
          <Text style={styles.loadingText}>Loading documents...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <ScanProgressBar
        isVisible={isScanning && scanProgress !== null}
        currentCount={scanProgress?.processedImages || 0}
        totalCount={scanProgress?.totalImages || 0}
        onCancel={handleCancelScan}
        scanningText="scanning..."
      />
      
      <SafeAreaView style={styles.safeArea}>
        {renderHeader()}
        
        {/* Search Query Chips */}
        {(hasSearched || searchSuggestions.length > 0) && (
          <SearchQueryChips
            baseQuery={baseQuery}
            filters={searchFilters}
            onRemoveChip={handleRemoveChip}
            onClearAll={handleClearAllChips}
            suggestions={searchSuggestions}
            onSuggestionPress={handleSuggestionPress}
          />
        )}
        
        {documents.length === 0 && !hasSearched ? (
        renderEmptyState()
      ) : (
        <MasonryGrid
          documents={filteredDocuments}
          onDocumentPress={handleDocumentPress}
          isLoading={isSearching}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={["#0066FF"]}
              tintColor="#0066FF"
            />
          }
        />
      )}
      
      <BottomSearchBar
        onSearch={handleSearch}
        onQueryChange={handleQueryChange}
        placeholder="Search documents..."
        isSearching={isSearching}
        queries={searchQueries}
        onRemoveQuery={handleRemoveQuery}
      />

        <DocumentDetailsOverlay
          visible={isModalVisible}
          document={selectedDocument}
          onClose={handleModalClose}
          onDelete={async (documentId: string) => {
            await documentStorage.deleteDocument(documentId);
            handleDocumentDeleted(documentId);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  headerButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#666666",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333333",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0066FF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});