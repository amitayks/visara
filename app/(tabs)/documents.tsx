import React, { useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet,
  Image,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 48) / 3; // 3 columns with padding

interface Document {
  id: string;
  uri: string;
  type: 'receipt' | 'invoice' | 'id' | 'letter' | 'form' | 'screenshot';
  title: string;
  date: Date;
  metadata?: {
    amount?: number;
    organization?: string;
  };
}

const mockDocuments: Document[] = [
  { id: '1', uri: 'https://via.placeholder.com/150', type: 'receipt', title: 'Grocery Store', date: new Date() },
  { id: '2', uri: 'https://via.placeholder.com/150', type: 'invoice', title: 'Invoice #1234', date: new Date() },
  { id: '3', uri: 'https://via.placeholder.com/150', type: 'id', title: 'Driver License', date: new Date() },
  { id: '4', uri: 'https://via.placeholder.com/150', type: 'letter', title: 'Bank Letter', date: new Date() },
  { id: '5', uri: 'https://via.placeholder.com/150', type: 'form', title: 'Application Form', date: new Date() },
  { id: '6', uri: 'https://via.placeholder.com/150', type: 'screenshot', title: 'Order Confirmation', date: new Date() },
];

export default function DocumentsScreen() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const documentTypes = [
    { id: 'all', label: 'All', icon: 'documents-outline' },
    { id: 'receipt', label: 'Receipts', icon: 'receipt-outline' },
    { id: 'invoice', label: 'Invoices', icon: 'document-text-outline' },
    { id: 'id', label: 'IDs', icon: 'card-outline' },
    { id: 'letter', label: 'Letters', icon: 'mail-outline' },
    { id: 'form', label: 'Forms', icon: 'clipboard-outline' },
  ];

  const filteredDocuments = selectedType && selectedType !== 'all' 
    ? mockDocuments.filter(doc => doc.type === selectedType)
    : mockDocuments;

  const renderDocument = ({ item }: { item: Document }) => (
    <TouchableOpacity
      style={styles.documentItem}
      onPress={() => router.push(`/document/${item.id}`)}
    >
      <Image source={{ uri: item.uri }} style={styles.documentImage} />
      <View style={styles.documentOverlay}>
        <Text style={styles.documentTitle} numberOfLines={1}>{item.title}</Text>
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
      <Ionicons 
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
        data={filteredDocuments}
        renderItem={renderDocument}
        keyExtractor={item => item.id}
        numColumns={3}
        contentContainerStyle={styles.documentsGrid}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={64} color="#CCCCCC" />
            <Text style={styles.emptyText}>No documents found</Text>
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
});