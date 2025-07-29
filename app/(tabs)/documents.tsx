import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet,
  Image,
  Dimensions,
  RefreshControl,
  Alert,
  Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList, TabParamList } from '../../types/navigation';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { copyToClipboard } from '../../utils/clipboard';
import { documentStorage } from '../../services/database/documentStorage';
import Document from '../../services/database/models/Document';
// Removed date-fns import

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 48) / 3; // 3 columns with padding

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'documents'>,
  StackNavigationProp<RootStackParamList>
>;

export default function DocumentsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  const documentTypes = [
    { id: 'all', label: 'All', icon: 'documents-outline' },
    { id: 'receipt', label: 'Receipts', icon: 'receipt-outline' },
    { id: 'invoice', label: 'Invoices', icon: 'document-text-outline' },
    { id: 'id', label: 'IDs', icon: 'card-outline' },
    { id: 'letter', label: 'Letters', icon: 'mail-outline' },
    { id: 'form', label: 'Forms', icon: 'clipboard-outline' },
    { id: 'screenshot', label: 'Screenshots', icon: 'camera-outline' },
  ];

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [selectedType])
  );

  const loadDocuments = async () => {
    try {
      let docs: Document[];
      if (selectedType && selectedType !== 'all') {
        docs = await documentStorage.getDocumentsByType(selectedType);
      } else {
        docs = await documentStorage.getAllDocuments();
      }
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  }, [selectedType]);

  // copyToClipboard is now imported from utils

  const showDocumentOptions = (doc: Document) => {
    setSelectedDocument(doc);
    const options = ['Copy OCR Text', 'Copy Metadata', 'Share', 'Delete', 'Cancel'];
    
    Alert.alert(
      doc.vendor || 'Document Options',
      `Type: ${doc.documentType}\nConfidence: ${(doc.confidence * 100).toFixed(1)}%`,
      options.map((option, index) => ({
        text: option,
        style: option === 'Delete' ? 'destructive' : option === 'Cancel' ? 'cancel' : 'default',
        onPress: () => handleDocumentOption(option, doc)
      }))
    );
  };

  const handleDocumentOption = async (option: string, doc: Document) => {
    switch (option) {
      case 'Copy OCR Text':
        copyToClipboard(doc.ocrText, 'OCR text');
        break;
      
      case 'Copy Metadata':
        const metadata = {
          vendor: doc.vendor,
          amount: doc.totalAmount,
          currency: doc.currency,
          date: doc.date ? new Date(doc.date).toLocaleDateString() : null,
          fullMetadata: doc.metadata
        };
        copyToClipboard(JSON.stringify(metadata, null, 2), 'Metadata');
        break;
      
      case 'Share':
        try {
          await Share.share({
            message: `Document: ${doc.vendor || 'Unknown'}\n\n${doc.ocrText}`,
            title: doc.vendor || 'Document'
          });
        } catch (error) {
          console.error('Error sharing:', error);
        }
        break;
      
      case 'Delete':
        Alert.alert(
          'Delete Document',
          'Are you sure you want to delete this document?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await documentStorage.deleteDocument(doc.id);
                  await loadDocuments();
                } catch (error) {
                  console.error('Error deleting document:', error);
                  Alert.alert('Error', 'Failed to delete document');
                }
              }
            }
          ]
        );
        break;
    }
  };

  const renderDocument = ({ item }: { item: Document }) => (
    <TouchableOpacity
      style={styles.documentItem}
      onPress={() => navigation.navigate('document/[id]', { id: item.id })}
      onLongPress={() => showDocumentOptions(item)}
    >
      <Image source={{ uri: item.thumbnailUri || item.imageUri }} style={styles.documentImage} />
      <View style={styles.documentOverlay}>
        <Text style={styles.documentTitle} numberOfLines={1}>
          {item.vendor || item.documentType}
        </Text>
        <Text style={styles.documentDate}>
          {new Date(item.processedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      <View style={styles.confidenceBadge}>
        <Text style={styles.confidenceText}>
          {(item.confidence * 100).toFixed(0)}%
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderFilter = ({ item }: { item: typeof documentTypes[0] }) => (
    <TouchableOpacity
      style={[
        styles.filterChip,
        (selectedType === item.id || (!selectedType && item.id === 'all')) && styles.filterChipActive
      ]}
      onPress={() => setSelectedType(item.id === 'all' ? null : item.id)}
    >
      <Icon 
        name={item.icon as any} 
        size={16} 
        color={(selectedType === item.id || (!selectedType && item.id === 'all')) ? '#FFFFFF' : '#666666'} 
      />
      <Text style={[
        styles.filterText,
        (selectedType === item.id || (!selectedType && item.id === 'all')) && styles.filterTextActive
      ]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Documents</Text>
        <Text style={styles.documentCount}>{documents.length} items</Text>
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          data={documentTypes}
          renderItem={renderFilter}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        />
      </View>

      <FlatList
        data={documents}
        renderItem={renderDocument}
        keyExtractor={item => item.id}
        numColumns={3}
        contentContainerStyle={styles.documentsGrid}
        columnWrapperStyle={documents.length > 0 ? styles.row : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="document-outline" size={64} color="#CCCCCC" />
            <Text style={styles.emptyText}>No documents found</Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => navigation.navigate('ocrtest')}
            >
              <Text style={styles.scanButtonText}>Scan Document</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
  },
  documentCount: {
    fontSize: 14,
    color: '#666666',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    marginRight: 8,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: '#0066FF',
  },
  filterText: {
    fontSize: 14,
    color: '#666666',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  documentsGrid: {
    padding: 16,
  },
  row: {
    justifyContent: 'space-between',
  },
  documentItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  documentImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F2F7',
  },
  documentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 4,
  },
  documentTitle: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  documentDate: {
    fontSize: 8,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  confidenceBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 102, 255, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999999',
  },
  scanButton: {
    marginTop: 20,
    backgroundColor: '#0066FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});