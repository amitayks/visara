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
import { DocumentDetailsModal } from "../components/DocumentModal/DocumentDetailsModal";
import { ScanProgressBar } from "../components/Progress/ScanProgressBar";
import type Document from "../services/database/models/Document";
import { documentStorage } from "../services/database/documentStorage";
import { galleryScanner, type ScanProgress } from "../services/gallery/GalleryScanner";
import { searchService } from "../services/search/simpleSearchService";
import type { RootStackParamList } from "../types/navigation";

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
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

  // Search functionality
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const searchResult = await searchService.search(query);
      setFilteredDocuments(searchResult.documents);
      
      // Add query to the list if it's not already there
      setSearchQueries(prev => {
        const newQueries = prev.filter(q => q !== query);
        return [query, ...newQueries].slice(0, 5); // Keep only last 5 queries
      });
    } catch (error) {
      console.error("Search error:", error);
      Alert.alert("Search Error", "Failed to search documents. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((query: string) => {
    // If query is empty and we have searched before, reset to all documents
    if (!query.trim() && hasSearched) {
      setFilteredDocuments(documents);
      setHasSearched(false);
      setSearchQueries([]);
    }
  }, [documents, hasSearched]);

  const handleRemoveQuery = useCallback((queryToRemove: string) => {
    setSearchQueries(prev => prev.filter(q => q !== queryToRemove));
    
    // If no queries left, reset to all documents
    if (searchQueries.length === 1) {
      setFilteredDocuments(documents);
      setHasSearched(false);
    }
  }, [searchQueries, documents]);

  const handleDocumentPress = useCallback((document: Document) => {
    setSelectedDocument(document);
    setIsModalVisible(true);
  }, []);

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

        <DocumentDetailsModal
          isVisible={isModalVisible}
          document={selectedDocument}
          onClose={handleModalClose}
          onDocumentDeleted={handleDocumentDeleted}
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