import React from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet,
  Image,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

const { width } = Dimensions.get('window');

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams();
  
  // Mock document data
  const document = {
    id: id as string,
    uri: 'https://via.placeholder.com/400x600',
    type: 'receipt',
    title: 'Grocery Store Receipt',
    date: new Date(),
    metadata: {
      amount: 45.99,
      organization: 'SuperMart',
      date: '2024-01-15',
      items: [
        { name: 'Milk', price: 4.99 },
        { name: 'Bread', price: 2.99 },
        { name: 'Eggs', price: 3.99 },
      ],
      tax: 5.00,
      total: 45.99,
    }
  };

  const actions = [
    { id: 'share', icon: 'share-outline', label: 'Share' },
    { id: 'export', icon: 'download-outline', label: 'Export' },
    { id: 'delete', icon: 'trash-outline', label: 'Delete', danger: true },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.imageContainer}>
          <Image source={{ uri: document.uri }} style={styles.documentImage} />
        </View>
        
        <View style={styles.contentContainer}>
          <Text style={styles.documentTitle}>{document.title}</Text>
          <Text style={styles.documentDate}>
            {document.metadata.date} • {document.metadata.organization}
          </Text>
          
          <View style={styles.metadataSection}>
            <Text style={styles.sectionTitle}>Extracted Information</Text>
            
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Organization</Text>
              <Text style={styles.metadataValue}>{document.metadata.organization}</Text>
            </View>
            
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Date</Text>
              <Text style={styles.metadataValue}>{document.metadata.date}</Text>
            </View>
            
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Total Amount</Text>
              <Text style={styles.metadataValue}>${document.metadata.total.toFixed(2)}</Text>
            </View>
            
            {document.metadata.items && (
              <>
                <View style={styles.divider} />
                <Text style={styles.subsectionTitle}>Items</Text>
                {document.metadata.items.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                  </View>
                ))}
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Tax</Text>
                  <Text style={styles.itemPrice}>${document.metadata.tax.toFixed(2)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.itemRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>${document.metadata.total.toFixed(2)}</Text>
                </View>
              </>
            )}
          </View>
          
          <View style={styles.actionsContainer}>
            {actions.map(action => (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionButton, action.danger && styles.dangerButton]}
              >
                <Ionicons 
                  name={action.icon as any} 
                  size={24} 
                  color={action.danger ? '#FF3B30' : '#0066FF'} 
                />
                <Text style={[styles.actionLabel, action.danger && styles.dangerLabel]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  documentImage: {
    width: width - 40,
    height: (width - 40) * 1.5,
    resizeMode: 'contain',
  },
  contentContainer: {
    padding: 20,
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  documentDate: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 24,
  },
  metadataSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 12,
  },
  metadataItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metadataLabel: {
    fontSize: 14,
    color: '#666666',
  },
  metadataValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E7',
    marginVertical: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 14,
    color: '#666666',
  },
  itemPrice: {
    fontSize: 14,
    color: '#000000',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
  },
  actionButton: {
    alignItems: 'center',
    padding: 12,
  },
  dangerButton: {
    // Style for danger button if needed
  },
  actionLabel: {
    fontSize: 12,
    color: '#0066FF',
    marginTop: 4,
  },
  dangerLabel: {
    color: '#FF3B30',
  },
});