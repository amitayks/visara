import React, { useState, memo } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Document } from './DocumentGrid';

interface DocumentCardProps {
  document: Document;
  onPress: () => void;
  style?: ViewStyle;
  width: number;
}

export const DocumentCard = memo(({
  document,
  onPress,
  style,
  width
}: DocumentCardProps) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const getDocumentIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'receipt':
        return 'receipt-outline';
      case 'invoice':
        return 'document-text-outline';
      case 'id':
        return 'card-outline';
      case 'form':
        return 'clipboard-outline';
      default:
        return 'document-outline';
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatAmount = (amount?: number) => {
    if (!amount) return null;
    return `$${amount.toFixed(2)}`;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.container, { width }, style]}
    >
      <View style={styles.imageContainer}>
        {imageError ? (
          <View style={styles.errorContainer}>
            <Icon name="image-outline" size={32} color="#CCC" />
          </View>
        ) : (
          <>
            <Image
              source={{ uri: document.imageUri }}
              style={[styles.image, { width: width, height: width * 1.4 }]}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
              resizeMode="cover"
            />
            {imageLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#6366F1" />
              </View>
            )}
          </>
        )}
        
        {document.documentType && (
          <View style={styles.typeBadge}>
            <Icon 
              name={getDocumentIcon(document.documentType)} 
              size={12} 
              color="#FFF" 
            />
            <Text style={styles.typeText}>
              {document.documentType}
            </Text>
          </View>
        )}
      </View>
      
      {/* <View style={styles.info}>
        {document.vendor && (
          <Text style={styles.vendor} numberOfLines={1}>
            {document.vendor}
          </Text>
        )}
        
        <View style={styles.metaRow}>
          {document.date && (
            <Text style={styles.date}>
              {formatDate(document.date)}
            </Text>
          )}
          {document.totalAmount && (
            <Text style={styles.amount}>
              {formatAmount(document.totalAmount)}
            </Text>
          )}
        </View>
      </View> */}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: '#F5F5F5',
  },
  image: {
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'capitalize',
  },
  info: {
    padding: 12,
  },
  // vendor: {
  //   fontSize: 14,
  //   fontWeight: '600',
  //   color: '#333',
  //   marginBottom: 4,
  // },
  // metaRow: {
  //   flexDirection: 'row',
  //   justifyContent: 'space-between',
  //   alignItems: 'center',
  // },
  // date: {
  //   fontSize: 12,
  //   color: '#999',
  // },
  // amount: {
  //   fontSize: 14,
  //   fontWeight: '600',
  //   color: '#6366F1',
  // },
});