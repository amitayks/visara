import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  // SlideInUp,
  // SlideOutDown,
  SlideOutUp,
  // withSpring,
} from 'react-native-reanimated';
import { showToast } from './Toast';
import { Document } from '../gallery/DocumentGrid';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DocumentModalProps {
  visible: boolean;
  document: Document | null;
  onClose: () => void;
  onDelete: (doc: Document) => Promise<void>;
  onShare?: (doc: Document) => void;
}

interface InfoRowProps {
  icon: string;
  label: string;
  value?: string | null;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => {
  if (!value) return null;
  
  return (
    <View style={styles.infoRow}>
      <Icon name={icon} size={20} color="#666" style={styles.infoIcon} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
};

interface ActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, onPress, color }) => (
  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor: `${color}15` }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Icon name={icon} size={24} color={color} />
    <Text style={[styles.actionLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const DocumentSkeleton: React.FC = () => (
  <View style={styles.skeleton}>
    {/* <View style={styles.skeletonImage} /> */}
    <View style={styles.skeletonInfo}>
      <View style={styles.skeletonRow} />
      <View style={styles.skeletonRow} />
      <View style={styles.skeletonRow} />
    </View>
  </View>
);

export const DocumentModal: React.FC<DocumentModalProps> = ({
  visible,
  document,
  onClose,
  onDelete,
  onShare,
}) => {
  const [loading, setLoading] = useState(true);
  // const [imageLoaded, setImageLoaded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  useEffect(() => {
    if (visible && document) {
      setLoading(true);
      // setImageLoaded(false);
      setTimeout(() => setLoading(false), 300);
    }
  }, [visible, document]);

  const handleDelete = async () => {
    if (!document) return;
    
    setDeleting(true);
    try {
      await onDelete(document);
      showToast({
        type: 'success',
        message: 'Document deleted successfully',
        icon: 'checkmark-circle',
      });
      onClose();
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Failed to delete document',
        icon: 'alert-circle',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleShare = async () => {
    if (!document) return;
    
    if (onShare) {
      onShare(document);
    } else {
      try {
        await Share.share({
          message: `Document: ${document.vendor || 'Unknown'}\nType: ${document.documentType}\nDate: ${formatDate(document.date)}`,
          url: document.imageUri,
        });
      } catch (error) {
        showToast({
          type: 'error',
          message: 'Failed to share document',
          icon: 'alert-circle',
        });
      }
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return 'No date';
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return null;
    return `$${amount.toFixed(2)}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(300)}
        style={styles.backdrop}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          entering={SlideInDown.springify().damping(15).stiffness(100)}
          exiting={SlideOutUp.springify().damping(15).stiffness(12)}
          style={styles.container}
        >
          {/* <View style={styles.handle} /> */}
          
          <View style={styles.header}>
            <Text style={styles.title}>Document Details</Text>
            {/* <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#333" />
            </TouchableOpacity> */}
          </View>
          
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <DocumentSkeleton />
            ) : (
              <>
                {/* <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: document?.imageUri }}
                    style={styles.image}
                    onLoad={() => setImageLoaded(true)}
                    resizeMode="contain"
                  />
                  {!imageLoaded && (
                    <ActivityIndicator
                      style={styles.imageLoader}
                      size="large"
                      color="#6366F1"
                    />
                  )}
                </View> */}
                
                <View style={styles.infoSection}>
                  <InfoRow
                    icon="document-text"
                    label="Type"
                    value={document?.documentType}
                  />
                  <InfoRow
                    icon="business"
                    label="Vendor"
                    value={document?.vendor || 'Unknown'}
                  />
                  <InfoRow
                    icon="calendar"
                    label="Date"
                    value={formatDate(document?.date)}
                  />
                  <InfoRow
                    icon="cash"
                    label="Amount"
                    value={formatCurrency(document?.totalAmount)}
                  />
                </View>
                
                <View style={styles.actions}>
                  <ActionButton
                    icon="share-social"
                    label="Share"
                    onPress={handleShare}
                    color="#6366F1"
                  />
                  <ActionButton
                    icon="trash"
                    label="Delete"
                    onPress={handleDelete}
                    color="#EF4444"
                  />
                </View>
              </>
            )}
          </ScrollView>
          
          {deleting && (
            <View style={styles.deletingOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.8,
    minHeight: SCREEN_HEIGHT * 0.5,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  // handle: {
  //   width: 40,
  //   height: 4,
  //   backgroundColor: '#DDD',
  //   borderRadius: 2,
  //   alignSelf: 'center',
  //   marginTop: 12,
  // },
  header: {
    // flexDirection: 'row',
    alignItems: 'center',
    // justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  // closeButton: {
  //   padding: 8,
  // },
  content: {
    flex: 1,
  },
  // imageContainer: {
  //   height: 300,
  //   backgroundColor: '#F5F5F5',
  //   margin: 20,
  //   borderRadius: 12,
  //   overflow: 'hidden',
  //   alignItems: 'center',
  //   justifyContent: 'center',
  // },
  // image: {
  //   width: '100%',
  //   height: '100%',
  // },
  // imageLoader: {
  //   position: 'absolute',
  // },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoIcon: {
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  skeleton: {
    padding: 20,
  },
  skeletonImage: {
    height: 300,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    marginBottom: 20,
  },
  skeletonInfo: {
    gap: 16,
  },
  skeletonRow: {
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});