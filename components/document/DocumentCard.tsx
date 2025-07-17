import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { DocumentModel } from '../../services/database/schema';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with padding

interface DocumentCardProps {
  document: DocumentModel;
  onPress: () => void;
  onLongPress?: () => void;
  showType?: boolean;
  showDate?: boolean;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onPress,
  onLongPress,
  showType = true,
  showDate = true,
}) => {
  const getTypeIcon = (type: DocumentModel['type']) => {
    switch (type) {
      case 'receipt': return 'receipt-outline';
      case 'invoice': return 'document-text-outline';
      case 'id': return 'card-outline';
      case 'letter': return 'mail-outline';
      case 'form': return 'clipboard-outline';
      case 'screenshot': return 'phone-portrait-outline';
      default: return 'document-outline';
    }
  };
  
  const getTypeColor = (type: DocumentModel['type']) => {
    switch (type) {
      case 'receipt': return '#FF6B35';
      case 'invoice': return '#0066FF';
      case 'id': return '#34C759';
      case 'letter': return '#AF52DE';
      case 'form': return '#FF9500';
      case 'screenshot': return '#007AFF';
      default: return '#666666';
    }
  };
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };
  
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: document.uri }}
          style={styles.image}
          contentFit="cover"
          placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          transition={200}
        />
        
        {document.isFavorite && (
          <View style={styles.favoriteIndicator}>
            <Ionicons name="heart" size={16} color="#FF3B30" />
          </View>
        )}
        
        <View style={styles.confidenceIndicator}>
          <View style={[
            styles.confidenceDot,
            { backgroundColor: document.confidenceScore > 0.8 ? '#34C759' : 
                             document.confidenceScore > 0.6 ? '#FF9500' : '#FF3B30' }
          ]} />
        </View>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {document.title}
        </Text>
        
        <View style={styles.metadata}>
          {showType && (
            <View style={styles.typeContainer}>
              <Ionicons 
                name={getTypeIcon(document.type)} 
                size={12} 
                color={getTypeColor(document.type)} 
              />
              <Text style={[styles.typeText, { color: getTypeColor(document.type) }]}>
                {document.type.charAt(0).toUpperCase() + document.type.slice(1)}
              </Text>
            </View>
          )}
          
          {showDate && (
            <Text style={styles.dateText}>
              {formatDate(document.dateTaken)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  imageContainer: {
    position: 'relative',
    height: CARD_WIDTH * 0.75, // 4:3 aspect ratio
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F2F7',
  },
  favoriteIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confidenceIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
    lineHeight: 18,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
  dateText: {
    fontSize: 11,
    color: '#999999',
  },
});